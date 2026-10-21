/**
 * Valor que vem de fora do domínio e ainda não foi conferido.
 *
 * É alias de `unknown`, e não um tipo novo: o valor continua sendo `unknown`
 * para o TypeScript, que é o que mantém a conferência obrigatória.
 */
export type Untrusted = unknown;
