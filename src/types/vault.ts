/** Parâmetros do Argon2id gravados no container do cofre (lidos na leitura). */
export interface VaultKdfParams {
  /** Memória em KiB (16 MiB a 1 GiB na faixa aceita). */
  memoryKiB: number;
  /** Iterações (1 a 8 na faixa aceita). */
  iterations: number;
  /** Threads (1 a 8 na faixa aceita). */
  parallelism: number;
}

/**
 * Como o usuário está tentando abrir o cofre.
 *
 * `master` é a senha mestra de 24 caracteres; `pin` é o código de 8 dígitos
 * do dia a dia. A frase de recuperação **não é forma de login**: ela só serve
 * para redefinir o PIN (`ResetPinInput`).
 */
export type UnlockKind = 'master' | 'pin';

/**
 * Toda credencial que pode embrulhar a chave-mestra. É a união do que abre o
 * cofre (`UnlockKind`) com o que só o redefine (`recovery`): cada uma tem seu
 * custo de Argon2id, e por isso mora aqui, e não espalhada pelo domínio.
 */
export type CredentialKind = UnlockKind | 'recovery';

/**
 * Códigos de erro do cofre. O núcleo lança `VaultError` com o código; quem
 * expõe o erro ao usuário (IPC/UI) localiza a mensagem no bundle corrente.
 */
export type VaultErrorCode =
  | 'vaultExists'
  | 'vaultMissing'
  | 'vaultLocked'
  | 'vaultLockedOut'
  | 'vaultInvalidMaster'
  | 'vaultWeakMaster'
  | 'vaultWrongMaster'
  | 'vaultInvalidPin'
  | 'vaultWeakPin'
  | 'vaultWrongPin'
  | 'vaultInvalidRecovery'
  | 'vaultWeakRecovery'
  | 'vaultWrongRecovery'
  | 'vaultTampered'
  | 'libraryTampered'
  | 'vaultDestroyed'
  | 'vaultDirUnavailable'
  | 'vaultAuthCancelled';

/** Estado do cofre exposto ao renderer (`window.api.vault.status()`). */
export interface VaultStatus {
  /** O arquivo do cofre existe (ainda que esteja ilegível/adulterado). */
  exists: boolean;
  /** Há chave na sessão (cofre criado ou desbloqueado). */
  unlocked: boolean;
  /** Tentativas de desbloqueio erradas consecutivas (0 = nenhuma). */
  attempts: number;
  /** Epoch em ms até quando o desbloqueio está suspenso (0 = sem trava). */
  lockUntil: number;
  /** Quanto falta da trava, em ms (0 = liberado). A UI reconta a cada segundo. */
  lockRemainingMs: number;
  /** O cofre tem frase de recuperação, que é o que redefine o PIN. */
  hasRecovery: boolean;
}

/**
 * Resposta dos canais de cofre: **nunca lançam** (padrão do app). A falha
 * carrega o código para o renderer localizar a mensagem no bundle corrente e
 * `retryInMs` (0 = sem espera) para a contagem regressiva da trava.
 */
export type VaultResult =
  { ok: true; status: VaultStatus } | { ok: false; code: VaultErrorCode; retryInMs: number };

/**
 * Criação do cofre: a senha mestra embrulha a chave, o PIN do dia a dia
 * embrulha a mesma chave e a frase de recuperação é a prova de posse que
 * redefine o PIN. Os três precisam vir juntos porque uma chave sem PIN obriga a
 * digitar 24 caracteres todo dia, e uma frase sem valor é um campo morto.
 */
export interface CreateVaultInput {
  masterPassword: string;
  pin: string;
  /** Frase escrita pelo próprio usuário (o app não a gera). */
  recoveryPhrase: string;
}

/** Tentativa de abertura: o valor digitado e de que forma ele é lido. */
export interface UnlockInput {
  credential: string;
  kind: UnlockKind;
}

/** Redefinição do PIN provando posse da frase de recuperação. */
export interface ResetPinInput {
  phrase: string;
  newPin: string;
}

/**
 * Troca da senha mestra com o cofre aberto. A senha atual é exigida de novo
 * porque o cofre aberto é estado do processo, não prova de posse: quem chegar
 * na mesa de alguém com o app já aberto não pode trocar a chave-mestra.
 */
export interface ChangeMasterInput {
  currentPassword: string;
  newPassword: string;
}

/** Troca do PIN do dia a dia, pelo mesmo motivo da troca da senha mestra. */
export interface ChangePinInput {
  currentPin: string;
  newPin: string;
}
