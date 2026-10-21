/**
 * Guarda de dado que vem de fora: o JSON da nuvem, o container em disco, o
 * segredo guardado no cofre.
 *
 * `unknown` é o tipo certo na chegada, mas o `typeof === 'object'` sozinho não
 * ajuda o TypeScript: ele precisa saber que o valor tem propriedades
 * indexáveis antes de `in` e de `Reflect.get`. Esta função é a ponte nomeada
 * entre os dois, e ela mora em `src/shared/` porque `library.ts`, `vault/` e os
 * três módulos de `drive/` fazem exatamente a mesma pergunta.
 */

import type { Untrusted } from '@zero/types/errors';

/**
 * `true` quando `value` é um objeto (não `null`, não primitivo), e portanto
 * admite `in`, `Reflect.get` e acesso por chave.
 *
 * Arrays também passam: é proposital, porque `Array.isArray` é a checagem
 * seguinte em todo uso real (uma lista de obras, uma página de `list_folder`).
 */
export function isRecord(value: Untrusted): value is Record<string, Untrusted> {
  return typeof value === 'object' && value !== null;
}

/**
 * Lê uma propriedade de um objeto já conferido por {@link isRecord}.
 *
 * Existe para o par `in` + `Reflect.get` ficar escrito uma vez só, e devolve
 * dado não-confiável de propósito: quem chamou ainda vai conferir o tipo.
 */
export function field(value: Record<string, Untrusted>, key: string): Untrusted {
  return key in value ? Reflect.get(value, key) : undefined;
}
