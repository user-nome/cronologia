import type { AppSettings, BackupProviderId, DriveStatus } from '@zero/types';
import { isVaultError } from '@zero/main/vault/errors';
import { providerLabel } from '@zero/main/drive/constants';
import { dropboxAppKey } from '@zero/main/drive/providers/dropbox/credentials';
import { DROPBOX_SCOPE_VERSION } from '@zero/main/drive/providers/dropbox/constants';
import { GOOGLE_SCOPE_VERSION } from '@zero/main/drive/providers/google/constants';
import { currentMessages } from '@zero/main/i18n';
import { loadSettings, saveSettings } from '@zero/main/settings';
import {
  VAULT_SECRET,
  clearSecret,
  readJsonSecret,
  vaultUnlocked,
  writeJsonSecret,
} from '@zero/main/vault/secrets';

export interface Tokens {
  accessToken: string;
  refreshToken?: string | undefined;
  expiresAt: number;
  accountEmail: string | null;
  lastSync: string | null;
  scopeVersion: number;
  /** Escopos concedidos na autorização (auditoria; ausente em sessões antigas). */
  grantedScopes?: string | undefined;
}

export interface DriveState {
  /** Provedor escolhido pelo usuário (`settings.backupProvider`). */
  provider: BackupProviderId;
  /**
   * Sessão do provedor escolhido; `null` quando ele não está conectado.
   *
   * Só a sessão ativa fica em memória, mas **cada** provedor tem a sua no cofre
   * (`TOKENS_SECRET`). Assim trocar de destino no app não desconecta o outro,
   * e voltar para ele já encontra o token válido.
   */
  tokens: Tokens | null;
  lastError: string | null;
  syncing: boolean;
}

/**
 * Onde cada provedor guarda a sessão, e com que versão de escopo ela foi
 * gravada. A tabela é a fonte única: `loadState` valida contra ela, `persistState`
 * escreve na entrada dela, e o cofre tem um nome por provedor.
 */
const TOKENS_SECRET: Record<BackupProviderId, { secret: string; scopeVersion: number }> = {
  dropbox: { secret: VAULT_SECRET.dropboxTokens, scopeVersion: DROPBOX_SCOPE_VERSION },
  'google-drive': {
    secret: VAULT_SECRET.googleDriveTokens,
    scopeVersion: GOOGLE_SCOPE_VERSION,
  },
};

/** Estado em memória do backup em nuvem, compartilhado por oauth/rest/backup. */
export const state: DriveState = {
  provider: 'dropbox',
  tokens: null,
  lastError: null,
  syncing: false,
};

let statusListener: ((status: DriveStatus) => void) | null = null;

function isTokens(value: unknown): value is Tokens {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<Tokens>;
  return typeof record.accessToken === 'string' && typeof record.scopeVersion === 'number';
}

/**
 * Recarrega os tokens do cofre. É a **única** fonte: com o cofre fechado não
 * há sessão de nuvem em memória nem em disco (falha fechada).
 */
export function loadState(): void {
  state.tokens = null;
  state.provider = loadSettings().backupProvider;
  if (!vaultUnlocked()) return;
  const entrada = TOKENS_SECRET[state.provider];
  const tokens = readJsonSecret(entrada.secret, isTokens);
  if (tokens === null) return;
  if (tokens.scopeVersion === entrada.scopeVersion) {
    state.tokens = tokens;
  } else {
    state.lastError = currentMessages().driveErrors.permissionsUpdated(
      providerLabel(state.provider),
    );
  }
}

/** Persiste a sessão ativa no cofre (exige cofre desbloqueado, senão lança). */
export function persistState(): void {
  const secret = TOKENS_SECRET[state.provider].secret;
  if (state.tokens !== null) {
    writeJsonSecret(secret, state.tokens);
    return;
  }
  clearSecret(secret);
}

/**
 * Troca o provedor de backup e carrega a sessão dele.
 *
 * A troca grava a escolha em `settings.json` (é o que sobrevive ao cofre
 * fechado) e só então troca a sessão em memória. Provedor não catalogado, ou
 * indisponível neste build, volta com o erro e **não** mexe na escolha: trocar
 * para um destino que não existe deixaria o app sem backup sem o usuário ter
 * pedido isso.
 */
export function switchProvider(id: BackupProviderId): { ok: boolean; error?: string } {
  if (id === state.provider) return { ok: true };
  let salvo: AppSettings;
  try {
    salvo = saveSettings({ ...loadSettings(), backupProvider: id });
  } catch (error) {
    // Cofre fechado trava o `saveSettings` (que grava segredo e disco juntos).
    // A escolha não muda, e o erro vai traduzido para a barra de status.
    return { ok: false, error: toMessage(error) };
  }
  // `saveSettings` normaliza para o padrão o que não reconhece no catálogo: se o
  // que voltou não é o que foi pedido, nada foi trocado e o destino antigo segue
  // valendo. Trocar para um destino inexistente deixaria o app sem backup sem
  // ninguém ter pedido isso.
  if (salvo.backupProvider !== id) {
    return { ok: false, error: currentMessages().settings.providerSwitchFailed };
  }
  state.provider = id;
  loadState();
  emit();
  return { ok: true };
}

export function getStatus(): DriveStatus {
  return {
    connected: state.tokens !== null && state.tokens.accessToken !== '',
    syncing: state.syncing,
    lastSync: state.tokens?.lastSync ?? null,
    lastError: state.lastError,
    accountEmail: state.tokens?.accountEmail ?? null,
  };
}

export function emit(): void {
  statusListener?.(getStatus());
}

export function onStatus(listener: (status: DriveStatus) => void): void {
  statusListener = listener;
}

/**
 * Chave do aplicativo Dropbox (App key) em uso.
 *
 * O override guardado no cofre prevalece; sem ele, usa a chave injetada no
 * bundle pelo build. O valor de build é público no binário, como toda App key
 * de cliente desktop.
 */
export function appKey(): string {
  const configured = loadSettings().driveClientId.trim();
  if (configured !== '') return configured;
  return dropboxAppKey();
}

export function setError(message: string | null): void {
  state.lastError = message;
  emit();
}

export function toMessage(error: unknown): string {
  // Erro de domínio do cofre chega como código; a mensagem é localizada aqui.
  if (isVaultError(error)) return currentMessages().vault.errors[error.code];
  return error instanceof Error ? error.message : String(error);
}
