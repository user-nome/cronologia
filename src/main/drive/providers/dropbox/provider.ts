import type { BackupProvider } from '@zero/main/drive/provider';
import { providerLabel } from '@zero/main/drive/constants';
import { appKey } from '@zero/main/drive/state';
import {
  authorize,
} from '@zero/main/drive/providers/dropbox/session';
import {
  deleteFile,
  downloadFile,
  listAppFiles,
  uploadFile,
} from '@zero/main/drive/providers/dropbox/rest';

/**
 * Provedor Dropbox: só adapta a sessão e o REST já existentes ao contrato
 * `BackupProvider`; a implementação de verdade está em `session.ts` e
 * `rest.ts`, com o fluxo OAuth em `oauth.ts` (guia em `docs/dropbox.md`).
 *
 * `operational` é um getter, e não um valor fixo como no Google Drive: a App key
 * efetiva é `appKey()`, que também considera o override
 * `settings.driveClientId` gravado no cofre. Um valor avaliado uma vez no import
 * congelaria a disponibilidade no momento em que o app carregou, e quem grava o
 * override só passa a ter chave depois de abrir o cofre.
 */
export const dropboxProvider: BackupProvider = {
  id: 'dropbox',
  label: providerLabel('dropbox'),
  get operational() {
    return appKey() !== '';
  },
  storageHidden: false,
  describe: (m) => ({
    id: 'dropbox',
    label: providerLabel('dropbox'),
    operational: appKey() !== '',
    unavailableReason: appKey() === '' ? m.driveErrors.configureAppKey : null,
    storageTarget: m.providers.dropboxStorageTarget,
    storageHidden: false,
  }),
  authorize,
  listAppFiles,
  uploadFile,
  downloadFile,
  deleteFile,
};
