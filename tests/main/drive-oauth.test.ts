import http from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tokens } from '@zero/main/drive/state';
import {
  DROPBOX_LOOPBACK_PORT as LOOPBACK_PORT,
  DROPBOX_REDIRECT_URI as REDIRECT_URI,
  DROPBOX_SCOPES as SCOPES,
} from '@zero/main/drive/providers/dropbox/constants';
import {
  accessToken,
  authorize,
  missingScopes,
  refreshAccessToken,
} from '@zero/main/drive/providers/dropbox/session';
import { getStatus, state } from '@zero/main/drive/state';
import { currentMessages } from '@zero/main/i18n';
import { saveSettings } from '@zero/main/settings';
import { lockVault } from '@zero/main/vault';
import {
  ACCOUNT_ENDPOINT,
  APP_KEY,
  TOKEN_ENDPOINT,
  json,
  resetDrive,
  stubFetch,
} from '../helpers/drive.ts';
import { shell } from '../mocks/electron.ts';

vi.mock('@zero/main/drive/providers/dropbox/constants', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@zero/main/drive/providers/dropbox/constants')>();
  return { ...actual, DROPBOX_AUTH_TIMEOUT_MS: 2_000 };
});

/** Deixa a chave de aplicativo gravada no cofre (a janela manda `''`, o teste grava). */
function comChave(passphrase = ''): void {
  saveSettings({
    driveClientId: APP_KEY,
    drivePassphrase: passphrase,
    backupProvider: 'dropbox',
    language: 'pt-BR',
  });
}

function semChave(): void {
  saveSettings({
    driveClientId: '',
    drivePassphrase: '',
    backupProvider: 'dropbox',
    language: 'pt-BR',
  });
}

/**
 * Responde no callback loopback com a query dada, como o navegador faria.
 *
 * `agent: false` dá uma conexão nova por resposta: o pool keep-alive do agente
 * global sobrevive entre testes e reaproveitaria o socket que o app acabou de
 * destruir, o que vira "socket hang up" em vez de uma resposta.
 */
function responderNoCallback(query: string, state?: string): void {
  shell.openExternal.mockImplementationOnce((url: string): Promise<void> => {
    const params = new URL(url).searchParams;
    const redirect = params.get('redirect_uri');
    if (redirect !== null) {
      // O `state` volta na query, como o provedor faz: é o que liga o callback ao
      // pedido que este processo fez, e o app sorteia um valor novo a cada
      // tentativa. O segundo argumento existe para o caso de teste que precisa
      // devolver um `state` de outra origem.
      abrir(redirect, `${query}&state=${state ?? params.get('state') ?? ''}`);
    }
    return Promise.resolve();
  });
}

function abrir(url: string, query: string): void {
  const request = http.get(`${url}?${query}`, { agent: false }, (res) => res.resume());
  request.on('error', () => undefined);
}

/**
 * Prende a porta fixa do App Console e devolve o servidor, ou `null` quando ela
 * **já** estava presa.
 *
 * O `null` não é falha: o estado que o teste exercita é "a porta está ocupada",
 * e o servidor de um `authorize()` anterior ainda pode estar fechando (o módulo
 * só o derruba depois de responder o callback). Ocupar a porta de novo seria
 * competir com ele por `EADDRINUSE` e reprovar um teste cujo motivo não tem
 * nada com o que ele verifica.
 */
async function ocuparPortaFixa(): Promise<http.Server | null> {
  const servidor = http.createServer();
  return new Promise<http.Server | null>((resolve) => {
    servidor.once('error', () => resolve(null));
    servidor.listen(LOOPBACK_PORT, '127.0.0.1', () => resolve(servidor));
  });
}

/** URL de autorização que o app realmente abriu no navegador. */
function urlAberta(): URL {
  const url = shell.openExternal.mock.calls.at(-1)?.[0] ?? '';
  return new URL(url);
}

/** Troca de código por tokens bem-sucedida, com o corpo ajustado pelo teste. */
function stubTroca(overrides: Record<string, unknown> = {}): void {
  stubFetch((call) => {
    if (call.url === TOKEN_ENDPOINT) {
      return json({
        access_token: 'token-inicial',
        refresh_token: 'refresh-inicial',
        expires_in: 3600,
        scope: SCOPES,
        ...overrides,
      });
    }
    if (call.url === ACCOUNT_ENDPOINT) return json({ email: 'leitor@example.com' });
    return json({ error_summary: 'rota_desconhecida' }, 500);
  });
}

function tokenEmMemoria(ajustes: Partial<Tokens> = {}): Tokens {
  return {
    accessToken: 'token-em-memoria',
    refreshToken: 'refresh-em-memoria',
    expiresAt: Date.now() + 3_600_000,
    accountEmail: 'leitor@example.com',
    lastSync: null,
    scopeVersion: 3,
    ...ajustes,
  };
}

beforeEach(async () => {
  vi.stubEnv('DROPBOX_APP_KEY', '');
  await resetDrive();
});

describe('authorize: o state do callback', () => {
  it('recusa o código quando o state não é o do pedido', async () => {
    comChave();
    // O `state` é a defesa contra um callback de outra origem (outra aba, outro
    // pedido): o PKCE já impediria a troca, e recusar aqui evita responder
    // "pronto" a quem não fez este pedido.
    responderNoCallback('code=codigo-valido', 'state-de-outra-origem');
    stubTroca();

    const result = await authorize();

    expect(result).toEqual({
      ok: false,
      error: currentMessages().driveErrors.csrfRejected,
    });
    // Recusado antes de qualquer chamada de rede: não houve troca de token.
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('authorize: as duas portas de entrada', () => {
  it('sem chave do aplicativo não abre o navegador', async () => {
    semChave();

    const result = await authorize();

    expect(result).toEqual({
      ok: false,
      error: currentMessages().driveErrors.configureAppKey,
    });
    expect(shell.openExternal).not.toHaveBeenCalled();
    expect(getStatus().lastError).toBe(currentMessages().driveErrors.configureAppKey);
  });

  it('sem cofre aberto não começa o fluxo (o token só vive no cofre)', async () => {
    // A chave vem do ambiente de build; o que barra este fluxo é o cofre.
    vi.stubEnv('DROPBOX_APP_KEY', 'chave-do-build');
    lockVault();

    const result = await authorize();

    expect(result).toEqual({ ok: false, error: currentMessages().vault.errors.vaultLocked });
    expect(shell.openExternal).not.toHaveBeenCalled();
    expect(getStatus().connected).toBe(false);
  });
});

describe('authorize: o navegador e o callback loopback', () => {
  it('abre a tela de consentimento com PKCE, offline e a porta fixa', async () => {
    comChave();
    responderNoCallback('error=access_denied');

    const result = await authorize();

    expect(result).toEqual({ ok: false, error: 'access_denied' });
    const params = urlAberta().searchParams;
    expect(params.get('client_id')).toBe(APP_KEY);
    expect(params.get('response_type')).toBe('code');
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(params.get('scope')).toBe(SCOPES);
    expect(params.get('token_access_type')).toBe('offline');
    // Cliente público: o segredo do app nunca aparece.
    expect(params.get('client_secret')).toBeNull();
    expect(urlAberta().origin).toBe('https://www.dropbox.com');
  });

  it('cai para uma porta livre quando a porta fixa do App Console está ocupada', async () => {
    comChave();
    const bloqueador = await ocuparPortaFixa();
    try {
      responderNoCallback('error=access_denied');

      const result = await authorize();

      // O fluxo continua utilizável (a troca de token é que vai recusar o
      // redirect, porque a URI cadastrada no Dropbox é a da porta fixa).
      expect(result.ok).toBe(false);
      const redirect = urlAberta().searchParams.get('redirect_uri') ?? '';
      expect(redirect).not.toBe(REDIRECT_URI);
      expect(redirect).toMatch(/^http:\/\/localhost:\d+\/callback$/u);
    } finally {
      bloqueador?.close();
      bloqueador?.closeAllConnections();
    }
  });

  it('rota que não é o callback leva 404 e não conclui o fluxo', async () => {
    comChave();
    stubTroca();
    shell.openExternal.mockImplementationOnce((url: string): Promise<void> => {
      const params = new URL(url).searchParams;
      const redirect = params.get('redirect_uri');
      if (redirect !== null) {
        const base = redirect.replace('/callback', '');
        // A rota errada tem que ser ignorada, e o `/callback` logo depois é o
        // que conclui o fluxo: por isso os dois vão, com o `state` só no segundo.
        abrir(`${base}/outro`, '');
        abrir(redirect, `code=codigo-valido&state=${params.get('state') ?? ''}`);
      }
      return Promise.resolve();
    });

    expect(await authorize()).toEqual({ ok: true });
    expect(getStatus().connected).toBe(true);
  });

  it('callback sem código e sem erro é cancelamento, não sucesso', async () => {
    comChave();
    responderNoCallback('');

    const result = await authorize();

    expect(result).toEqual({ ok: false, error: currentMessages().driveErrors.authCancelled });
    expect(getStatus().connected).toBe(false);
  });

  it('a descrição do erro manda no código do erro', async () => {
    comChave();
    responderNoCallback('error=access_denied&error_description=O+leitor+negou');

    const result = await authorize();

    expect(result).toEqual({ ok: false, error: 'O leitor negou' });
  });

  it('sem callback até o fim da espera, desiste em vez de ficar pendurado', async () => {
    comChave();

    const result = await authorize();

    expect(result).toEqual({ ok: false, error: currentMessages().driveErrors.tokenTimeout });
    expect(getStatus().connected).toBe(false);
  });
});

describe('troca do código por tokens', () => {
  it('conecta, grava o e-mail e persiste no cofre', async () => {
    comChave();
    responderNoCallback('code=codigo-valido');
    stubTroca();

    const result = await authorize();

    expect(result).toEqual({ ok: true });
    expect(getStatus()).toMatchObject({
      connected: true,
      accountEmail: 'leitor@example.com',
      lastError: null,
    });
  });

  it('escopo vazio ou ausente não vira exigência de permissão', async () => {
    for (const body of [{ scope: '' }, { scope: undefined }]) {
      state.tokens = null;
      comChave();
      responderNoCallback('code=codigo-valido');
      stubTroca(body);

      expect(await authorize()).toEqual({ ok: true });
      expect(getStatus().connected).toBe(true);
    }
  });

  it('concessão parcial é recusada com a lista do que falta', async () => {
    comChave();
    responderNoCallback('code=codigo-valido');
    stubTroca({ scope: 'account_info.read files.content.read' });

    const result = await authorize();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Faltam permissões no app Dropbox');
    expect(result.error).toContain('files.metadata.read');
    expect(getStatus().connected).toBe(false);
  });

  it('status de erro do provedor vira mensagem com o código_http', async () => {
    comChave();
    responderNoCallback('code=codigo-valido');
    stubFetch(() => json({ error: 'invalid_grant' }, 400));

    const result = await authorize();

    expect(result).toEqual({ ok: false, error: 'Falha ao obter tokens (400).' });
  });

  const invalidas: [string, unknown][] = [
    ['texto solto', '"token"'],
    ['nulo', null],
    ['lista', []],
    ['sem access_token', { expires_in: 3600 }],
    ['sem expires_in', { access_token: 'a' }],
    ['access_token não é texto', { access_token: 7, expires_in: 3600 }],
    ['expires_in não é número', { access_token: 'a', expires_in: '3600' }],
    ['scope não é texto', { access_token: 'a', expires_in: 1, scope: 3 }],
    ['refresh_token não é texto', { access_token: 'a', expires_in: 1, refresh_token: 5 }],
  ];

  it.each(invalidas)('resposta de token %s é recusada (falha fechada)', async (_rotulo, body) => {
    comChave();
    responderNoCallback('code=codigo-valido');
    stubFetch((call) => (call.url === TOKEN_ENDPOINT ? json(body) : json({}, 500)));

    const result = await authorize();

    expect(result).toEqual({ ok: false, error: 'Resposta de tokens inválida (200).' });
    expect(getStatus().connected).toBe(false);
  });

  it('refresh_token ausente ou indefinido é aceito (sessão sem renovação)', async () => {
    for (const body of [{}, { refresh_token: undefined }]) {
      state.tokens = null;
      comChave();
      responderNoCallback('code=codigo-valido');
      stubTroca(body);

      expect(await authorize()).toEqual({ ok: true });
    }
  });
});

describe('e-mail da conta é acessório, não requisito', () => {
  async function autorizarCom(conta: (call: { url: string }) => Response): Promise<void> {
    comChave();
    responderNoCallback('code=codigo-valido');
    stubFetch((call) => {
      if (call.url === TOKEN_ENDPOINT) {
        return json({
          access_token: 'token-inicial',
          refresh_token: 'refresh-inicial',
          expires_in: 3600,
          scope: SCOPES,
        });
      }
      return conta(call);
    });
    expect(await authorize()).toEqual({ ok: true });
  }

  it('provedor recusando a conta não derruba a conexão', async () => {
    await autorizarCom(() => json({ error_summary: 'expired_access' }, 401));

    expect(getStatus()).toMatchObject({ connected: true, accountEmail: null });
  });

  it('resposta sem e-mail (ou com e-mail de outro tipo) vira null', async () => {
    for (const corpo of [{ account_id: 'conta-1' }, { email: 42 }]) {
      state.tokens = null;
      await autorizarCom(() => json(corpo));

      expect(getStatus()).toMatchObject({ connected: true, accountEmail: null });
    }
  });

  it('rede caída ao buscar o e-mail não derruba a conexão', async () => {
    comChave();
    responderNoCallback('code=codigo-valido');
    stubFetch((call) => {
      if (call.url === TOKEN_ENDPOINT) {
        return json({
          access_token: 'token-inicial',
          refresh_token: 'refresh-inicial',
          expires_in: 3600,
          scope: SCOPES,
        });
      }
      throw new Error('ECONNRESET');
    });

    expect(await authorize()).toEqual({ ok: true });
    expect(getStatus()).toMatchObject({ connected: true, accountEmail: null });
  });
});

describe('a sessão só vale depois de gravada', () => {
  it('cofre que trava no meio do fluxo não deixa a conta conectada', async () => {
    comChave();
    responderNoCallback('code=codigo-valido');
    stubFetch((call) => {
      if (call.url === TOKEN_ENDPOINT) {
        return json({
          access_token: 'token-inicial',
          refresh_token: 'refresh-inicial',
          expires_in: 3600,
          scope: SCOPES,
        });
      }
      // O cofre fecha entre a troca de tokens e a gravação da sessão.
      lockVault();
      return json({ email: 'leitor@example.com' });
    });

    const result = await authorize();

    expect(result).toEqual({ ok: false, error: currentMessages().vault.errors.vaultLocked });
    expect(state.tokens).toBeNull();
    expect(getStatus().connected).toBe(false);
  });
});

describe('escopos concedidos', () => {
  it('sem escopos informados não há o que exigir', () => {
    expect(missingScopes(undefined)).toEqual([]);
  });

  it('concessão vazia exige todos os escopos do catálogo', () => {
    expect(missingScopes('')).toEqual(SCOPES.split(' '));
  });

  it('concessão completa não exige nada', () => {
    expect(missingScopes(SCOPES)).toEqual([]);
  });

  it('concessão parcial exige só o que falta, na ordem do catálogo', () => {
    expect(missingScopes('files.content.read  account_info.read')).toEqual([
      'files.metadata.read',
      'files.metadata.write',
      'files.content.write',
    ]);
  });
});

describe('renovação e leitura do token', () => {
  beforeEach(() => {
    comChave('frase-secreta');
  });

  it('sem chave do aplicativo a renovação nem é tentada', async () => {
    state.tokens = tokenEmMemoria();
    semChave();
    vi.stubEnv('DROPBOX_APP_KEY', '');

    await expect(refreshAccessToken()).rejects.toThrow(
      currentMessages().driveErrors.configureAppKey,
    );
  });

  it('sem refresh token gravado a renovação é recusada', async () => {
    for (const tokens of [
      tokenEmMemoria({ refreshToken: undefined }),
      tokenEmMemoria({ refreshToken: '' }),
    ]) {
      state.tokens = tokens;
      await expect(refreshAccessToken()).rejects.toThrow(
        currentMessages().driveErrors.sessionExpired('Dropbox'),
      );
    }
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('renovar troca o token e estende a validade sem perder a conta', async () => {
    const tokens = tokenEmMemoria({ expiresAt: Date.now() - 1_000 });
    state.tokens = tokens;
    stubFetch((call) =>
      call.url === TOKEN_ENDPOINT
        ? json({ access_token: 'token-renovado', expires_in: 900 })
        : json({}, 500),
    );

    const token = await refreshAccessToken();

    expect(token).toBe('token-renovado');
    expect(tokens.accessToken).toBe('token-renovado');
    expect(tokens.expiresAt).toBeGreaterThan(Date.now() + 800_000);
    expect(tokens.accountEmail).toBe('leitor@example.com');
  });

  it('provedor recusando ou respondendo fora da forma não mexe na sessão', async () => {
    for (const resposta of [
      () => json({ error: 'invalid_grant' }, 400),
      () => json({ nada: 'aqui' }),
    ]) {
      const tokens = tokenEmMemoria({ accessToken: 'token-que-fica' });
      state.tokens = tokens;
      stubFetch(() => resposta());

      await expect(refreshAccessToken()).rejects.toThrow(
        currentMessages().driveErrors.refreshFailed('Dropbox'),
      );
      expect(tokens.accessToken).toBe('token-que-fica');
    }
  });

  it('conta desconectada no meio da renovação não volta sozinha', async () => {
    state.tokens = tokenEmMemoria();
    stubFetch(() => {
      state.tokens = null;
      return json({ access_token: 'token-renovado', expires_in: 900 });
    });

    await expect(refreshAccessToken()).rejects.toThrow(
      currentMessages().driveErrors.noAccount('Dropbox'),
    );
    expect(state.tokens).toBeNull();
  });

  it('accessToken sem conta conectada recusa', async () => {
    state.tokens = null;

    await expect(accessToken()).rejects.toThrow(currentMessages().driveErrors.noAccount('Dropbox'));
  });

  it('accessToken válido sai da memória, sem tocar a rede', async () => {
    state.tokens = tokenEmMemoria();
    const chamadas = stubFetch(() => json({}, 500));

    expect(await accessToken()).toBe('token-em-memoria');
    expect(chamadas).toHaveLength(0);
  });

  it('accessToken a menos de um minuto de expirar renova antes de usar', async () => {
    const tokens = tokenEmMemoria({ expiresAt: Date.now() + 30_000 });
    state.tokens = tokens;
    const chamadas = stubFetch(() => json({ access_token: 'token-renovado', expires_in: 900 }));

    expect(await accessToken()).toBe('token-renovado');
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.url).toBe(TOKEN_ENDPOINT);
  });
});
