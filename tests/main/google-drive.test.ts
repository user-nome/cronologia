import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import { shell } from '../mocks/electron.ts';
import { currentMessages } from '@zero/main/i18n';
import {
  GOOGLE_SCOPE_VERSION,
  GOOGLE_TOKEN_ENDPOINT,
  GOOGLE_USERINFO_ENDPOINT,
} from '@zero/main/drive/providers/google';
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
import { state } from '@zero/main/drive/state';
import { lockVault } from '@zero/main/vault';
import { bodyText, headerOf, json, resetDrive, stubFetch } from '../helpers/drive.ts';
import type { FetchCall } from '../helpers/drive.ts';

/**
 * Contrato de rede do Google Drive v3 na `appDataFolder`.
 *
 * O que é próprio daqui, e é o que este arquivo fixa: a paginação por
 * `pageToken` (o `list_folder` do Dropbox usa cursor, e a troca errada de campo
 * devolveria um acervo pela metade sem erro nenhum), o upload que **cria** e por
 * isso precisa apagar o anterior de mesmo nome, e o `404` de delete contado como
 * "já não está lá".
 *
 * O PKCE e o loopback são o mesmo código do Dropbox (`oauth-flow.ts`), testados
 * em `drive-oauth.test.ts`; aqui o OAuth entra pela porta do `authorize` com o
 * navegador simulado, porque o provedor monta a query do Google de um jeito só
 * (`access_type=offline`, `prompt=consent`, `client_secret`).
 */

const CHAVE = '123.apps.googleusercontent.com';
const SEGREDO = 'GOCSPX-segredo-de-teste';
const DRIVE = 'https://www.googleapis.com/drive/v3';

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

function callAt(calls: FetchCall[], index: number): FetchCall {
  const call = calls[index];
  if (call === undefined) throw new Error(`Chamada ${index} ausente no teste.`);
  return call;
}

function bufferBody(call: FetchCall): Buffer {
  const body = call.init.body;
  if (body === null || body === undefined) throw new Error('O corpo do upload não foi enviado.');
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  throw new Error('O corpo do upload não tem formato binário.');
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

/**
 * Responde a toda rota do Drive com o mesmo `handler`, que decide pelo `call`.
 *
 * `files?` (listagem), `/files/{id}` (download e delete) e `/upload/...` passam
 * pelo mesmo stub porque a rota chega inteira na URL; quem olha o método e o
 * caminho é o teste.
 */
function stubDrive(
  handler: (call: FetchCall) => Response = () => json({ files: [] }),
): FetchCall[] {
  return stubFetch(handler);
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

describe('listAppFiles: a appDataFolder', () => {
  it('pede só a pasta oculta e devolve os arquivos normalizados', async () => {
    const calls = stubDrive(() => json({ files: [driveFile()] }));

    const files = await listAppFiles();

    const url = new URL(callAt(calls, 0).url);
    expect(url.searchParams.get('spaces')).toBe('appDataFolder');
    expect(files).toEqual([
      {
        id: 'id-do-drive',
        name: 'biblioteca.enc',
        modifiedTime: '2026-03-01T10:00:00.000Z',
        // O Drive devolve `size` como texto; o app quer número.
        size: 128,
      },
    ]);
  });

  it('percorre a paginação até o fim (sem isso o backup veria metade do acervo)', async () => {
    let pagina = 0;
    const calls = stubDrive(() => {
      pagina += 1;
      if (pagina === 1) {
        return json({ files: [driveFile({ id: 'a', name: 'a' })], nextPageToken: 'cursor-2' });
      }
      return json({ files: [driveFile({ id: 'b', name: 'b' })] });
    });

    const files = await listAppFiles();

    expect(files.map((file) => file.name)).toEqual(['a', 'b']);
    expect(calls).toHaveLength(2);
    expect(new URL(callAt(calls, 1).url).searchParams.get('pageToken')).toBe('cursor-2');
  });

  it('trata `nextPageToken` vazio como fim da lista, sem chamar de novo', async () => {
    const calls = stubDrive(() => json({ files: [driveFile()], nextPageToken: '' }));

    await listAppFiles();

    expect(calls).toHaveLength(1);
  });

  it('falha fechada quando um arquivo da página está incompleto', async () => {
    stubDrive(() =>
      json({
        files: [
          driveFile(),
          driveFile({ id: '' }),
          driveFile({ name: '' }),
          driveFile({ modifiedTime: '' }),
          driveFile({ id: 'so-o-id' }),
        ],
      }),
    );

    await expect(listAppFiles()).rejects.toThrow(
      currentMessages().driveErrors.invalidListResponse('Google Drive'),
    );
  });

  it('omite `size` quando o Drive não manda o campo', async () => {
    stubDrive(() => {
      const semSize = driveFile();
      delete semSize.size;
      return json({ files: [semSize] });
    });

    const files = await listAppFiles();

    expect(files[0]?.size).toBeUndefined();
  });

  it('falha fechada quando a resposta não é um objeto', async () => {
    stubDrive(() => json(['lista', 'vazia']));

    await expect(listAppFiles()).rejects.toThrow(
      currentMessages().driveErrors.invalidListResponse('Google Drive'),
    );
  });

  it('falha fechada quando a resposta não traz o campo `files`', async () => {
    stubDrive(() => json({ nextPageToken: 'pagina-2' }));

    await expect(listAppFiles()).rejects.toThrow(
      currentMessages().driveErrors.invalidListResponse('Google Drive'),
    );
  });

  it('traduz erro HTTP com o nome do provedor', async () => {
    stubDrive(() => json({ error: { message: 'rateLimitExceeded' } }, 429));

    await expect(listAppFiles()).rejects.toThrow(
      currentMessages().driveErrors.providerHttp('Google Drive', 429, ''),
    );
  });

  it('renova o token e repete a chamada uma vez no 401', async () => {
    let primeira = true;
    const calls = stubFetch((call) => {
      if (call.url === GOOGLE_TOKEN_ENDPOINT) {
        return json({ access_token: 'token-renovado', expires_in: 900 });
      }
      if (primeira) {
        primeira = false;
        return json({ error: 'invalidCredentials' }, 401);
      }
      return json({ files: [] });
    });

    await expect(listAppFiles()).resolves.toEqual([]);
    // Listagem, token e listagem de novo: o 401 custou uma repetição só.
    expect(calls.filter((call) => call.url.startsWith(`${DRIVE}/files?`))).toHaveLength(2);
    expect(state.tokens?.accessToken).toBe('token-renovado');
  });
});

describe('uploadFile: grava em appDataFolder e preserva o arquivo anterior', () => {
  it('atualiza o arquivo existente sem apagá-lo antes do upload', async () => {
    const calls = stubDrive((call) => {
      if (call.url.startsWith(`${DRIVE}/files?`)) {
        return json({ files: [driveFile({ id: 'existente', name: 'biblioteca.enc' })] });
      }
      return json({ id: 'existente' });
    });

    await uploadFile('biblioteca.enc', Buffer.from('cifrado'));

    const upload = calls.at(-1);
    if (upload === undefined) throw new Error('Upload não aconteceu.');
    expect(upload.init.method).toBe('PATCH');
    expect(new URL(upload.url).pathname).toBe('/upload/drive/v3/files/existente');
    expect(headerOf(upload, 'Content-Type')).toBe('application/octet-stream');
    expect(bufferBody(upload).toString()).toBe('cifrado');
    expect(calls.some((call) => call.init.method === 'DELETE')).toBe(false);
  });

  it('cria o arquivo com nome e parent `appDataFolder`', async () => {
    const calls = stubDrive((call) =>
      call.init.method === 'POST' ? json({ id: 'novo' }) : json({ files: [] }),
    );

    await uploadFile('capa.enc', Buffer.from('bytes-cifrados'));

    const call = calls.at(-1);
    if (call === undefined) throw new Error('Upload não aconteceu.');
    expect(new URL(call.url).searchParams.get('uploadType')).toBe('multipart');
    expect(headerOf(call, 'Content-Type')).toMatch(/^multipart\/related; boundary=cronologia-/);
    expect(headerOf(call, 'Authorization')).toBe('Bearer token-google');
    expect(call.init.method).toBe('POST');
    const multipart = bufferBody(call).toString();
    expect(multipart).toContain('"name":"capa.enc"');
    expect(multipart).toContain('"parents":["appDataFolder"]');
    expect(multipart).toContain('bytes-cifrados');
  });

  it('traduz erro de upload com o corpo da API', async () => {
    stubDrive(() => json({ error: { message: 'storageQuotaExceeded' } }, 403));

    await expect(uploadFile('x.enc', Buffer.alloc(0))).rejects.toThrow(
      currentMessages().driveErrors.providerHttp('Google Drive', 403, ''),
    );
  });
});

describe('downloadFile e deleteFile', () => {
  it('baixa com alt=media e devolve os bytes', async () => {
    const calls = stubFetch(() => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));

    const buffer = await downloadFile('id com espaço');

    expect([...buffer]).toEqual([1, 2, 3]);
    const url = new URL(callAt(calls, 0).url);
    expect(url.searchParams.get('alt')).toBe('media');
    // O id vai percent-encoded: sem isso, um id com espaço vira outra rota.
    expect(url.pathname).toBe(`/drive/v3/files/${encodeURIComponent('id com espaço')}`);
  });

  it('traduz erro de download', async () => {
    stubFetch(() => json({ error: { message: 'notFound' } }, 404));

    await expect(downloadFile('fantasma')).rejects.toThrow(
      currentMessages().driveErrors.providerHttp('Google Drive', 404, ''),
    );
  });

  it('trata 404 no delete como "já não está lá", sem falhar a limpeza', async () => {
    stubFetch(() => json({ error: { message: 'notFound' } }, 404));

    await expect(deleteFile('fantasma')).resolves.toBeUndefined();
  });

  it('propaga o erro de delete que não é 404', async () => {
    stubFetch(() => json({ error: { message: 'rateLimitExceeded' } }, 429));

    await expect(deleteFile('id')).rejects.toThrow(
      currentMessages().driveErrors.providerHttp('Google Drive', 429, ''),
    );
  });
});

describe('authorize: a query do Google e a sessão', () => {
  function responderNoCallback(query: string): void {
    shell.openExternal.mockImplementationOnce((url: string): Promise<void> => {
      const params = new URL(url).searchParams;
      const redirect = params.get('redirect_uri');
      if (redirect !== null) {
        // `agent: false` dá conexão nova por resposta: o pool keep-alive
        // reaproveitaria o socket que o app acabou de fechar. E o `state` volta
        // na query, como o Google faz.
        const request = http.get(
          `${redirect}?${query}&state=${params.get('state') ?? ''}`,
          { agent: false },
          (res) => res.resume(),
        );
        request.on('error', () => undefined);
      }
      return Promise.resolve();
    });
  }

  it('pede offline, força o consentimento e sobe em porta efêmera', async () => {
    const calls = stubFetch((call) => {
      if (call.url === GOOGLE_TOKEN_ENDPOINT) {
        return json({
          access_token: 'token-google',
          refresh_token: 'refresh-google',
          expires_in: 3600,
          scope:
            'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email',
        });
      }
      if (call.url === GOOGLE_USERINFO_ENDPOINT) return json({ email: 'leitor@gmail.com' });
      return json({ error: 'rota' }, 500);
    });
    responderNoCallback('code=codigo-valido');

    const result = await googleAuthorize();

    expect(result).toEqual({ ok: true });
    const auth = new URL(shell.openExternal.mock.calls.at(-1)?.[0] ?? '');
    expect(auth.origin + auth.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(auth.searchParams.get('access_type')).toBe('offline');
    expect(auth.searchParams.get('prompt')).toBe('consent');
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
    // Sem porta fixa: o Google aceita qualquer porta de loopback para cliente
    // Desktop, então o app sorteia uma e monta o redirect com ela.
    const redirect = new URL(auth.searchParams.get('redirect_uri') ?? '');
    expect(redirect.port).not.toBe('');
    expect(redirect.hostname).toBe('localhost');

    const troca = calls.find((call) => call.url === GOOGLE_TOKEN_ENDPOINT);
    if (troca === undefined) throw new Error('Troca de token não aconteceu.');
    const corpo = new URLSearchParams(bodyText(troca));
    expect(corpo.get('client_secret')).toBe(SEGREDO);
    expect(corpo.get('code_verifier')).not.toBe('');
    expect(state.tokens?.accountEmail).toBe('leitor@gmail.com');
  });

  it('recusa sem credencial antes de abrir o navegador', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');

    const result = await googleAuthorize();

    expect(result).toEqual({ ok: false, error: currentMessages().providers.googleNoCredentials });
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('recusa sem cofre aberto (a sessão só vive no cofre)', async () => {
    lockVault();

    const result = await googleAuthorize();

    expect(result).toEqual({
      ok: false,
      error: currentMessages().vault.errors.vaultLocked,
    });
    // Nem o navegador abre: sem cofre não há onde gravar o token, e uma sessão
    // só em memória voltaria como "desconectada" na próxima abertura.
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('recusa concessão parcial de escopo', async () => {
    stubFetch((call) =>
      call.url === GOOGLE_TOKEN_ENDPOINT
        ? json({
            access_token: 't',
            expires_in: 60,
            scope: 'https://www.googleapis.com/auth/drive.appdata',
          })
        : json({ error: 'rota' }, 500),
    );
    responderNoCallback('code=codigo-valido');

    const result = await googleAuthorize();

    expect(result.ok).toBe(false);
    expect(result.error ?? '').toContain('Faltam permissões no app Google Drive');
  });
});

describe('token: renovar e reusar', () => {
  it('renova quando o token está a menos de um minuto de vencer', async () => {
    fakeSession({ expiresAt: Date.now() + 30_000 });
    const calls = stubFetch((call) => {
      if (call.url === GOOGLE_TOKEN_ENDPOINT) {
        return json({ access_token: 'renovado', refresh_token: 'refresh-novo', expires_in: 3600 });
      }
      return json({ files: [] });
    });

    await expect(googleAccessToken()).resolves.toBe('renovado');
    const corpo = new URLSearchParams(bodyText(calls[0]));
    expect(corpo.get('grant_type')).toBe('refresh_token');
    // O Google devolve o refresh token na renovação; quando não devolve, o
    // anterior precisa sobreviver, senão a próxima renovação não tem com o quê.
    expect(state.tokens?.refreshToken).toBe('refresh-novo');
  });

  it('preserva o refresh token quando a renovação não devolve um novo', async () => {
    fakeSession({ expiresAt: Date.now() + 30_000 });
    stubFetch((call) =>
      call.url === GOOGLE_TOKEN_ENDPOINT
        ? json({ access_token: 'renovado', expires_in: 3600 })
        : json({}),
    );

    await googleRenewAccessToken();

    expect(state.tokens?.refreshToken).toBe('refresh-google');
  });

  it('recusa renovar sem credencial e sem refresh token', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    await expect(googleRenewAccessToken()).rejects.toThrow(
      currentMessages().providers.googleNoCredentials,
    );

    vi.stubEnv('GOOGLE_CLIENT_ID', CHAVE);
    fakeSession({ refreshToken: '' });
    await expect(googleRenewAccessToken()).rejects.toThrow(
      currentMessages().driveErrors.sessionExpired('Google Drive'),
    );
  });

  it('recusa ler o token sem conta conectada', async () => {
    state.tokens = null;

    await expect(googleAccessToken()).rejects.toThrow(
      currentMessages().driveErrors.noAccount('Google Drive'),
    );
  });

  it('não renova enquanto o token tem folga', async () => {
    const calls = stubDrive(() => json({ files: [] }));

    await expect(googleAccessToken()).resolves.toBe('token-google');
    expect(calls).toHaveLength(0);
  });

  it('conta desconectada no meio da renovação não volta sozinha', async () => {
    fakeSession({ expiresAt: Date.now() + 30_000 });
    stubFetch((call) => {
      if (call.url === GOOGLE_TOKEN_ENDPOINT) {
        state.tokens = null;
        return json({ access_token: 'renovado', expires_in: 3600 });
      }
      return json({});
    });

    await expect(googleRenewAccessToken()).rejects.toThrow(
      currentMessages().driveErrors.noAccount('Google Drive'),
    );
  });
});
