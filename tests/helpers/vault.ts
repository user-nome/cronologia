import { MASTER_PASSWORD_LENGTH, PIN_LENGTH } from '@zero/shared';
import { createVault, destroyVault, lockVault } from '@zero/main/vault';
import type { CreateVaultInput } from '@zero/types';

/**
 * Credenciais da suíte. A senha mestra tem os 24 caracteres do formato de
 * produção e o PIN os 8 dígitos, para que os testes exercitem a validação de
 * verdade em vez de um atalho que só existe no teste.
 *
 * A senha tem 4 classes de caractere (maiúsculas, minúsculas, dígitos e
 * símbolos) e nem sequência nem bloco repetido, então passa tanto pelo formato
 * quanto pela régua de trivialidade. O PIN tem 8 dígitos distintos e não parece
 * data, que é o que a régua do PIN aceita.
 */
export const MASTER = 'Tz7#mQ2!vZ9@pL4$xR8!nW3&';
export const PIN = '49201733';

/** 13 palavras distintas: passa das 12 mínimas e não repete nenhuma. */
export const PHRASE =
  'cavalo cenoura feira inverno bibliografia zettelkasten kalamita peixoto velleda aurora jubileu silhueta';

/** Entrada de criação usada pela maioria dos testes que precisa de cofre. */
export const VAULT_INPUT: CreateVaultInput = {
  masterPassword: MASTER,
  pin: PIN,
  recoveryPhrase: PHRASE,
};

/** Comprimentos que o app exige, expostos para os testes afirmarem o formato. */
export const FORMAT_LENGTHS = { master: MASTER_PASSWORD_LENGTH, pin: PIN_LENGTH } as const;

/**
 * Cofre novo e aberto, idempotente: zera a sessão anterior e recria o arquivo na
 * sandbox (`CRONOLOGIA_VAR_LIB`). Toda suíte que grava segredo passa por aqui
 * antes, porque sem cofre aberto `saveSettings`/`persistState` lançam
 * `vaultLocked`.
 */
export async function openTestVault(): Promise<void> {
  destroyVault();
  await createVault(VAULT_INPUT);
}

/**
 * Tranca o cofre sem apagá-lo.
 *
 * Serve para o caminho "existe mas está fechado", que é diferente do "não
 * existe": o primeiro derruba o token em memória, o segundo nem chega a ler o
 * cofre. `openTestVault` recria em cima, então os testes que usam este não
 * precisam de outra limpeza.
 */
export function closeTestVault(): void {
  lockVault();
}
