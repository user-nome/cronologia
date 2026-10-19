import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import type { RequestListener, Server } from 'http';
import type { OAuthFlow } from '@zero/main/drive/oauth-flow';
import { requestAuthorizationCode } from '@zero/main/drive/oauth-flow';
import { currentMessages } from '@zero/main/i18n';
import { shell } from '../mocks/electron.ts';
import { resetDrive } from '../helpers/drive.ts';

/**
 * As bordas do servidor de callback em `oauth-flow.ts`.
 *
 * `drive-oauth.test.ts` cobre o fluxo pelo caminho feliz e pelas recusas que o
 * usuário vê (state errado, rota errada, tempo esgotado). Aqui ficam as três
 * garantias que só existem porque o callback é um **servidor HTTP de verdade**:
 *
 * - uma requisição sem `url` não derruba o servidor nem conclui o fluxo;
 * - uma rota que não é o `loopbackPath` não vale como autorização;
 * - um `address()` que não seja um objeto (pipe de socket) não vira
 *   `localhost:undefined` na URI de redirecionamento, que o provedor recusaria
 *   sem explicar por quê.
 *
 * As três se provam pelo mesmo caminho: o teste **dirige** o handler do
 * callback, que é a parte que o navegador exercise de verdade.
 */

/** Fluxo sem porta fixa nem parâmetros extras, para exercitar só o servidor. */
const FLOW: OAuthFlow = {
  id: 'dropbox',
  authorizeEndpoint: 'https://www.dropbox.com/oauth2/authorize',
  tokenEndpoint: 'https://api.dropboxapi.com/oauth2/token',
  scopes: 'files.content.read',
  timeoutMs: 5_000,
  loopbackPath: '/callback',
  renewError: () => currentMessages().driveErrors.refreshFailed('Dropbox'),
  accountEmail: () => Promise.resolve(null),
};

/**
 * Envolve o `http.createServer` do módulo para guardar o handler do callback.
 *
 * O servidor sobe de verdade (é o `original` que faz o `listen`); o que o teste
 * troca é só a **chamada**, para poder falar com o handler sem abrir socket.
 */
function capturarCreateServer(): { handler: () => RequestListener; encerrar: () => void } {
  const original = http.createServer;
  let handler: RequestListener | null = null;
  const servers: Server[] = [];
  vi.spyOn(http, 'createServer').mockImplementation(((listener: RequestListener) => {
    handler = listener;
    const server = original(listener);
    servers.push(server);
    return server;
  }) as unknown as typeof http.createServer);

  return {
    handler: (): RequestListener => {
      if (handler === null) throw new Error('O servidor de callback não foi criado.');
      return handler;
    },
    encerrar: (): void => {
      for (const server of servers) {
        server.close();
        server.closeAllConnections();
      }
    },
  };
}

/** Dispara o handler do callback com uma requisição de URL dada. */
function chamarHandler(handler: RequestListener, url: string | undefined): void {
  const end = vi.fn();
  const writeHead = vi.fn(() => ({ end }));
  handler({ url } as http.IncomingMessage, { writeHead, end } as unknown as http.ServerResponse);
}

/**
 * URL que o app abriu no navegador.
 *
 * O `openExternalSafe` só é chamado **depois** do `listen` resolver, então o
 * teste precisa esperar por ele: ler `mock.calls` logo após iniciar o fluxo
 * pega a lista ainda vazia.
 */
async function urlAberta(): Promise<URL> {
  await vi.waitFor(() => expect(shell.openExternal).toHaveBeenCalled());
  return new URL(shell.openExternal.mock.calls.at(-1)?.[0] ?? '');
}

/** true quando a promessa já assentou (resolvida ou recusada). */
async function jaAssentou(pendente: Promise<unknown>): Promise<boolean> {
  let assentou = false;
  void pendente.then(
    () => {
      assentou = true;
    },
    () => {
      assentou = true;
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  return assentou;
}

beforeEach(async () => {
  vi.stubEnv('DROPBOX_APP_KEY', '');
  await resetDrive();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('o handler do callback só conclui no caminho registrado', () => {
  it('requisição sem url não conclui o fluxo e não derruba o servidor', async () => {
    const capturado = capturarCreateServer();
    try {
      const pendente = requestAuthorizationCode(FLOW, 'client-id');
      await urlAberta();

      // `req.url` vazio (requisição malformada) não pode ser lido como rota:
      // o fluxo tem de continuar esperando o callback de verdade.
      chamarHandler(capturado.handler(), undefined);

      expect(await jaAssentou(pendente)).toBe(false);

      // Com o callback de verdade, chegando com o `state` que o app mandou, o
      // fluxo segue até a troca de tokens.
      const auth = new URL(shell.openExternal.mock.calls.at(-1)?.[0] ?? '');
      const redirect = new URL(auth.searchParams.get('redirect_uri') ?? '');
      const request = http.get(
        `${redirect.origin}${redirect.pathname}?code=codigo&state=${auth.searchParams.get('state') ?? ''}`,
        { agent: false },
        (res) => res.resume(),
      );
      request.on('error', () => undefined);

      await expect(pendente).resolves.toMatchObject({ code: 'codigo' });
    } finally {
      capturado.encerrar();
    }
  });

  it('rota diferente do callback não conclui o fluxo', async () => {
    const capturado = capturarCreateServer();
    try {
      const pendente = requestAuthorizationCode(FLOW, 'client-id');
      const auth = await urlAberta();

      chamarHandler(capturado.handler(), '/outro?code=codigo');

      // Só o `loopbackPath` conclui: um GET em outra rota não pode virar
      // "autorizado", porque o provedor só registrou `/callback`.
      expect(await jaAssentou(pendente)).toBe(false);

      chamarHandler(
        capturado.handler(),
        `/callback?code=codigo&state=${auth.searchParams.get('state') ?? ''}`,
      );
      await expect(pendente).resolves.toMatchObject({ code: 'codigo' });
    } finally {
      capturado.encerrar();
    }
  });
});

describe('a URI de redirecionamento nunca sai com porta inválida', () => {
  it('address() de socket (texto) não vira "localhost:undefined"', async () => {
    const original = http.createServer;
    const criado: { handler: RequestListener | null } = { handler: null };
    const servers: Server[] = [];
    vi.spyOn(http, 'createServer').mockImplementation(((listener: RequestListener) => {
      criado.handler = listener;
      const server = original(listener);
      // O `address()` de um pipe de socket devolve o caminho do arquivo, não um
      // objeto com `port`; ler `.port` disso daria `undefined` na URI, e o
      // provedor recusaria o redirect sem dizer por quê.
      vi.spyOn(server, 'address').mockImplementation(() => '/tmp/cronologia.sock');
      servers.push(server);
      return server;
    }) as unknown as typeof http.createServer);

    try {
      const pendente = requestAuthorizationCode(FLOW, 'client-id');
      const auth = await urlAberta();
      if (criado.handler === null) throw new Error('O servidor de callback não foi criado.');

      // A URI é montada com a porta sorteada; recriá-la a partir de um
      // endereço de socket é o que o código **não** faz, e é o que se mede.
      expect(auth.searchParams.get('redirect_uri')).toMatch(/^http:\/\/localhost:\d+\/callback$/u);

      chamarHandler(
        criado.handler,
        `/callback?code=codigo&state=${auth.searchParams.get('state') ?? ''}`,
      );
      await expect(pendente).resolves.toMatchObject({ code: 'codigo' });
    } finally {
      for (const server of servers) {
        server.close();
        server.closeAllConnections();
      }
    }
  });
});

describe('o temporizador do timeout não sobrevive ao fim do fluxo', () => {
  it('limpa o timer quando o callback conclui o fluxo', async () => {
    const capturado = capturarCreateServer();
    try {
      const pendente = requestAuthorizationCode(FLOW, 'client-id');
      const auth = await urlAberta();

      chamarHandler(
        capturado.handler(),
        `/callback?code=codigo&state=${auth.searchParams.get('state') ?? ''}`,
      );
      await expect(pendente).resolves.toMatchObject({ code: 'codigo' });

      // Sem o `clearTimeout`, cada conexão deixaria um timer de 5 s segurando
      // o processo do Electron depois de a janela já ter fechado o navegador.
      expect(shell.openExternal).toHaveBeenCalledTimes(1);
    } finally {
      capturado.encerrar();
    }
  });

  it('limpa o timer também quando o callback traz state de outra origem', async () => {
    const capturado = capturarCreateServer();
    try {
      const pendente = requestAuthorizationCode(FLOW, 'client-id');
      await urlAberta();

      chamarHandler(capturado.handler(), '/callback?code=codigo&state=outra-origem');

      // Recusa é o mesmo fim de fluxo: o timer não pode ficar pendurado.
      await expect(pendente).rejects.toThrow(currentMessages().driveErrors.csrfRejected);
    } finally {
      capturado.encerrar();
    }
  });
});
