import { describe, expect, it } from 'vitest';
import {
  MASTER_PASSWORD_LENGTH,
  PIN_LENGTH,
  RECOVERY_MIN_WORDS,
  countWords,
  formatCountdown,
  hasEnoughWords,
  isMasterPasswordFormat,
  isPinFormat,
  normalizePhrase,
} from '@zero/shared';

/**
 * A camada `src/shared/` é a política de credencial do app: o renderer valida o
 * que está sendo digitado e o main valida de novo antes de gravar. O teste que
 * vale aqui é o de **divergência**: se as duas cópias da regra se separassem, o
 * main aceitaria e a tela não (ou o inverso), sem erro nenhum.
 */

describe('shared/policy: formato da credencial', () => {
  it('a senha mestra tem comprimento fixo, e o corte é exato', () => {
    expect(MASTER_PASSWORD_LENGTH).toBe(24);
    expect(isMasterPasswordFormat('a'.repeat(MASTER_PASSWORD_LENGTH))).toBe(true);
    expect(isMasterPasswordFormat('a'.repeat(MASTER_PASSWORD_LENGTH - 1))).toBe(false);
    expect(isMasterPasswordFormat('a'.repeat(MASTER_PASSWORD_LENGTH + 1))).toBe(false);
    expect(isMasterPasswordFormat('')).toBe(false);
  });

  it('o PIN tem 8 dígitos, e nada mais passa por essa porta', () => {
    expect(PIN_LENGTH).toBe(8);
    expect(isPinFormat('49201733')).toBe(true);
    expect(isPinFormat('4920173')).toBe(false);
    expect(isPinFormat('492017333')).toBe(false);
    // Espaço, sinal e acento: o app não normaliza PIN, então não aceita.
    expect(isPinFormat('4920 1733')).toBe(false);
    expect(isPinFormat('4920173a')).toBe(false);
    expect(isPinFormat('-4920173')).toBe(false);
    expect(isPinFormat('')).toBe(false);
  });

  it('a frase de recuperação tem piso de 12 palavras', () => {
    expect(RECOVERY_MIN_WORDS).toBe(12);
  });
});

describe('shared/format: normalização da frase', () => {
  it('espaço a mais, tabulação e quebra de linha não mudam a frase', () => {
    // Quem anotou a frase num papel e colou com quebra de linha precisa chegar
    // no mesmo embrulho.
    expect(normalizePhrase('  cavalo   come a cenoura ')).toBe('cavalo come a cenoura');
    expect(normalizePhrase('  \t\n ')).toBe('');
    expect(normalizePhrase('um\ndois\ttrês')).toBe('um dois três');
  });

  it('a caixa das palavras é preservada: `Cavalo` não é `cavalo`', () => {
    // A caixa é informação a mais para quem escreve e um bit a mais para quem
    // ataca, então normalizar ela jogaria fora a parte mais forte da frase.
    expect(normalizePhrase('Cavalo come a cenoura')).toBe('Cavalo come a cenoura');
    expect(normalizePhrase('Cavalo Come A Cenoura')).not.toBe(
      normalizePhrase('cavalo come a cenoura'),
    );
    expect(normalizePhrase('cavalo Come a cenoura')).toBe('cavalo Come a cenoura');
  });

  it('o acento também não é normalizado', () => {
    expect(normalizePhrase('cavalo café')).not.toBe(normalizePhrase('cavalo cafe'));
  });

  it('contar palavras ignora o espaçamento e a caixa', () => {
    expect(countWords('  cavalo   come a cenoura ')).toBe(4);
    expect(countWords('Cavalo Come a Cenoura')).toBe(4);
    expect(countWords('uma-palavra-só')).toBe(1);
    expect(countWords('   ')).toBe(0);
    expect(countWords('')).toBe(0);
  });

  it('o piso de palavras é conferido sobre a frase normalizada', () => {
    const doze = Array.from({ length: RECOVERY_MIN_WORDS }, (_, i) => `p${i}`).join(' ');
    const onze = Array.from({ length: RECOVERY_MIN_WORDS - 1 }, (_, i) => `p${i}`).join(' ');
    expect(hasEnoughWords(doze)).toBe(true);
    expect(hasEnoughWords(`  ${doze.toUpperCase()}  `)).toBe(true);
    expect(hasEnoughWords(onze)).toBe(false);
    expect(hasEnoughWords('')).toBe(false);
  });
});

describe('shared/format: contagem regressiva da trava', () => {
  it('abaixo de um minuto conta em segundos', () => {
    expect(formatCountdown(10_000)).toBe('10s');
    expect(formatCountdown(1_000)).toBe('1s');
    // Uma hora vista como segundos seria mentira de quem lê.
    expect(formatCountdown(59_000)).toBe('59s');
  });

  it('acima de um minuto conta em minutos, com os segundos restantes', () => {
    expect(formatCountdown(60_000)).toBe('1min');
    expect(formatCountdown(90_000)).toBe('1min30s');
    expect(formatCountdown(300_000)).toBe('5min');
  });

  it('acima de uma hora conta em horas, com os minutos restantes', () => {
    expect(formatCountdown(3_600_000)).toBe('1h');
    expect(formatCountdown(5_400_000)).toBe('1h30min');
    expect(formatCountdown(86_400_000)).toBe('24h');
  });

  it('espera vencida ou negativa vira zero, nunca "-3s"', () => {
    expect(formatCountdown(0)).toBe('0s');
    expect(formatCountdown(-5_000)).toBe('0s');
    // Fração de segundo arredonda para cima: o contador tem de mostrar 1s
    // enquanto ainda há 1ms de espera, senão ele pisca.
    expect(formatCountdown(1)).toBe('1s');
    expect(formatCountdown(999)).toBe('1s');
  });
});
