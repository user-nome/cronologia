import type { BackupProviderId } from '@zero/types/drive';

export type Language = 'pt-BR' | 'en' | 'ko' | 'zh-CN' | 'ja';

export interface AppSettings {
  /** App key alternativa do Dropbox guardada no cofre; '' usa a chave do build. */
  driveClientId: string;
  drivePassphrase: string;
  /** Idioma da interface e das mensagens do app. */
  language: Language;
  /**
   * Provedor de backup escolhido pelo usuário.
   *
   * Vai para o `settings.json` junto com o idioma, e não para o cofre: escolher
   * para onde enviar a biblioteca não é segredo, e amarrar isso ao cofre faria o
   * app não lembrar o destino com o cofre fechado. As **sessões** de cada
   * provedor é que vivem no cofre, uma entrada por provedor (ver
   * `src/main/drive/state.ts`).
   */
  backupProvider: BackupProviderId;
}
