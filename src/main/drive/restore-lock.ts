/**
 * Trava exponencial para restauração de backup com senha errada.
 *
 * As duas primeiras falhas são livres (erro de digitação acontece); a partir
 * da terceira, cada nova falha aumenta a espera até 15 minutos, para inviabilizar
 * tentativa automática de senha pelo modal.
 *
 * O estado vive só em memória: reiniciar o app zera a trava. Isso é de
 * propósito: quem tem o blob cifrado do Dropbox brute-força fora do app (a
 * trava não ajuda lá); aqui o alvo é a sessão local, com tentativa digitada.
 * Zerar também no sucesso evita punir quem acertou a senha depois de errar.
 */
const FREE_ATTEMPTS = 2;

let attempts = 0;
let lockUntil = 0;

/**
 * Rampa da espera por tentativa (contando a partir da 3ª falha): 10 s, 30 s,
 * 1 min, 5 min e 15 min, onde satura.
 *
 * A forma é `switch` e não "índice numa tabela" por um motivo concreto: com
 * `noUncheckedIndexedAccess`, `TABELA[indice]` com `indice: number` continua
 * sendo `number | undefined`, e o `??` defensivo que isso exige é um branch que
 * **nenhum** valor de `attempts` alcança, porque o `Math.min` já prende o índice
 * ao intervalo. O `switch` é total por construção (o `default` é o teto), tem
 * todos os ramos alcançáveis por teste e deixa a rampa em um lugar só.
 */
function penaltySeconds(tentativa: number): number {
  switch (tentativa) {
    case 1:
      return 10;
    case 2:
      return 30;
    case 3:
      return 60;
    case 4:
      return 300;
    default:
      return 900;
  }
}

/** Segundos até a trava liberar; 0 quando destravado. */
export function restoreLockRemainingSec(): number {
  return Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
}

/** Registra falha de senha e (a partir da 3ª) reforça a trava. */
export function registerRestoreFailure(): void {
  attempts += 1;
  if (attempts <= FREE_ATTEMPTS) return;
  lockUntil = Date.now() + penaltySeconds(attempts - FREE_ATTEMPTS) * 1000;
}

/** Zera tentativas e trava (sucesso ou reinício do processo). */
export function resetRestoreLock(): void {
  attempts = 0;
  lockUntil = 0;
}
