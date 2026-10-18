/**
 * Política de credencial do cofre: o formato que o app aceita do usuário.
 *
 * São regras puras, sem Node e sem DOM, e moram aqui (e não em
 * `main/vault/crypto.ts`) porque o renderer precisa das mesmas para validar o
 * que está sendo digitado enquanto o main valida de novo antes de gravar.
 * Divergir as duas cópias era o risco real: o main aceitaria e a tela não, ou o
 * inverso, sem erro nenhum.
 *
 * Nenhuma delas guarda segredo: são comprimentos e formatos públicos.
 */

/** Comprimento fixo da senha mestra: é a chave que embrulha tudo. */
export const MASTER_PASSWORD_LENGTH = 24;

/** O PIN é numérico e de comprimento fixo: é o que se digita todo dia. */
export const PIN_LENGTH = 8;

/** Número mínimo de palavras da frase de recuperação (escrita pelo usuário). */
export const RECOVERY_MIN_WORDS = 12;

const PIN_PATTERN = new RegExp(`^\\d{${PIN_LENGTH}}$`);

/** PIN no formato aceito: exatamente `PIN_LENGTH` dígitos, nada mais. */
export function isPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

/** Senha mestra no formato aceito: exatamente `MASTER_PASSWORD_LENGTH`. */
export function isMasterPasswordFormat(password: string): boolean {
  return password.length === MASTER_PASSWORD_LENGTH;
}
