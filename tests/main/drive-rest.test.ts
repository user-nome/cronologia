import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteFile,
  downloadFile,
  listAppFiles,
  uploadFile,
} from '@zero/main/drive/providers/dropbox/rest';
import { DROPBOX_SCOPE_VERSION } from '@zero/main/drive/providers/dropbox/constants';
import { state } from '@zero/main/drive/state';
import {
  DOWNLOAD_ENDPOINT,
  APP_KEY,
  LIST_FOLDER_ENDPOINT,
  TOKEN_ENDPOINT,
  UPLOAD_ENDPOINT,
  headerOf,
  bodyField,
  json,
  resetDrive,
  stubFetch,
} from '../helpers/drive.ts';
import type { FetchCall } from '../helpers/drive.ts';

const INVALID_LIST = 'Resposta inválida da API do Dropbox (listagem de arquivos).';
const DELETE_ENDPOINT = 'https://api.dropboxapi.com/2/files/delete_v2';

beforeEach(() => {
  vi.stubEnv('DROPBOX_APP_KEY', APP_KEY);
});

/**
 * Sessão do Drive montada direto no estado em memória.
 *
 * O OAuth não é o que está em teste aqui: o alvo é o contrato de rede de
 * `rest.ts`, então basta um token válido (e um refresh token quando o teste
 * precisa do retry de 401).
 */
function fakeSession(refreshToken?: string): void {
  state.tokens = {
    accessToken: 'token-de-teste',
    ...(refreshToken === undefined ? {} : { refreshToken }),
    expiresAt: Date.now() + 3_600_000,
    accountEmail: null,
    lastSync: null,
    scopeVersion: DROPBOX_SCOPE_VERSION,
  };
}

function callAt(calls: FetchCall[], index: number): FetchCall {
  const call = calls[index];
  if (call === undefined) throw new Error(`Chamada ${index} ausente no teste.`);
  return call;
}

function fileEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    '.tag': 'file',
    id: 'id:abc',
    name: 'library.json',
    server_modified: '2026-02-03T04:05:06.000Z',
    size: 42,
    ...overrides,
  };
}

describe('listAppFiles', () => {
  beforeEach(async () => {
    await resetDrive();
    fakeSession();
  });

  it('converte só as entradas de arquivo e ignora o resto', async () => {
    stubFetch(() =>
      json({
        entries: [
          fileEntry(),
          { '.tag': 'folder', id: 'id:pasta', name: 'subpasta' },
          { '.tag': 'file', id: 'id:sem-nome' },
        ],
        cursor: 'cursor-1',
        has_more: false,
      }),
    );

    expect(await listAppFiles()).toEqual([
      { id: 'id:abc', name: 'library.json', modifiedTime: '2026-02-03T04:05:06.000Z', size: 42 },
    ]);
  });

  it('deixa modifiedTime vazio e omite size quando a API não manda os campos', async () => {
    stubFetch(() => json({ entries: [{ '.tag': 'file', id: 'id:sem-data', name: 'capa.png' }] }));

    expect(await listAppFiles()).toEqual([
      { id: 'id:sem-data', name: 'capa.png', modifiedTime: '' },
    ]);
  });

  it('aceita página sem entries, cursor nem has_more', async () => {
    stubFetch(() => json({}));

    expect(await listAppFiles()).toEqual([]);
  });

  it('percorre as páginas e acumula as entradas de cada uma', async () => {
    let page = 0;
    const calls = stubFetch(() => {
      page += 1;
      if (page === 1) {
        return json({ entries: [fileEntry()], cursor: 'cursor-1', has_more: true });
      }
      if (page === 2) {
        return json({
          entries: [
            fileEntry({ id: 'id:def', name: 'capa.png' }),
            { '.tag': 'folder', id: 'id:pasta', name: 'subpasta' },
          ],
          cursor: 'cursor-2',
          has_more: true,
        });
      }
      // Página seguinte sem metadados: a lista para no vazio, sem inventar cursor.
      return json({});
    });

    expect(await listAppFiles()).toEqual([
      { id: 'id:abc', name: 'library.json', modifiedTime: '2026-02-03T04:05:06.000Z', size: 42 },
      { id: 'id:def', name: 'capa.png', modifiedTime: '2026-02-03T04:05:06.000Z', size: 42 },
    ]);
    expect(calls.filter((call) => call.url.endsWith('/files/list_folder/continue'))).toHaveLength(
      2,
    );
    expect(bodyField(callAt(calls, 1), 'cursor')).toBe('cursor-1');
    expect(bodyField(callAt(calls, 2), 'cursor')).toBe('cursor-2');
  });

  it('renova a sessão e repete a listagem depois do 401', async () => {
    fakeSession('refresh-legal');
    let unauthorized = true;
    const calls = stubFetch((call) => {
      if (call.url === TOKEN_ENDPOINT) {
        return json({ access_token: 'token-renovado', expires_in: 3600 });
      }
      if (unauthorized && call.url === LIST_FOLDER_ENDPOINT) {
        unauthorized = false;
        return json({ error_summary: 'expired_access_token/' }, 401);
      }
      return json({ entries: [fileEntry()], cursor: 'cursor-fim', has_more: false });
    });

    expect(await listAppFiles()).toHaveLength(1);
    const listings = calls.filter((call) => call.url === LIST_FOLDER_ENDPOINT);
    expect(listings).toHaveLength(2);
    expect(headerOf(callAt(listings, 0), 'Authorization')).toBe('Bearer token-de-teste');
    expect(headerOf(callAt(listings, 1), 'Authorization')).toBe('Bearer token-renovado');
  });

  it('recusa corpo que não é objeto em vez de devolver lista vazia', async () => {
    for (const body of [null, 42, 'texto', true]) {
      stubFetch(() => json(body));
      await expect(listAppFiles()).rejects.toThrow(INVALID_LIST);
    }
  });

  it('recusa entries que não é lista de objetos', async () => {
    for (const body of [{ entries: 'nao-e-lista' }, { entries: [1, 2] }, { entries: [null] }]) {
      stubFetch(() => json(body));
      await expect(listAppFiles()).rejects.toThrow(INVALID_LIST);
    }
  });

  it('recusa cursor e has_more fora do tipo', async () => {
    stubFetch(() => json({ entries: [], cursor: 7 }));
    await expect(listAppFiles()).rejects.toThrow(INVALID_LIST);
    stubFetch(() => json({ entries: [], has_more: 'sim' }));
    await expect(listAppFiles()).rejects.toThrow(INVALID_LIST);
  });

  it('recusa também a página de continuação inválida', async () => {
    let page = 0;
    stubFetch(() => {
      page += 1;
      if (page === 1) return json({ entries: [], cursor: 'cursor-1', has_more: true });
      return json({ entries: {} });
    });

    await expect(listAppFiles()).rejects.toThrow(INVALID_LIST);
  });
});

describe('erro HTTP do Dropbox', () => {
  beforeEach(async () => {
    await resetDrive();
    fakeSession();
  });

  it('propaga o error_summary da API como está', async () => {
    stubFetch(() => json({ error_summary: 'insufficient_space/' }, 409));

    await expect(deleteFile('id:x')).rejects.toThrow('insufficient_space/');
  });

  it('usa o corpo em texto quando o JSON não traz error_summary', async () => {
    stubFetch(() => json({ erro: 'detalhe' }, 400));

    await expect(deleteFile('id:x')).rejects.toThrow(
      'Erro do Dropbox (HTTP 400). Resposta: {"erro":"detalhe"}',
    );
  });

  it('ignora corpo que nem é JSON e usa o texto cru', async () => {
    stubFetch(() => new Response('caiu o servidor', { status: 500 }));

    await expect(deleteFile('id:x')).rejects.toThrow(
      'Erro do Dropbox (HTTP 500). Resposta: caiu o servidor',
    );
  });

  it('reporta só o status quando a resposta não tem corpo', async () => {
    stubFetch(() => new Response('', { status: 503 }));

    await expect(deleteFile('id:x')).rejects.toThrow('Erro do Dropbox (HTTP 503).');
  });

  it('não inventa detalhe quando o corpo já foi consumido', async () => {
    const spent = new Response('detalhe interno', { status: 502 });
    await spent.text();
    stubFetch(() => spent);

    await expect(deleteFile('id:x')).rejects.toThrow('Erro do Dropbox (HTTP 502).');
  });

  it('traduz falta de escopo mesmo quando ela vem no corpo cru', async () => {
    stubFetch(
      () =>
        new Response('missing_scope/ o app nao tem o escopo files.metadata.read', { status: 400 }),
    );

    await expect(deleteFile('id:x')).rejects.toThrow(
      'Faltam permissões no app Dropbox. Confira todos os escopos no painel do',
    );
  });
});

describe('conteúdo: upload e download', () => {
  beforeEach(async () => {
    await resetDrive();
    fakeSession();
  });

  it('sobe o arquivo no contrato exato da API de conteúdo', async () => {
    const calls = stubFetch(() => json({ '.tag': 'file', id: 'id:novo', name: 'library.json' }));

    await uploadFile('library.json', Buffer.from('conteudo cifrado'));

    const call = callAt(calls, 0);
    expect(call.url).toBe(UPLOAD_ENDPOINT);
    expect(headerOf(call, 'Dropbox-API-Arg')).toBe(
      '{"path":"/library.json","mode":"overwrite","autorename":false,"mute":true}',
    );
    expect(headerOf(call, 'Content-Type')).toBe('application/octet-stream');
    expect(headerOf(call, 'Authorization')).toBe('Bearer token-de-teste');
    const sent = call.init.body;
    if (!(sent instanceof Uint8Array)) throw new Error('Corpo do upload não é um buffer.');
    expect(Buffer.from(sent).toString('utf-8')).toBe('conteudo cifrado');
  });

  it('baixa o arquivo pelo id informado, sem corpo no pedido', async () => {
    const calls = stubFetch(() => new Response(new Uint8Array([1, 2, 3])));

    expect(await downloadFile('id:arquivo')).toEqual(Buffer.from([1, 2, 3]));

    const call = callAt(calls, 0);
    expect(call.url).toBe(DOWNLOAD_ENDPOINT);
    expect(headerOf(call, 'Dropbox-API-Arg')).toBe('{"path":"id:arquivo"}');
    expect(call.init.body).toBeNull();
  });

  it('renova a sessão e repete o upload depois do 401', async () => {
    fakeSession('refresh-legal');
    let unauthorized = true;
    const calls = stubFetch((call) => {
      if (call.url === TOKEN_ENDPOINT) {
        return json({ access_token: 'token-renovado', expires_in: 3600 });
      }
      if (unauthorized && call.url === UPLOAD_ENDPOINT) {
        unauthorized = false;
        return json({ error_summary: 'expired_access_token/' }, 401);
      }
      return json({ '.tag': 'file', id: 'id:novo', name: 'library.json' });
    });

    await uploadFile('library.json', Buffer.from('x'));

    const uploads = calls.filter((call) => call.url === UPLOAD_ENDPOINT);
    expect(uploads).toHaveLength(2);
    expect(headerOf(callAt(uploads, 0), 'Authorization')).toBe('Bearer token-de-teste');
    expect(headerOf(callAt(uploads, 1), 'Authorization')).toBe('Bearer token-renovado');
  });

  it('renova a sessão e repete o download depois do 401', async () => {
    fakeSession('refresh-legal');
    let unauthorized = true;
    const calls = stubFetch((call) => {
      if (call.url === TOKEN_ENDPOINT) {
        return json({ access_token: 'token-renovado', expires_in: 3600 });
      }
      if (unauthorized && call.url === DOWNLOAD_ENDPOINT) {
        unauthorized = false;
        return json({ error_summary: 'expired_access_token/' }, 401);
      }
      return new Response(new Uint8Array([7]));
    });

    expect(await downloadFile('id:arquivo')).toEqual(Buffer.from([7]));
    expect(calls.filter((call) => call.url === DOWNLOAD_ENDPOINT)).toHaveLength(2);
  });

  it('propaga o erro quando o 401 se repete depois da renovação', async () => {
    fakeSession('refresh-legal');
    stubFetch((call) =>
      call.url === TOKEN_ENDPOINT
        ? json({ access_token: 'token-renovado', expires_in: 3600 })
        : json({ error_summary: 'expired_access_token/' }, 401),
    );

    await expect(downloadFile('id:x')).rejects.toThrow('expired_access_token/');
  });

  it('traduz erro HTTP tanto no upload quanto no download', async () => {
    stubFetch(() => json({ error_summary: 'too_many_write_operations/' }, 429));

    await expect(uploadFile('library.json', Buffer.from('x'))).rejects.toThrow(
      'too_many_write_operations/',
    );
    await expect(downloadFile('id:x')).rejects.toThrow('too_many_write_operations/');
  });
});

describe('deleteFile', () => {
  beforeEach(async () => {
    await resetDrive();
    fakeSession();
  });

  it('apaga pelo id informado, na rota de metadados', async () => {
    const calls = stubFetch(() => json({ metadata: { '.tag': 'file', id: 'id:x' } }));

    await deleteFile('id:x');

    const call = callAt(calls, 0);
    expect(call.url).toBe(DELETE_ENDPOINT);
    expect(bodyField(call, 'path')).toBe('id:x');
    expect(headerOf(call, 'Content-Type')).toBe('application/json');
  });
});
