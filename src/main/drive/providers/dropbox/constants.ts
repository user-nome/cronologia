/**
 * Constantes do provedor Dropbox.
 *
 * Espelha `providers/google/constants.ts`: endpoints, escopo, versão do escopo e
 * o que muda em relação ao outro provedor. O desenho completo dos provedores está
 * em `docs/backup-providers.md` e o passo a passo do Dropbox em
 * `docs/dropbox.md`.
 */

export const DROPBOX_SCOPES = [
  'account_info.read',
  'files.metadata.read',
  'files.metadata.write',
  'files.content.read',
  'files.content.write',
].join(' ');

/** Versão dos escopos pedidos; mudança invalida a sessão salva (reconexão obrigatória). */
export const DROPBOX_SCOPE_VERSION = 3;

export const DROPBOX_AUTH_ENDPOINT = 'https://www.dropbox.com/oauth2/authorize';
export const DROPBOX_TOKEN_ENDPOINT = 'https://api.dropboxapi.com/oauth2/token';
export const DROPBOX_API_ENDPOINT = 'https://api.dropboxapi.com/2';
export const DROPBOX_CONTENT_ENDPOINT = 'https://content.dropboxapi.com/2';
export const DROPBOX_AUTH_TIMEOUT_MS = 5 * 60 * 1000;

/** Passo do callback no servidor local (igual ao do Google). */
export const DROPBOX_LOOPBACK_PATH = '/callback';

/**
 * Porta fixa do callback loopback (`http://localhost:17431/callback`).
 *
 * Diferente do Google, o Dropbox exige a URI de redirecionamento pré-cadastrada
 * no App Console; por isso a porta não pode ser sorteada. Cadastre exatamente
 * essa URI no app (ver `docs/dropbox.md`).
 */
export const DROPBOX_LOOPBACK_PORT = 17431;
export const DROPBOX_REDIRECT_URI = `http://localhost:${DROPBOX_LOOPBACK_PORT}${DROPBOX_LOOPBACK_PATH}`;

/**
 * Desconto de renovação: o access token se considera velho 60 s antes do fim.
 *
 * Mesma margem do Google: uma requisição que sai com o token ainda válido mas
 * vence no meio do caminho vira 401, e o REST só descobre depois de gastar a
 * chamada.
 */
export const DROPBOX_TOKEN_MARGIN_MS = 60_000;
