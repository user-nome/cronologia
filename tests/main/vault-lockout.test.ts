import { describe, expect, it } from 'vitest';
import {
  LAST_DELAY_MS,
  LOCKOUT_DELAYS_MS,
  delayFor,
  lockRemainingMs,
  lockUntilFor,
} from '@zero/main/vault/lockout';

describe('vault/lockout: trava exponencial', () => {
  it('escala 10 s → 30 s → 1 min → 1 h → 24 h', () => {
    expect(LOCKOUT_DELAYS_MS).toEqual([10_000, 30_000, 60_000, 3_600_000, 86_400_000]);
    expect(delayFor(1)).toBe(10_000);
    expect(delayFor(2)).toBe(30_000);
    expect(delayFor(3)).toBe(60_000);
    expect(delayFor(4)).toBe(3_600_000);
    expect(delayFor(5)).toBe(86_400_000);
  });

  it('acima da quinta falha repete sempre 24 h', () => {
    expect(delayFor(6)).toBe(LAST_DELAY_MS);
    expect(delayFor(50)).toBe(LAST_DELAY_MS);
    expect(delayFor(0)).toBe(10_000);
  });

  it('a espera máxima é o último elemento da tabela, não um literal solto', () => {
    expect(LAST_DELAY_MS).toBe(86_400_000);
    expect(LAST_DELAY_MS).toBe(LOCKOUT_DELAYS_MS[LOCKOUT_DELAYS_MS.length - 1]);

    // A tabela é um tuple com índice literal para o teto, então o tipo já
    // entrega o número e a constante é escrita em um lugar só. A alternativa
    // (`[length - 1] ?? 86_400_000`) tinha um `??` que nenhum teste alcançaria:
    // o literal de módulo tem cinco elementos e a constante é avaliada no
    // import. Fica registrado aqui em vez de virar cobertura artificial
    // (mutar a tabela só ensinaria o teste a quebrar o módulo).
  });

  it('contagem ilegível (NaN) cai na espera máxima, nunca em espera zero', () => {
    // O clamp segura o índice na faixa para inteiros, mas
    // `Math.min(Math.max(NaN, 1), 5)` continua `NaN` e o índice sai da tabela.
    // O `?? LAST_DELAY_MS` existe para isso: uma contagem de tentativas que não
    // dá para ordenar falha para o teto, em vez de liberar quem errou a senha.
    expect(delayFor(Number.NaN)).toBe(LAST_DELAY_MS);
    const now = 1_700_000_000_000;
    expect(lockUntilFor(Number.NaN, now)).toBe(now + LAST_DELAY_MS);
  });

  it('nenhuma contagem de tentativa resulta em espera zero', () => {
    // Invariante de segurança da tabela: para qualquer `number`, a espera é
    // positiva. É o que garante que uma tentativa errada nunca destrava a
    // próxima tentativa.
    for (const attempts of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -5,
      0,
      1,
      5,
      6,
      1_000_000,
    ]) {
      expect(delayFor(attempts)).toBeGreaterThan(0);
    }
  });

  it('lockUntilFor soma a espera de agora', () => {
    const now = 1_700_000_000_000;
    expect(lockUntilFor(1, now)).toBe(now + 10_000);
    expect(lockUntilFor(3, now)).toBe(now + 60_000);
  });

  it('lockRemainingMs devolve o que falta da espera, e 0 quando já passou', () => {
    const now = 1_700_000_000_000;
    expect(lockRemainingMs(now + 5_000, now)).toBe(5_000);
    // Instante exato já liberou: a espera termina quando o relógio chega lá.
    expect(lockRemainingMs(now, now)).toBe(0);
    expect(lockRemainingMs(now - 1, now)).toBe(0);
    // `lockUntil` de cofre novo é 0, e 0 não pode virar espera negativa.
    expect(lockRemainingMs(0, now)).toBe(0);
  });
});
