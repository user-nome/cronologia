/**
 * Superfície do provedor Dropbox.
 *
 * Barrel como manda o `AGENTS.md`: quem precisa do provedor importa daqui, e não
 * de `rest.ts`/`session.ts` direto. O par `provider.ts` (que satisfaz o contrato
 * `BackupProvider`) e `oauth.ts` (que descreve o fluxo) é o que o
 * `drive/provider.ts` monta no catálogo, espelhando `providers/google/`.
 */
export { dropboxProvider } from '@zero/main/drive/providers/dropbox/provider';
export {
  DROPBOX_API_ENDPOINT,
  DROPBOX_AUTH_ENDPOINT,
  DROPBOX_CONTENT_ENDPOINT,
  DROPBOX_LOOPBACK_PATH,
  DROPBOX_LOOPBACK_PORT,
  DROPBOX_REDIRECT_URI,
  DROPBOX_SCOPES,
  DROPBOX_SCOPE_VERSION,
  DROPBOX_TOKEN_ENDPOINT,
  DROPBOX_TOKEN_MARGIN_MS,
} from '@zero/main/drive/providers/dropbox/constants';
export { dropboxAppKey } from '@zero/main/drive/providers/dropbox/credentials';
export { dropboxFlow } from '@zero/main/drive/providers/dropbox/oauth';
export {
  deleteFile,
  downloadFile,
  listAppFiles,
  uploadFile,
} from '@zero/main/drive/providers/dropbox/rest';
export {
  accessToken,
  authorize,
  missingScopes,
  refreshAccessToken,
} from '@zero/main/drive/providers/dropbox/session';
