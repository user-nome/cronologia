/**
 * Guarda de dado que vem de fora: o JSON da nuvem, o container em disco, o
 * segredo guardado no cofre.
 *
 * `unknown` é o tipo certo na chegada (é o que o `JSON.parse` devolve), mas o
 * `typeof === 'object'` sozinho não ajuda o TypeScript: ele precisa saber que o
 * valor tem propriedades indexáveis antes de `in` e de `Reflect.get`. Esta
 * função é a ponte nomeada entre os dois, e ela mora em `src/shared/` porque
 * `library.ts`, `vault/` e os três módulos de `drive/` fazem exatamente a mesma
 * pergunta.
 */

/**
 * `true` quando `value` é um objeto (não `null`, não primitivo), e portanto
 * admite `in`, `Reflect.get` e acesso por chave.
 *
 * Arrays também passam: é proposital, porque `Array.isArray` é a checagem
 * seguinte em todo uso real (uma lista de obras, uma página de `list_folder`).
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Lê uma propriedade de um objeto já conferido por {@link isRecord}.
 *
 * Existe para o par `in` + `Reflect.get` ficar escrito uma vez só: `'x' in value`
 * estreita o tipo, mas o valor continua `unknown` e precisa de um segundo
 * passo. Devolve `unknown` de propósito, porque quem chamou ainda vai conferir
 * o tipo do campo.
 */
export function field(value: Record<string, unknown>, key: string): unknown {
  return key in value ? Reflect.get(value, key) : undefined;
}
