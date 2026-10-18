import { randomBytes } from 'crypto';
import type { RemoteFile } from '@zero/types';
import { isRecord } from '@zero/shared';
import {
  GOOGLE_DRIVE_ENDPOINT,
  GOOGLE_UPLOAD_ENDPOINT,
} from '@zero/main/drive/providers/google/constants';
import { parseJson } from '@zero/main/drive/json';
import { googleFlow } from '@zero/main/drive/providers/google/oauth';
import {
  googleAccessToken,
  googleRenewAccessToken,
} from '@zero/main/drive/providers/google/session';
import { httpError } from '@zero/main/drive/oauth-flow';
import { currentMessages } from '@zero/main/i18n';

/**
 * REST do Google Drive v3, só na `appDataFolder`.
 *
 * Cada arquivo de backup é um `File` de verdade com corpo em `media`. O que
 * difere do Dropbox, e está comentado ponto a ponto:
 *
 * - a listagem **não** pagina por cursor como o `list_folder`: o Drive usa
 *   `pageToken`, e o campo `files` da resposta;
 * - a criação é multipart para informar nome e `appDataFolder`; atualizações
 *   usam `PATCH` media no id existente, sem apagar o backup antes de gravar;
 * - o download é o mesmo arquivo com `alt=media`, e o corpo vem como `arrayBuffer`.
 *
 * Nomes opacos, conteúdo cifrado e manifesto continuam tratados por
 * `drive/crypto.ts`, que é genérico: o provedor só entrega bytes e id.
 */

/**
 * Pasta oculta do app na conta do Google Drive (`appDataFolder`).
 *
 * A pasta é de uso exclusivo do app: não aparece na interface do Drive e não
 * concorre com os arquivos do usuário.
 */
const APP_DATA_SPACE = 'appDataFolder';

/** Máxima da API para `files.list`; pedir o teto evita paginar o acervo todo. */
const LIST_PAGE_SIZE = 1000;

/** Bytes de entropia no `boundary` do upload multipart (precisa ser único só). */
const UPLOAD_BOUNDARY_BYTES = 16;

/**
 * Objeto JSON de verdade, e não array.
 *
 * `typeof [] === 'object'`, então um guard que só olha o `typeof` deixaria
 * passar uma resposta que é lista: aí `files` daria `undefined` e a paginação
 * devolveria um acervo vazio em silêncio, que é o pior jeito de errar num
 * backup. É o `isRecord` de `@zero/shared` mais a exclusão do array.
 */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
}

/** Valida cada arquivo retornado pela API (falha fechada). */
function toRemoteFile(entry: unknown): RemoteFile {
  if (!isJsonObject(entry)) {
    throw new Error(currentMessages().driveErrors.invalidListResponse('Google Drive'));
  }
  const id = entry.id;
  const name = entry.name;
  const modifiedTime = entry.modifiedTime;
  const size = entry.size;
  if (typeof id !== 'string' || id === '') {
    throw new Error(currentMessages().driveErrors.invalidListResponse('Google Drive'));
  }
  if (typeof name !== 'string' || name === '') {
    throw new Error(currentMessages().driveErrors.invalidListResponse('Google Drive'));
  }
  if (
    typeof modifiedTime !== 'string' ||
    modifiedTime === '' ||
    !Number.isFinite(Date.parse(modifiedTime))
  ) {
    throw new Error(currentMessages().driveErrors.invalidListResponse('Google Drive'));
  }
  if (size !== undefined && (typeof size !== 'string' || !/^(0|[1-9]\d*)$/.test(size))) {
    throw new Error(currentMessages().driveErrors.invalidListResponse('Google Drive'));
  }
  const numericSize = size === undefined ? undefined : Number(size);
  return {
    id,
    name,
    modifiedTime,
    // O Drive devolve `size` como texto (a API é JSON de números grandes em
    // string); sem ele, quem chamou usa o tamanho do corpo baixado.
    ...(numericSize !== undefined && Number.isSafeInteger(numericSize)
      ? { size: numericSize }
      : {}),
  };
}

/**
 * Quantos caracteres do corpo de erro entram na exceção.
 *
 * A API devolve um paragrafo curto, e a exceção vai para a barra de status do
 * app: copiar o corpo inteiro ali não ajuda ninguém e polui o log.
 */
const ERROR_BODY_CHARS = 200;

/** Texto do corpo quando é pequeno (mensagem de erro da API), senão vazio. */
async function errorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (text.length > ERROR_BODY_CHARS) {
      return `${text.slice(0, ERROR_BODY_CHARS)}…`;
    }
    return text;
  } catch {
    return '';
  }
}

/** Requisição autenticada, com renovação automática em 401 e uma repetição. */
async function authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${await googleAccessToken()}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status !== 401) return res;
  // 401 com sessão válida é token revogado: renova e tenta uma vez, que é o
  // mesmo critério do Dropbox (`refreshAfter401` em `drive/rest.ts`).
  headers.set('Authorization', `Bearer ${await googleRenewAccessToken()}`);
  return fetch(url, { ...init, headers });
}

/**
 * Todos os arquivos do backup na `appDataFolder`, com paginação percorrida até
 * o fim.
 *
 * A paginação do Drive é por `pageToken`, e o bug óbvio aqui é não percorrer:
 * uma pasta com mais que 100 arquivos devolveria só a primeira página, e o
 * backup "veria" um acervo pela metade, apagando o resto como órfão.
 */
export async function listAppFiles(): Promise<RemoteFile[]> {
  const out: RemoteFile[] = [];
  let pageToken: string | undefined;
  const seenPageTokens = new Set<string>();
  do {
    if (pageToken !== undefined) {
      if (seenPageTokens.has(pageToken)) {
        throw new Error(currentMessages().driveErrors.invalidListResponse('Google Drive'));
      }
      seenPageTokens.add(pageToken);
    }
    const query = new URLSearchParams({
      spaces: APP_DATA_SPACE,
      fields: 'nextPageToken,files(id,name,modifiedTime,size)',
      pageSize: String(LIST_PAGE_SIZE),
      ...(pageToken !== undefined ? { pageToken } : {}),
    });
    const res = await authorizedFetch(`${GOOGLE_DRIVE_ENDPOINT}/files?${query.toString()}`);
    if (!res.ok) throw httpError(googleFlow, res.status, await errorBody(res));
    const data: unknown = await parseJson(res);
    if (!isJsonObject(data) || !Array.isArray(data.files)) {
      throw new Error(currentMessages().driveErrors.invalidListResponse('Google Drive'));
    }
    const nextPageToken = data.nextPageToken;
    if (nextPageToken !== undefined && typeof nextPageToken !== 'string') {
      throw new Error(currentMessages().driveErrors.invalidListResponse('Google Drive'));
    }
    for (const entry of data.files) out.push(toRemoteFile(entry));
    pageToken =
      typeof nextPageToken === 'string' && nextPageToken !== '' ? nextPageToken : undefined;
  } while (pageToken !== undefined);
  return out;
}

/**
 * Grava ou atualiza um arquivo dentro da pasta oculta do app.
 *
 * O upload media sozinho cria um arquivo sem metadados; a criação usa multipart
 * para enviar nome e parent `appDataFolder`. Quando já existe um arquivo com
 * esse nome, a API de atualização substitui apenas o conteúdo e preserva o id,
 * evitando apagar o último backup antes de confirmar o novo.
 */
export async function uploadFile(name: string, buffer: Buffer): Promise<void> {
  const existentes = (await listAppFiles()).filter((file) => file.name === name);
  const existente = existentes[0];
  const boundary = `cronologia-${randomBytes(UPLOAD_BOUNDARY_BYTES).toString('hex')}`;
  const body =
    existente === undefined
      ? Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
              { name, parents: [APP_DATA_SPACE] },
            )}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
          ),
          buffer,
          Buffer.from(`\r\n--${boundary}--`),
        ])
      : new Uint8Array(buffer);
  const url =
    existente === undefined
      ? `${GOOGLE_UPLOAD_ENDPOINT}?${new URLSearchParams({ uploadType: 'multipart' }).toString()}`
      : `${GOOGLE_UPLOAD_ENDPOINT}/${encodeURIComponent(existente.id)}?${new URLSearchParams({
          uploadType: 'media',
        }).toString()}`;
  const res = await authorizedFetch(url, {
    method: existente === undefined ? 'POST' : 'PATCH',
    headers: {
      'Content-Type':
        existente === undefined
          ? `multipart/related; boundary=${boundary}`
          : 'application/octet-stream',
    },
    body,
  });
  if (!res.ok) throw httpError(googleFlow, res.status, await errorBody(res));
  for (const duplicado of existentes.slice(1)) await deleteFile(duplicado.id);
}

/** Baixa o conteúdo do arquivo (`alt=media` traz o corpo, não os metadados). */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const url = `${GOOGLE_DRIVE_ENDPOINT}/files/${encodeURIComponent(fileId)}?alt=media`;
  const res = await authorizedFetch(url);
  if (!res.ok) throw httpError(googleFlow, res.status, await errorBody(res));
  return Buffer.from(await res.arrayBuffer());
}

/** Apaga o arquivo pelo id. */
export async function deleteFile(fileId: string): Promise<void> {
  const url = `${GOOGLE_DRIVE_ENDPOINT}/files/${encodeURIComponent(fileId)}`;
  const res = await authorizedFetch(url, {
    method: 'DELETE',
  });
  // 404 é "já não está lá": o objetivo do `purgeRemote` é accomplished. Qualquer
  // outro status, inclusive 401, é falha e vai para a contagem do resumo.
  if (res.ok || res.status === 404) return;
  throw httpError(googleFlow, res.status, await errorBody(res));
}
