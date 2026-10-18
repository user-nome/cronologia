import { describe, expect, it } from 'vitest';
import { field, isRecord } from '@zero/shared/json';

/**
 * A guarda que todo dado de fora atravessa: o `JSON.parse` devolve `unknown`, e
 * `typeof === 'object'` sozinho não estreita nada para o TypeScript. Estes testes
 * fixam **por que** ela existe, porque a tentação é sempre trocar por
 * `value as Record<string, unknown>` e devolver o `any` do `Reflect.get` para a
 * frente do typecheck.
 */
describe('shared/json: isRecord', () => {
  it('aceita objeto e recusa null, primitivo e função', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord('texto')).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });

  it('aceita array, porque a checagem de lista vem depois', () => {
    // `Array.isArray` é sempre o segundo passo de quem chama: uma lista de obras
    // e uma página de `list_folder` chegam como array, e é `isWorkArray` /
    // `isListFolderResponse` que dizem se o conteúdo presta.
    expect(isRecord([])).toBe(true);
    expect(isRecord([1, 2])).toBe(true);
  });
});

describe('shared/json: field', () => {
  it('lê a propriedade presente e devolve undefined na ausente', () => {
    const record = { nome: 'Cronologia', vazio: null, zero: 0 };
    expect(field(record, 'nome')).toBe('Cronologia');
    expect(field(record, 'ausente')).toBeUndefined();
  });

  it('preserva o valor falsy em vez de trocar por undefined', () => {
    // O ponto do `in` antes do `Reflect.get`: `''`, `0`, `false` e `null` são
    // respostas legítimas de uma API, e tratá-las como "não veio" é o que faz
    // um campo obrigatório passar semvalor.
    expect(field({ texto: '' }, 'texto')).toBe('');
    expect(field({ numero: 0 }, 'numero')).toBe(0);
    expect(field({ flag: false }, 'flag')).toBe(false);
    expect(field({ nulo: null }, 'nulo')).toBeNull();
  });

  it('lê propriedade herdada e símbolo sem quebrar', () => {
    // `Reflect.get` sobe a cadeia de protótipos, ao contrário de `obj[key]`
    // com `hasOwn` false. num objeto de JSON plano isso não muda nada, e
    // manter `Reflect.get` é o que evita essa diferença aparecer só em produção.
    const record = Object.create({ herdado: 'do pai' }) as Record<string, unknown>;
    expect(field(record, 'herdado')).toBe('do pai');
    expect(field(record, Symbol('s') as unknown as string)).toBeUndefined();
  });
});
