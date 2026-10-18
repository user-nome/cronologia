/**
 * Trava exponencial: cada falha de desbloqueio soma uma espera maior, e a
 * espera sobrevive a reinício porque fica em `lockUntil` (campo em claro do
 * cabeçalho do container).
 *
 * A rampa é uma função pura do número de tentativas, sem estado próprio: quem
 * aplica é `auth.ts`, que a persiste no container.
 */

/** Espera em ms por tentativa errada: 10 s, 30 s, 1 min, 1 h e depois 24 h. */
export const LOCKOUT_DELAYS_MS = [
  10_000, 30_000, 60_000, 3_600_000, 86_400_000,
] as const satisfies readonly [number, number, number, number, number];

/**
 * Teto da rampa (24 h). O índice é literal e a tabela é um tuple, então o tipo
 * já entrega `86400000`: não há `??` para o `noUncheckedIndexedAccess`
 * reclamar, e o valor continua escrito em um lugar só.
 */
export const LAST_DELAY_MS: (typeof LOCKOUT_DELAYS_MS)[4] = LOCKOUT_DELAYS_MS[4];

/** Espera aplicada à `attempts`-ésima falha (1ª falha = primeiro da lista). */
export function delayFor(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1), LOCKOUT_DELAYS_MS.length) - 1;
  return LOCKOUT_DELAYS_MS[index] ?? LAST_DELAY_MS;
}

/** `lockUntil` resultante da falha que acabou de acontecer. */
export function lockUntilFor(attempts: number, now: number): number {
  return now + delayFor(attempts);
}

/** Quanto falta da espera que termina em `lockUntil` (0 quando já passou). */
export function lockRemainingMs(lockUntil: number, now: number): number {
  return lockUntil > now ? lockUntil - now : 0;
}
