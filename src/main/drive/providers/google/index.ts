/**
 * Superfície do provedor Google Drive.
 *
 * Barrel como manda o `AGENTS.md`: quem precisa do provedor importa daqui, e não
 * de `rest.ts`/`session.ts` direto. O par `provider.ts` (que satisfaz o contrato
 * `BackupProvider`) e `oauth.ts` (que descreve o fluxo) é o que o
 * `drive/provider.ts` monta no catálogo.
 */
export { googleDriveProvider } from '@zero/main/drive/providers/google/provider';
export {
  GOOGLE_DRIVE_ENDPOINT,
  GOOGLE_LOOPBACK_PATH,
  GOOGLE_SCOPES,
  GOOGLE_SCOPE_VERSION,
  GOOGLE_TOKEN_ENDPOINT,
  GOOGLE_UPLOAD_ENDPOINT,
  GOOGLE_USERINFO_ENDPOINT,
} from '@zero/main/drive/providers/google/constants';
export {
  googleClientId,
  googleClientSecret,
  hasGoogleCredentials,
} from '@zero/main/drive/providers/google/credentials';
export { googleFlow } from '@zero/main/drive/providers/google/oauth';
export {
  deleteFile,
  downloadFile,
  listAppFiles,
  uploadFile,
} from '@zero/main/drive/providers/google/rest';
export {
  googleAccessToken,
  googleAuthorize,
  googleRenewAccessToken,
} from '@zero/main/drive/providers/google/session';
