import { describe, expect, it } from 'vitest';
import {
  dateMask,
  editDateText,
  formatDateText,
  isCompleteDateText,
  parseDateInput,
  parseDateText,
} from '@zero/shared/date';

/**
 * A digitação de data é a mesma regra para a tela e para o acervo: o texto que
 * a pessoa digita vira ISO, e o ISO volta para o texto. O teste fixa os dois
 * lados — e o meio, que é a máscara — porque é o meio que decide o que a
 * pessoa digita sem pensar.
 */

describe('dateMask', () => {
  it('usa a ordem de cada idioma', () => {
    expect(dateMask('pt-BR')).toBe('DD/MM/AAAA');
    expect(dateMask('en')).toBe('MM/DD/YYYY');
    expect(dateMask('ja')).toBe('YYYY/MM/DD');
    expect(dateMask('ko')).toBe('YYYY/MM/DD');
    expect(dateMask('zh-CN')).toBe('YYYY/MM/DD');
  });
});

describe('editDateText: a máscara', () => {
  it('monta a data a partir dos números soltos', () => {
    expect(editDateText('1', 1, 'pt-BR')).toEqual({ text: '1', caret: 1 });
    expect(editDateText('10', 2, 'pt-BR')).toEqual({ text: '10', caret: 2 });
    expect(editDateText('100', 3, 'pt-BR')).toEqual({ text: '10/0', caret: 4 });
    expect(editDateText('1002', 4, 'pt-BR')).toEqual({ text: '10/02', caret: 5 });
    expect(editDateText('10022026', 8, 'pt-BR')).toEqual({ text: '10/02/2026', caret: 10 });
  });

  it('aceita o texto já com separador', () => {
    expect(editDateText('10/02/2026', 10, 'pt-BR')).toEqual({ text: '10/02/2026', caret: 10 });
  });

  it('deixa o separador digitado fechar o campo', () => {
    // `5/6/2026` é 5 de junho: o separador fecha o campo em que a pessoa está.
    expect(editDateText('5/', 2, 'pt-BR')).toEqual({ text: '5/', caret: 2 });
    expect(editDateText('5/6/2026', 8, 'pt-BR')).toEqual({ text: '5/6/2026', caret: 8 });
  });

  it('separa os campos conforme o idioma', () => {
    expect(editDateText('02102026', 8, 'en').text).toBe('02/10/2026');
    expect(editDateText('20260210', 8, 'ja').text).toBe('2026/02/10');
  });

  it('descarta o que não cabe nos três campos', () => {
    expect(editDateText('10/02/2026123', 13, 'pt-BR').text).toBe('10/02/2026');
    expect(editDateText('10/02/202/1/2', 12, 'pt-BR').text).toBe('10/02/202');
  });

  it('guarda o campo vazio no meio da data', () => {
    // O separador digitado no meio fecha o campo: `1//2` é dia 1, campo do
    // meio vazio, dia 2.
    expect(editDateText('1//2', 4, 'pt-BR').text).toBe('1//2');
  });
});

describe('parseDateText: o que é uma data', () => {
  it('converte o texto do idioma em ISO', () => {
    expect(parseDateText('10/02/2026', 'pt-BR')).toBe('2026-02-10');
    // Em inglês o primeiro campo é o mês: `02/10/2026` é 10 de fevereiro.
    expect(parseDateText('02/10/2026', 'en')).toBe('2026-02-10');
    expect(parseDateText('2026/02/10', 'ja')).toBe('2026-02-10');
  });

  it('aceita o ano com dois dígitos (este século)', () => {
    expect(parseDateText('10/02/26', 'pt-BR')).toBe('2026-02-10');
  });

  it('recusa o que não é uma data', () => {
    expect(parseDateText('', 'pt-BR')).toBeNull();
    expect(parseDateText('10/02', 'pt-BR')).toBeNull();
    expect(parseDateText('10/02/', 'pt-BR')).toBeNull();
    expect(parseDateText('10/02/2026/', 'pt-BR')).toBeNull();
    expect(parseDateText('10/13/2026', 'pt-BR')).toBeNull();
    expect(parseDateText('00/02/2026', 'pt-BR')).toBeNull();
    expect(parseDateText('10/02/0000', 'pt-BR')).toBeNull();
    expect(parseDateText('10/02/202', 'pt-BR')).toBeNull();
    expect(parseDateText('31/02/2026', 'pt-BR')).toBeNull();
    expect(parseDateText('31/04/2026', 'pt-BR')).toBeNull();
  });

  it('conhece a duração de cada mês', () => {
    expect(parseDateText('31/01/2026', 'pt-BR')).toBe('2026-01-31');
    expect(parseDateText('30/04/2026', 'pt-BR')).toBe('2026-04-30');
    expect(parseDateText('31/12/2026', 'pt-BR')).toBe('2026-12-31');
  });

  it('sabe que o ano bissexto tem 29 de fevereiro', () => {
    expect(parseDateText('29/02/2024', 'pt-BR')).toBe('2024-02-29');
    expect(parseDateText('29/02/2023', 'pt-BR')).toBeNull();
  });
});

describe('parseDateInput: o texto colado', () => {
  it('aceita o formato do idioma e o ISO', () => {
    expect(parseDateInput('10/02/2026', 'pt-BR')).toBe('2026-02-10');
    expect(parseDateInput('2026-02-10', 'pt-BR')).toBe('2026-02-10');
    expect(parseDateInput(' 2026-02-10 ', 'pt-BR')).toBe('2026-02-10');
  });

  it('recusa o que não é data', () => {
    expect(parseDateInput('nada', 'pt-BR')).toBeNull();
    expect(parseDateInput('2026-02-30', 'pt-BR')).toBeNull();
    expect(parseDateInput('0000-01-01', 'pt-BR')).toBeNull();
  });
});

describe('formatDateText: o ISO na tela', () => {
  it('mostra a data na ordem do idioma', () => {
    expect(formatDateText('2026-02-10', 'pt-BR')).toBe('10/02/2026');
    expect(formatDateText('2026-02-10', 'en')).toBe('02/10/2026');
    expect(formatDateText('2026-02-10', 'ja')).toBe('2026/02/10');
  });

  it('aceita o ISO com horário', () => {
    expect(formatDateText('2026-02-10T00:00:00.000Z', 'pt-BR')).toBe('10/02/2026');
  });

  it('devolve texto vazio sem data', () => {
    expect(formatDateText(undefined, 'pt-BR')).toBe('');
    expect(formatDateText('', 'pt-BR')).toBe('');
    expect(formatDateText('10/02/2026', 'pt-BR')).toBe('');
  });
});

describe('isCompleteDateText', () => {
  it('diz quando a data tem todos os dígitos', () => {
    expect(isCompleteDateText('10/02/2026', 'pt-BR')).toBe(true);
    expect(isCompleteDateText('10/02/202', 'pt-BR')).toBe(false);
    expect(isCompleteDateText('', 'pt-BR')).toBe(false);
  });
});
