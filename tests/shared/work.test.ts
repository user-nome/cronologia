import { describe, expect, it } from 'vitest';
import { isWorkArray, isWorkRecord } from '@zero/shared/work';
import { makeWork } from '../helpers/fixtures.ts';

/**
 * Validador que `library.ts` (falha fechada) e `drive/backup.ts` (lista vazia
 * legítima) compartilham. O mesmo `unknown` tem duas respostas diferentes
 * dependendo de quem chamou, e por isso o teste fixa a **forma** e deixa cada
 * chamador decidir o destino do `false`.
 */
describe('shared/work: isWorkRecord', () => {
  it('aceita obra completa e recusa objeto que não é obra', () => {
    expect(isWorkRecord(makeWork())).toBe(true);
    expect(isWorkRecord(null)).toBe(false);
    expect(isWorkRecord(undefined)).toBe(false);
    expect(isWorkRecord('obra')).toBe(false);
    expect(isWorkRecord(42)).toBe(false);
    expect(isWorkRecord([])).toBe(false);
  });

  it('recusa quando falta qualquer campo obrigatório', () => {
    for (const campo of ['id', 'title', 'synopsis', 'type', 'status', 'progress'] as const) {
      // `structuredClone` + `Reflect.deleteProperty`: um `delete obra[campo]`
      // com chave variável é bloqueado pelo lint, e o motivo do lint continua
      // valendo aqui (a chave vem de uma lista, não do código).
      const obra = structuredClone(makeWork()) as unknown as Record<string, unknown>;
      Reflect.deleteProperty(obra, campo);
      expect(isWorkRecord(obra)).toBe(false);
    }
  });

  it('recusa quando o campo existe mas no tipo errado', () => {
    const base = makeWork();
    expect(isWorkRecord({ ...base, id: 1 })).toBe(false);
    expect(isWorkRecord({ ...base, title: null })).toBe(false);
    expect(isWorkRecord({ ...base, synopsis: {} })).toBe(false);
    expect(isWorkRecord({ ...base, type: 2 })).toBe(false);
    expect(isWorkRecord({ ...base, status: [] })).toBe(false);
    // `progress` numérico é o que a régua do cartão consome; string aqui
    // quebraria `clampProgress` em tempo de render, não na gravação.
    expect(isWorkRecord({ ...base, progress: '10' })).toBe(false);
  });

  it('aceita obra sem os campos opcionais', () => {
    // Backup antigo não tinha `createdAt`/`updatedAt`/`category`/`marker`, e
    // eles são conferidos só no que o app grava, não no que ele lê.
    const { createdAt, updatedAt, ...minima } = makeWork();
    expect(createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(updatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(isWorkRecord(minima)).toBe(true);
  });
});

describe('shared/work: isWorkArray', () => {
  it('aceita lista vazia: acervo e backup sem obra são resultado legítimo', () => {
    expect(isWorkArray([])).toBe(true);
  });

  it('aceita lista só com obras válidas', () => {
    expect(isWorkArray([makeWork(), makeWork()])).toBe(true);
  });

  it('recusa lista com um elemento inválido, mesmo no fim', () => {
    // `every` sem índice: um único `{ id: 1 }` no fim da lista já contamina o
    // acervo inteiro, e é o que faria o acervo "voltar" com meia entrada.
    expect(isWorkArray([makeWork(), { id: 1 }])).toBe(false);
    expect(isWorkArray([{ id: 1 }, makeWork()])).toBe(false);
  });

  it('recusa o que não é lista', () => {
    expect(isWorkArray({ 0: makeWork() })).toBe(false);
    expect(isWorkArray('[]')).toBe(false);
    expect(isWorkArray(null)).toBe(false);
  });
});
