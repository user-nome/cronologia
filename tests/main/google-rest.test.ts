import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchCall } from '../helpers/drive.ts';
import {
  deleteFile,
  downloadFile,
  listAppFiles,
  uploadFile,
} from '@zero/main/drive/providers/google/rest';
import {
  googleAccessToken,
  googleAuthorize,
  googleRenewAccessToken,
} from '@zero/main/drive/providers/google/session';
import { googleDriveProvider } from '@zero/main/drive/providers/google/provider';
import { GOOGLE_SCOPE_VERSION } from '@zero/main/drive/providers/google/constants';
import { state } from '@zero/main/drive/state';
import { lockVault } from '@zero/main/vault';
import { currentMessages } from '@zero/main/i18n';
import { json, resetDrive, stubFetch } from '../helpers/drive.ts';
import { openTestVault } from '../helpers/vault.ts';

/**
 * Os cantos do REST do Google Drive que a suíte do contrato não alcança.
 *
 * `google-drive.test.ts` fixa o comportamento observável (paginação, multipart,
 * PATCH, 404 contado como "já não está lá"). Aqui ficam as **defesas**: cada
 * campo que a API pode devolver fora do contrato, o corpo grande demais que não
 * pode inundar a barra de status, o backup que apaga o duplicado, e os dois
 * caminhos em que a sessão não pode sobreviver (cofre trancando no meio da
 * gravação e erro qualquer vindo do fluxo).
 */

const CHAVE = '123.apps.googleusercontent.com';
const SEGREDO = 'GOCSPX-segredo-de-teste';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const INVALIDA = currentMessages().driveErrors.invalidListResponse('Google Drive');

/** Sessão do Google montada direto no estado em memória. */
function fakeSession(overrides: Partial<NonNullable<typeof state.tokens>> = {}): void {
  state.tokens = {
    accessToken: 'token-google',
    refreshToken: 'refresh-google',
    expiresAt: Date.now() + 3_600_000,
    accountEmail: null,
    lastSync: null,
    scopeVersion: GOOGLE_SCOPE_VERSION,
    ...overrides,
  };
}

function driveFile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'id-do-drive',
    name: 'biblioteca.enc',
    modifiedTime: '2026-03-01T10:00:00.000Z',
    size: '128',
    ...overrides,
  };
}

beforeEach(async () => {
  vi.stubEnv('GOOGLE_CLIENT_ID', CHAVE);
  vi.stubEnv('GOOGLE_CLIENT_SECRET', SEGREDO);
  state.provider = 'google-drive';
  await resetDrive();
  fakeSession();
});

afterEach(() => {
  vi.unstubAllEnvs();
  state.provider = 'dropbox';
});

describe('toRemoteFile: o `size` que o Drive devolve como texto', () => {
  it('omite o tamanho quando o número não cabe em inteiro seguro', async () => {
    stubFetch(() => json({ files: [driveFile({ size: '99999999999999999999' })] }));

    const files = await listAppFiles();

    // Um `size` inventado seria usado para conferir o backup; melhor não tê-lo
    // do que tê-lo errado.
    expect(files[0]?.size).toBeUndefined();
  });

  it('aceita `size` zero, que é arquivo vazio e não campo ausente', async () => {
    stubFetch(() => json({ files: [driveFile({ size: '0' })] }));

    const files = await listAppFiles();

    expect(files[0]?.size).toBe(0);
  });

  it('recusa `size` com sinal, decimal ou espaço (o formato do Drive é só dígitos)', async () => {
    for (const size of ['-1', '1.5', ' 128', '+128', '01', '']) {
      stubFetch(() => json({ files: [driveFile({ size })] }));

      await expect(listAppFiles()).rejects.toThrow(INVALIDA);
    }
  });

  it('recusa `size` que não é texto, mesmo vindo do campo opcional', async () => {
    stubFetch(() => json({ files: [driveFile({ size: 128 })] }));

    await expect(listAppFiles()).rejects.toThrow(INVALIDA);
  });

  it('recusa `id` e `name` que não são texto', async () => {
    for (const campo of ['id', 'name']) {
      stubFetch(() => json({ files: [driveFile({ [campo]: 7 })] }));

      await expect(listAppFiles()).rejects.toThrow(INVALIDA);
    }
  });

  it('recusa `modifiedTime` que é data que não existe no calendário', async () => {
    // `Date.parse` é leniente com muita coisa, mas não com mês 13.
    stubFetch(() => json({ files: [driveFile({ modifiedTime: '2026-13-45T99:99:99Z' })] }));

    await expect(listAppFiles()).rejects.toThrow(INVALIDA);
  });

  it('recusa entrada que é lista dentro da lista de arquivos', async () => {
    stubFetch(() => json({ files: [['id', 'name']] }));

    await expect(listAppFiles()).rejects.toThrow(INVALIDA);
  });
});

describe('listAppFiles: a resposta inteira fora do contrato', () => {
  it('recusa quando `files` não é lista', async () => {
    stubFetch(() => json({ files: { '0': driveFile() } }));

    await expect(listAppFiles()).rejects.toThrow(INVALIDA);
  });

  it('corpo não-JSON falha em vez de virar listagem vazia', async () => {
    stubFetch(() => new Response('<html>erro do proxy</html>', { status: 200 }));

    // O `parseJson` devolve o erro do parser: o ponto é que a listagem **não**
    // devolve `[]` em silêncio, que é como um backup apagaria o acervo inteiro
    // como órfão.
    await expect(listAppFiles()).rejects.toThrow();
  });

  it('o `fields` pedido traz o tamanho e o cursor, senão a paginação cega', async () => {
    const calls = stubFetch(() => json({ files: [] }));

    await listAppFiles();

    const url = new URL(calls[0]?.url ?? '');
    expect(url.searchParams.get('fields')).toBe('nextPageToken,files(id,name,modifiedTime,size)');
    expect(url.searchParams.get('pageSize')).toBe('1000');
    // A primeira página não leva `pageToken`: enviá-lo vazio faz a API recusar.
    expect(url.searchParams.has('pageToken')).toBe(false);
  });
});

describe('uploadFile: o backup duplicado é apagado depois do novo', () => {
  it('apaga os homônimos além do primeiro, para não deixar cópias órfãs', async () => {
    const calls = stubFetch((call: FetchCall) => {
      if (call.url.startsWith(`${DRIVE}/files?`)) {
        return json({
          files: [
            driveFile({ id: 'primeiro', name: 'biblioteca.enc' }),
            driveFile({ id: 'duplicado-1', name: 'biblioteca.enc' }),
            driveFile({ id: 'duplicado-2', name: 'biblioteca.enc' }),
            driveFile({ id: 'outro-nome', name: 'capa.enc' }),
          ],
        });
      }
      return json({ id: 'primeiro' });
    });

    await uploadFile('biblioteca.enc', Buffer.from('cifrado'));

    const apagados = calls
      .filter((call) => call.init.method === 'DELETE')
      .map((call) => new URL(call.url).pathname)
      .sort();
    // Só o que tinha o mesmo nome: `capa.enc` é outro arquivo e fica.
    expect(apagados).toEqual(['/drive/v3/files/duplicado-1', '/drive/v3/files/duplicado-2']);
  });

  it('atualiza pelo primeiro homônimo e preserva o conteúdo anterior até confirmar', async () => {
    const calls = stubFetch((call: FetchCall) => {
      if (call.url.startsWith(`${DRIVE}/files?`)) {
        return json({
          files: [
            driveFile({ id: 'primeiro', name: 'biblioteca.enc' }),
            driveFile({ id: 'segundo', name: 'biblioteca.enc' }),
          ],
        });
      }
      return json({ id: 'primeiro' });
    });

    await uploadFile('biblioteca.enc', Buffer.from('novo'));

    const patch = calls.find((call) => call.init.method === 'PATCH');
    expect(patch?.url).toContain('/files/primeiro');
    // O segundo só é apagado **depois** do PATCH: apagar antes deixaria a conta
    // sem backup nenhum se a gravação falhasse.
    const ordem = calls.map((call) => call.init.method ?? 'GET');
    expect(ordem.lastIndexOf('PATCH')).toBeLessThan(ordem.indexOf('DELETE'));
  });

  it('percent-encoda o id do arquivo no caminho do upload', async () => {
    const calls = stubFetch((call: FetchCall) => {
      if (call.url.startsWith(`${DRIVE}/files?`)) {
        return json({
          files: [driveFile({ id: 'id com barra/e espaco', name: 'biblioteca.enc' })],
        });
      }
      return json({ id: 'ok' });
    });

    await uploadFile('biblioteca.enc', Buffer.from('dados'));

    const patch = calls.find((call) => call.init.method === 'PATCH');
    expect(new URL(patch?.url ?? '').pathname).toBe(
      `/upload/drive/v3/files/${encodeURIComponent('id com barra/e espaco')}`,
    );
  });

  it('traduz o erro da API quando a gravação falha, sem apagar nada', async () => {
    const calls = stubFetch((call: FetchCall) => {
      if (call.url.startsWith(`${DRIVE}/files?`)) {
        return json({ files: [driveFile({ id: 'primeiro', name: 'biblioteca.enc' })] });
      }
      return json({ error: { message: 'rateLimitExceeded' } }, 429);
    });

    await expect(uploadFile('biblioteca.enc', Buffer.from('x'))).rejects.toThrow(
      currentMessages().driveErrors.providerHttp('Google Drive', 429, ''),
    );
    // Falhou a gravação, então o duplicado continua: apagar aqui só pioraria.
    expect(calls.some((call) => call.init.method === 'DELETE')).toBe(false);
  });
});

describe('o corpo de erro não invade a tela toda', () => {
  it('trunca em 200 caracteres um corpo enorme', async () => {
    const enorme = `${'erro. '.repeat(80)}fim`;
    stubFetch(() => new Response(enorme, { status: 400 }));

    await expect(downloadFile('id')).rejects.toThrow(
      currentMessages().driveErrors.providerHttp('Google Drive', 400, `${enorme.slice(0, 200)}…`),
    );
  });

  it('mantém intacto um corpo pequeno, que é a mensagem da API', async () => {
    stubFetch(() => json({ error: { message: 'notFound' } }, 404));

    await expect(downloadFile('id')).rejects.toThrow(
      currentMessages().driveErrors.providerHttp(
        'Google Drive',
        404,
        JSON.stringify({ error: { message: 'notFound' } }),
      ),
    );
  });

  it('não quebra quando o corpo do erro não pode ser lido', async () => {
    const quebrado = new Response('ok', { status: 503 });
    // Corpo já consumido derruba `text()`; o status ainda é o que importa.
    quebrado.text = () => Promise.reject(new Error('stream fechado'));
    stubFetch(() => quebrado);

    // O status é o que importa; a ausência do texto não pode virar outra falha.
    await expect(downloadFile('id')).rejects.toThrow(
      currentMessages().driveErrors.providerHttp('Google Drive', 503, ''),
    );
  });
});

describe('authorizedFetch: o 401 repete uma vez só', () => {
  it('não insiste quando a repetição também devolve 401', async () => {
    const calls = stubFetch((call: FetchCall) => {
      if (call.url.startsWith(`${DRIVE}/files/`)) return json({ error: 'invalidCredentials' }, 401);
      return json({ access_token: 'renovado', expires_in: 900 });
    });

    await expect(downloadFile('id')).rejects.toThrow(
      currentMessages().driveErrors.providerHttp('Google Drive', 401, ''),
    );

    // Duas chamadas ao Drive, e não três: repetir em laço seria um laço na API.
    expect(calls.filter((call) => call.url.startsWith(`${DRIVE}/files/`))).toHaveLength(2);
  });

  it('manda o token renovado na repetição, não o velho', async () => {
    const calls = stubFetch((call: FetchCall) => {
      if (call.url === 'https://oauth2.googleapis.com/token') {
        return json({ access_token: 'token-novo', expires_in: 900 });
      }
      if (state.tokens?.accessToken === 'token-novo') return new Response(new Uint8Array([7]));
      return json({ error: 'invalidCredentials' }, 401);
    });

    const buffer = await downloadFile('id');

    expect([...buffer]).toEqual([7]);
    const repeticao = calls.filter((call) => call.url.startsWith(`${DRIVE}/files/`)).at(-1);
    expect(new Headers(repeticao?.init.headers).get('Authorization')).toBe('Bearer token-novo');
  });
});

describe('a sessão do Google não sobrevive a uma gravação que falha', () => {
  it('devolve a sessão anterior quando o cofre tranca antes de persistir', async () => {
    const anterior = fakeSessionWith('token-anterior');
    stubFetch(() => {
      lockVault();
      return json({ access_token: 'token-novo', expires_in: 900 });
    });

    await expect(googleRenewAccessToken()).rejects.toThrow();

    // Sem gravação, uma sessão só em memória voltaria como "desconectada" na
    // próxima abertura — que é pior do que dizer que falhou.
    expect(state.tokens).toBe(anterior);
  });
});

function fakeSessionWith(accessToken: string): NonNullable<typeof state.tokens> {
  const tokens = {
    accessToken,
    refreshToken: 'refresh-anterior',
    expiresAt: Date.now() - 1_000,
    accountEmail: 'leitor@gmail.com',
    lastSync: null,
    scopeVersion: GOOGLE_SCOPE_VERSION,
  };
  state.tokens = tokens;
  return tokens;
}

describe('googleAuthorize: o erro vai para a barra e para o resultado', () => {
  it('traduz falha de rede do fluxo em vez de propagar a exceção', async () => {
    const { shell } = await import('../mocks/electron.ts');
    vi.spyOn(shell, 'openExternal').mockImplementationOnce((): Promise<void> => {
      throw new Error('sem navegador no sistema');
    });

    const result = await googleAuthorize();

    // Quem chamou precisa de uma mensagem para mostrar, não de uma exceção.
    expect(result.ok).toBe(false);
    expect(result.error).toContain('sem navegador');
    expect(state.lastError).toBe(result.error);
  });

  it('aguenta o navegador recusando a URL, sem virar sessão conectada', async () => {
    const { shell } = await import('../mocks/electron.ts');
    // `openExternalSafe` engole a falha e devolve `false`: o fluxo continua
    // esperando callback até o tempo acabar, então o teste encurta a espera.
    vi.spyOn(shell, 'openExternal').mockResolvedValue(undefined);
    stubFetch(() => json({ error: 'rota' }, 500));

    const pendente = googleAuthorize();
    await vi.waitFor(() => expect(shell.openExternal).toHaveBeenCalled(), { timeout: 2_000 });
    // Sem callback nenhum, a promessa fica pendente: prova que o erro do
    // navegador não virou uma sessão "conectada" por conta própria.
    let resolvido = false;
    void pendente.then(
      () => {
        resolvido = true;
      },
      () => {
        resolvido = true;
      },
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(resolvido).toBe(false);
    expect(state.tokens?.accessToken).toBe('token-google');
  });

  it('mantém a sessão anterior quando a nova autorização é recusada', async () => {
    const anterior = fakeSessionWith('token-que-fica');
    const { shell } = await import('../mocks/electron.ts');
    vi.spyOn(shell, 'openExternal').mockImplementationOnce((): Promise<void> => {
      throw new Error('consentimento recusado');
    });

    const result = await googleAuthorize();

    expect(result.ok).toBe(false);
    expect(state.tokens).toBe(anterior);
  });
});

describe('googleAccessToken: a margem de 60 s', () => {
  it('renova quando falta menos de um minuto, sem chegar a expirar', async () => {
    fakeSession({ expiresAt: Date.now() + 59_000 });
    stubFetch(() => json({ access_token: 'renovado', expires_in: 900 }));

    await expect(googleAccessToken()).resolves.toBe('renovado');
  });

  it('não renova com folga acima da margem', async () => {
    fakeSession({ expiresAt: Date.now() + 61_000 });
    const calls = stubFetch(() => json({ access_token: 'nao-deveria' }));

    await expect(googleAccessToken()).resolves.toBe('token-google');
    expect(calls).toHaveLength(0);
  });
});

describe('googleDriveProvider: o adaptador do Google', () => {
  it('é o objeto do catálogo e escreve na pasta oculta', () => {
    expect(googleDriveProvider.id).toBe('google-drive');
    expect(googleDriveProvider.storageHidden).toBe(true);
  });

  it('recusa autorizar sem credencial de build, com o motivo da tela', async () => {
    // O adaptador e o catálogo têm de recusar pelo mesmo motivo: se a tela
    // dissesse "build sem credencial" e a conexão devolvesse um erro de OAuth,
    // o usuário veria duas frases para o mesmo problema.
    await openTestVault();
    vi.stubEnv('GOOGLE_CLIENT_ID', '');

    await expect(googleDriveProvider.authorize()).resolves.toEqual({
      ok: false,
      error: currentMessages().providers.googleNoCredentials,
    });
  });

  it('as operações do REST chegam ao mesmo endpoint pela fachada e pelo módulo', async () => {
    // Não basta comparar as funções por identidade: se o adaptador
    // reimplementasse a operação, os dois lados mudariam juntos e o teste
    // passaria. O que segura é a **requisição**: as duas portas precisam falar
    // com a mesma rota da API.
    const calls = stubFetch((call: FetchCall) => {
      if (call.url.startsWith(`${DRIVE}/files?`)) return json({ files: [driveFile()] });
      if (call.init.method === 'DELETE') return new Response(null, { status: 204 });
      return new Response(new Uint8Array([1]), { status: 200 });
    });

    await googleDriveProvider.listAppFiles();
    await googleDriveProvider.uploadFile('nova.enc', Buffer.from('x'));
    await googleDriveProvider.downloadFile('id');
    await googleDriveProvider.deleteFile('id');

    const rotas = calls.map((call) => `${call.init.method ?? 'GET'} ${new URL(call.url).pathname}`);
    expect(rotas).toContain('GET /drive/v3/files');
    expect(rotas).toContain('POST /upload/drive/v3/files');
    expect(rotas).toContain('GET /drive/v3/files/id');
    expect(rotas).toContain('DELETE /drive/v3/files/id');
  });

  it('congela `operational` no import, ao contrário do Dropbox', () => {
    // O `describe` lê a credencial a cada chamada, então reflete o ambiente de
    // agora; o campo `operational` foi avaliado quando o módulo foi importado,
    // antes de este arquivo stubar o ambiente — daí divergirem aqui. A razão é
    // de projeto: a credencial do Google vem chumbada no bundle no build e
    // mudá-la exigiria reiniciar o app, ao contrário do override do Dropbox,
    // que vive no cofre e pode mudar com o app aberto.
    const described = googleDriveProvider.describe(currentMessages()).operational;
    expect(described).toBe(true);
    expect(googleDriveProvider.operational).toBe(false);
  });
});

describe('deleteFile: só o 404 é "já não está lá"', () => {
  it('aceita o 204 de sucesso sem tentar ler o corpo', async () => {
    stubFetch(() => new Response(null, { status: 204 }));

    await expect(deleteFile('id')).resolves.toBeUndefined();
  });

  it('trata 403 como falha, porque é permissão e não ausência', async () => {
    stubFetch(() => json({ error: { message: 'insufficientPermissions' } }, 403));

    await expect(deleteFile('id')).rejects.toThrow(
      currentMessages().driveErrors.providerHttp('Google Drive', 403, ''),
    );
  });
});
