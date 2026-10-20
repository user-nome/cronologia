export {
  changeMasterPassword,
  changePin,
  createVault,
  deleteSecret,
  destroyVault,
  getSecret,
  lockVault,
  resetPin,
  setSecret,
  unlockVault,
  vaultStatus,
} from '@zero/main/vault/vault';
export {
  clearDestroyedFlag,
  decodeContainer,
  encodeContainer,
  ensureStructure,
  isDestroyed,
  isDirUnavailable,
  markDestroyed,
  readContainer,
  vaultDir,
  vaultExists,
  vaultPath,
  writeContainer,
} from '@zero/main/vault/store';
export { VaultError, isVaultError } from '@zero/main/vault/errors';
export { setupVaultDirectory } from '@zero/main/vault/privilege';
export type { VaultSetupResult } from '@zero/main/vault/privilege';
export { IDLE_LOCK_MS, vaultSession } from '@zero/main/vault/session';
export { KDF_MASTER, KDF_PIN, kdfProfileFor } from '@zero/main/vault/crypto';
export { LOCKOUT_DELAYS_MS, delayFor } from '@zero/main/vault/lockout';
export { MASTER_PASSWORD_LENGTH, PIN_LENGTH, RECOVERY_MIN_WORDS } from '@zero/shared';
export type { BlobRead } from '@zero/main/vault/container';
export type {
  ChangeMasterInput,
  ChangePinInput,
  CreateVaultInput,
  CredentialKind,
  ResetPinInput,
  UnlockInput,
  UnlockKind,
  VaultErrorCode,
  VaultResult,
  VaultStatus,
} from '@zero/types/vault';
