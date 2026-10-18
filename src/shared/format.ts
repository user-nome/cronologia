import { RECOVERY_MIN_WORDS } from '@zero/shared/policy';

/**
 * Formatação de credenciais, compartilhada pelo renderer (contagem regressiva
 * da trava, contagem de palavras) e pelo main (normalizar a frase antes de
 * derivar). Pura e sem estado: nada de Node nem de DOM.
 */

/**
 * Frase de recuperação normalizada: espaços colapsados, **caixa preservada**.
 *
 * Só o espaço é normalizado, e a caixa não. Duas razões, uma de ergonomia e
 * outra de segurança:
 *
 * - quem anota a frase num celular quebra a linha e cola com espaço a mais, ou
 *   digita com Enter no meio; normalizar o espaço evita o resgate impossível de
 *   exigir que a pessoa decorasse o espaçamento exato;
 * - a caixa é informação: `Cavalo` e `cavalo` não são a mesma palavra, e cada
 *   palavra capitalizada é um bit a mais que quem ataca o cofre tem de chutar.
 *   Igualar as duas jogaria fora exatamente o que a frase tem de mais forte, e
 *   faria a pessoa escrever a frase duas vezes sem ganhar nada em troca.
 *
 * O que a normalização **não** faz é acentos nem pontuação: `cá` e `ca` são
 * palavras diferentes aqui, do mesmo jeito que `Cavalo` e `cavalo`.
 */
export function normalizePhrase(phrase: string): string {
  return phrase
    .trim()
    .split(/\s+/u)
    .filter((word) => word !== '')
    .join(' ');
}

/** Palavras da frase, já normalizadas. */
export function countWords(phrase: string): number {
  const normalized = normalizePhrase(phrase);
  return normalized === '' ? 0 : normalized.split(' ').length;
}

/** A frase tem as palavras mínimas que o app exige. */
export function hasEnoughWords(phrase: string): boolean {
  return countWords(phrase) >= RECOVERY_MIN_WORDS;
}

/** Milissegundos em um segundo. O cofre grava tudo em ms, e a tela lê em s. */
export const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/**
 * Espera que falta, em notação de relógio.
 *
 * Aceita o valor já em ms (é o que o cofre grava) e devolve algo que cabe numa
 * frase curta: `10s`, `1min30s`, `2h5min`, `24h`. Segundos exactos viram
 * `30s` e não `0min30s`, porque a segunda é a unidade que a pessoa lê.
 */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / MS_PER_SECOND));
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR;
  const hours = Math.floor(totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));

  if (hours > 0) return minutes > 0 ? `${hours}h${minutes}min` : `${hours}h`;
  if (minutes > 0) return seconds > 0 ? `${minutes}min${seconds}s` : `${minutes}min`;
  return `${seconds}s`;
}
