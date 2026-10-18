import fs from 'fs';
import path from 'path';
import { writeJsonAtomic } from '@zero/main/jsonfile';
import { configDir } from '@zero/main/paths';
import type { AppSettings, BackupProviderId, Language } from '@zero/types';
import { VAULT_SECRET, vaultUnlocked } from '@zero/main/vault/secrets';
import { getSecret, setSecret } from '@zero/main/vault/vault';

/**
 * Configurações persistidas. O disco guarda `language` e `backupProvider`: os
 * segredos (`drivePassphrase`, `driveClientId`) moram no cofre de segredos em
 * `/var/lib/.cronologia/.vault` e são lidos dele quando o cofre está
 * desbloqueado (sem cofre aberto voltam `''`, falha fechada). Um `settings.json`
 * antigo com `enc:`/keyring é simplesmente ignorado no primeiro salvamento.
 * Ver `docs/credenciais.md`.
 *
 * O provedor é dos poucos que fica **fora** do cofre de propósito: ele não é
 * segredo, e o app precisa saber para onde enviar a biblioteca mesmo com o
 * cofre fechado, para mostrar o estado certo em vez de "desconectado".
 */
const DEFAULTS: AppSettings = {
  driveClientId: '',
  drivePassphrase: '',
  language: 'pt-BR',
  backupProvider: 'dropbox',
};

/** Catálogo fechado de provedores; qualquer outra coisa cai no padrão. */
function isProviderId(value: unknown): value is BackupProviderId {
  return value === 'dropbox' || value === 'google-drive';
}

function ensureConfigDir(): void {
  fs.mkdirSync(configDir(), { recursive: true });
}

function settingsPath(): string {
  ensureConfigDir();
  return path.join(configDir(), 'settings.json');
}

/** Lê o idioma; qualquer valor fora do catálogo cai no padrão. */
function languageField(record: object): Language {
  const value: unknown = Reflect.get(record, 'language');
  return value === 'pt-BR' ||
    value === 'en' ||
    value === 'ko' ||
    value === 'zh-CN' ||
    value === 'ja'
    ? value
    : DEFAULTS.language;
}

/** Campos do disco (fora do cofre): idioma e provedor escolhido. */
interface OnDisk {
  language: Language;
  backupProvider: BackupProviderId;
}

function onDiskField(record: object): OnDisk {
  const provider: unknown = Reflect.get(record, 'backupProvider');
  return {
    language: languageField(record),
    backupProvider: isProviderId(provider) ? provider : DEFAULTS.backupProvider,
  };
}

function readOnDisk(): OnDisk {
  try {
    const file = settingsPath();
    if (!fs.existsSync(file)) {
      return { language: DEFAULTS.language, backupProvider: DEFAULTS.backupProvider };
    }
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (typeof parsed !== 'object' || parsed === null) {
      return { language: DEFAULTS.language, backupProvider: DEFAULTS.backupProvider };
    }
    return onDiskField(parsed);
  } catch {
    return { language: DEFAULTS.language, backupProvider: DEFAULTS.backupProvider };
  }
}

/** Segredos do cofre; cofre fechado/ilegível → `''` (falha fechada). */
function readSecrets(): Pick<AppSettings, 'driveClientId' | 'drivePassphrase'> {
  const empty = { driveClientId: '', drivePassphrase: '' };
  if (!vaultUnlocked()) return empty;
  try {
    return {
      drivePassphrase: getSecret(VAULT_SECRET.drivePassphrase) ?? '',
      driveClientId: getSecret(VAULT_SECRET.driveClientId) ?? '',
    };
  } catch {
    return empty;
  }
}

export function loadSettings(): AppSettings {
  return { ...DEFAULTS, ...readSecrets(), ...readOnDisk() };
}

/**
 * Grava as configurações: o idioma no disco (0600, escrita atômica) e os
 * segredos no cofre. Exige cofre desbloqueado — sem ele lança
 * `VaultError('vaultLocked')`, e nada é gravado (nada é sobrescrito com `''`).
 * O chamador (UI) abre o cofre antes de chegar aqui.
 */
export function saveSettings(settings: AppSettings): AppSettings {
  const next: AppSettings = {
    driveClientId: settings.driveClientId.trim(),
    drivePassphrase: settings.drivePassphrase,
    language:
      settings.language === 'en' ||
      settings.language === 'ko' ||
      settings.language === 'zh-CN' ||
      settings.language === 'ja'
        ? settings.language
        : 'pt-BR',
    backupProvider: isProviderId(settings.backupProvider)
      ? settings.backupProvider
      : DEFAULTS.backupProvider,
  };
  // Segredos primeiro: se o cofre estiver fechado, a exceção aborta antes de
  // qualquer escrita em disco.
  setSecret(VAULT_SECRET.drivePassphrase, next.drivePassphrase);
  setSecret(VAULT_SECRET.driveClientId, next.driveClientId);
  writeJsonAtomic(
    settingsPath(),
    { language: next.language, backupProvider: next.backupProvider },
    0o600,
  );
  return next;
}
