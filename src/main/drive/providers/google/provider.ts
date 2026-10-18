import type { BackupProvider } from '@zero/main/drive/provider';
import { providerLabel } from '@zero/main/drive/constants';
import { hasGoogleCredentials } from '@zero/main/drive/providers/google/credentials';
import { googleAuthorize } from '@zero/main/drive/providers/google/session';
import {
  deleteFile,
  downloadFile,
  listAppFiles,
  uploadFile,
} from '@zero/main/drive/providers/google/rest';

/**
 * Provedor Google Drive.
 *
 * `operational` é **calculado**, não fixo: depende de o build trazer o par de
 * credenciais injetado pelo CI (`credentials.ts`). Um build sem ele continua
 * catalogado e visível nas Configurações, mas recusando tudo com o motivo real
 * ("este build não traz credencial") em vez de aparecer conectável e falhar na
 * hora de autorizar. No `.deb` publicado pelo `publish.yml`, o par está lá.
 *
 * O destino é a `appDataFolder`: uma pasta escondida que o Google Drive só
 * mostra ao app autorizado, o que faz dela o equivalente mais próximo da App
 * folder do Dropbox. Guia em `docs/backup-providers.md`.
 */
export const googleDriveProvider: BackupProvider = {
  id: 'google-drive',
  label: providerLabel('google-drive'),
  operational: hasGoogleCredentials(),
  storageHidden: true,
  describe: (m) => ({
    id: 'google-drive',
    label: providerLabel('google-drive'),
    operational: hasGoogleCredentials(),
    unavailableReason: hasGoogleCredentials() ? null : m.providers.googleNoCredentials,
    storageTarget: m.providers.googleStorageTarget,
    storageHidden: true,
  }),
  authorize: googleAuthorize,
  listAppFiles,
  uploadFile,
  downloadFile,
  deleteFile,
};
