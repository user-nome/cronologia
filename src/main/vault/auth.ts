import { lockRemainingMs, lockUntilFor } from '@zero/main/vault/lockout';
import type { UnlockKind, VaultStatus } from '@zero/types/vault';
import type { VaultContainer } from '@zero/main/vault/container';

/**
 * Trava exponencial: a contagem de tentativas e o estado que a interface vê.
 *
 * A trava é única para as duas formas de abertura (senha mestra e PIN) de
 * propósito. Um contador por credencial daria ao atacante que escolhe o método
 * uma orçamento maior do que o app impõe: bastaria alternar entre PIN e senha
 * para nunca chegar ao degrau de 24 h. E o PIN é justamente o que se erra todo
 * dia, então a rampa compartilhada é também o que segura o atrito.
 *
 * O estado mora no cabeçalho do container (em claro, como o `lockUntil` de
 * sempre): a trava precisa sobreviver a reinício, senão fechar e abrir o app
 * viraria o botão de reset da rampa.
 */

/** Estado da trava no container. */
interface AuthState {
  attempts: number;
  /** Epoch em ms; `0` = sem trava. */
  lockUntil: number;
}

/** Estado da trava lido do container em disco. */
export function authState(container: VaultContainer | null): AuthState {
  if (container === null) return { attempts: 0, lockUntil: 0 };
  return { attempts: container.attempts, lockUntil: container.lockUntil };
}

/**
 * Estado novo depois de uma credencial recusada: soma a tentativa e aplica a
 * espera do degrau. `attempts` nunca é zerado por aqui, então a rampa só
 * recomeça com um desbloqueio bem-sucedido.
 */
export function registerFailedAttempt(state: AuthState, now = Date.now()): AuthState {
  const attempts = state.attempts + 1;
  return { attempts, lockUntil: lockUntilFor(attempts, now) };
}

/** Estado zerado, gravado quando o desbloqueio dá certo. */
export function clearedAttempts(): AuthState {
  return { attempts: 0, lockUntil: 0 };
}

/** Quanto falta da trava agora (0 = liberado). */
export function remainingMs(state: AuthState, now = Date.now()): number {
  return lockRemainingMs(state.lockUntil, now);
}

/**
 * Visão do cofre para a interface. `exists` vem do disco e `unlocked` da
 * sessão: são coisas diferentes (um cofre pode existir fechado) e a tela
 * decide com as duas.
 */
export function statusFrom(
  state: AuthState,
  exists: boolean,
  unlocked: boolean,
  hasRecovery: boolean,
  now = Date.now(),
): VaultStatus {
  return {
    exists,
    unlocked,
    attempts: state.attempts,
    lockUntil: state.lockUntil,
    lockRemainingMs: remainingMs(state, now),
    hasRecovery,
  };
}

/**
 * Código de recusa por credencial. Três mensagens distintas porque são três
 * usuários distintos digitando: quem erra o PIN todo dia precisa saber que
 * foi o PIN, e quem está na tela de recuperação precisa saber que a frase não
 * abriu o cofre (e não que o cofre está quebrado).
 */
export function wrongCredentialCode(kind: UnlockKind): 'vaultWrongMaster' | 'vaultWrongPin' {
  return kind === 'master' ? 'vaultWrongMaster' : 'vaultWrongPin';
}
