/**
 * Valor que vem de fora do domínio e ainda não foi conferido.
 *
 * `unknown` é o tipo honesto para isso — é o que `JSON.parse`, `fetch` e o
 * `catch` de uma promise entregam — e o nome diz o que o tipo **significa**:
 * não-confiável até passar por um validador (`isRecord`, `isWorkArray`,
 * `isVaultError`). Sem o nome, `unknown` no meio de uma assinatura parece
 * descuido, e o próximo a mexer no arquivo pode trocar por `any` achando que
 * ninguém está olhando.
 *
 * É alias de `unknown`, e não um tipo novo: o valor continua sendo `unknown`
 * para o TypeScript, que é o que mantém a conferência obrigatória.
 */
export type Untrusted = unknown;
