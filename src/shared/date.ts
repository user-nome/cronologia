import type { Language } from '@zero/types';

/**
 * Digitação de data em texto livre, compartilhada pelo renderer (o campo de
 * data do modal de obra) e por quem precisar ler a mesma data.
 *
 * A data **gravada** é sempre ISO (`YYYY-MM-DD`): é o que o acervo guarda, o
 * que o backup transporta e o que permite comparar duas datas. O que este
 * módulo faz é a tradução entre o texto que a pessoa digita (`10/02/2026`) e o
 * ISO, e é a única regra que decide o que é uma data válida — assim a tela e o
 * acervo não discordam sobre o que é uma data.
 *
 * Pura e sem estado: nada de Node nem de DOM, para rodar nos dois processos.
 */

/** Os três campos de uma data. */
type DateField = 'day' | 'month' | 'year';

/** Ordem dos campos na digitação, por idioma. */
type DateFieldOrder = 'dmy' | 'mdy' | 'ymd';

const ORDERS: Record<Language, DateFieldOrder> = {
  'pt-BR': 'dmy',
  en: 'mdy',
  ko: 'ymd',
  'zh-CN': 'ymd',
  ja: 'ymd',
};

/** Quantos dígitos cada campo aceita, na ordem do idioma. */
const SEGMENT_SIZES: Record<DateFieldOrder, readonly number[]> = {
  dmy: [2, 2, 4],
  mdy: [2, 2, 4],
  ymd: [4, 2, 2],
};

/** Quais campos aparecem em cada posição, na ordem do idioma. */
const SEGMENT_FIELDS: Record<DateFieldOrder, readonly [DateField, DateField, DateField]> = {
  dmy: ['day', 'month', 'year'],
  mdy: ['month', 'day', 'year'],
  ymd: ['year', 'month', 'day'],
};

/** A máscara de digitação de cada ordem. */
const MASKS: Record<DateFieldOrder, string> = {
  dmy: 'DD/MM/AAAA',
  mdy: 'MM/DD/YYYY',
  ymd: 'YYYY/MM/DD',
};

/** A máscara de digitação do idioma: `DD/MM/AAAA`, `MM/DD/YYYY` ou `YYYY/MM/DD`. */
export function dateMask(language: Language): string {
  return MASKS[ORDERS[language]];
}

/** Só os dígitos do texto: separadores e letras ficam de fora. */
function onlyDigits(text: string): string {
  return text.replace(/\D/gu, '');
}

/** Ano bissexto, pela regra do calendário gregoriano. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Quantos dias o mês tem, já com o fevereiro bissexto. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** Dois dígitos, com zero à esquerda. */
function twoDigits(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** O ISO de três números, ou `null` quando a data não existe. */
function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${String(year).padStart(4, '0')}-${twoDigits(month)}-${twoDigits(day)}`;
}

/** O ano em ISO: quatro dígitos, ou dois (que são deste século). */
function parseYear(text: string): number | null {
  if (text.length === 4) {
    const year = Number(text);
    return year >= 1 ? year : null;
  }
  if (text.length === 2) return 2000 + Number(text);
  return null;
}

/** O que uma edição no campo de data produz. */
export interface DateEdit {
  /** O texto mascarado depois da edição. */
  text: string;
  /** Onde o cursor fica no texto mascarado. */
  caret: number;
}

/**
 * Onde o cursor fica depois da edição: logo depois do dígito que estava antes
 * dele, ou logo depois do separador, quando a digitação foi de um separador.
 */
function caretAt(text: string, digitsBefore: number, afterSeparator: boolean): number {
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (char === '/') {
      if (afterSeparator && seen === digitsBefore) return index + 1;
      continue;
    }
    seen += 1;
    if (!afterSeparator && seen === digitsBefore) return index + 1;
  }
  return text.length;
}

/**
 * Aplica a máscara ao texto digitado.
 *
 * A pessoa digita números livres (`10022026`) ou com separador (`10/02/2026`),
 * e o campo mostra a máscara do idioma. O separador que a pessoa digita fecha o
 * campo em que ela está (`5/6/2026` é 5 de junho, não 56 de junho); o que ela
 * não digita é inserido quando o campo enche.
 *
 * `raw` é o texto que o navegador entregou depois da digitação e `caret` é
 * onde o cursor estava: os dois juntos dizem em que campo a digitação caiu e
 * onde o cursor volta.
 */
export function editDateText(raw: string, caret: number, language: Language): DateEdit {
  const sizes = SEGMENT_SIZES[ORDERS[language]];
  const parts = raw.split('/');
  const digitsBefore = onlyDigits(raw.slice(0, caret)).length;
  const typedSeparator = caret > 0 && raw.charAt(caret - 1) === '/';

  const segments: string[] = [];
  let field = 0;

  for (const [index, part] of parts.entries()) {
    for (const digit of onlyDigits(part)) {
      const size = sizes[field];
      if (size === undefined) break;
      const current = segments[field] ?? '';
      if (current.length < size) {
        segments[field] = current + digit;
        continue;
      }
      // O campo encheu: o dígito seguinte abre o campo seguinte.
      field += 1;
      const nextSize = sizes[field];
      if (nextSize === undefined) break;
      segments[field] = digit;
    }
    if (index === parts.length - 1) break;
    // O separador digitado fecha o campo em que a pessoa está.
    const size = sizes[field] ?? 0;
    const current = segments[field] ?? '';
    if (current.length < size) field += 1;
  }

  // O campo em que a pessoa está digitando existe mesmo vazio (`10/`).
  const limit = Math.min(field + 1, sizes.length);
  while (segments.length < limit) {
    segments.push('');
  }

  const text = segments.join('/');
  return { text, caret: caretAt(text, digitsBefore, typedSeparator) };
}

/**
 * As três partes de uma data, ou `null` quando o texto tem mais de três campos
 * (o que não é uma data).
 */
function dateParts(text: string): [string, string, string] | null {
  const parts = text.split('/');
  if (parts.length > 3) return null;
  const [first = '', second = '', third = ''] = parts;
  return [first, second, third];
}

/**
 * Converte o texto mascarado em ISO (`YYYY-MM-DD`).
 *
 * `null` quando o texto não é uma data completa e válida: um campo faltando,
 * um ano que não tem dois nem quatro dígitos, um mês que não existe ou um dia
 * que o mês não tem (31 de fevereiro não é uma data).
 */
export function parseDateText(text: string, language: Language): string | null {
  const parts = dateParts(text);
  if (parts === null) return null;
  const [first, second, third] = parts;
  if (first === '' || second === '' || third === '') return null;

  const order = SEGMENT_FIELDS[ORDERS[language]];
  const fields: Record<DateField, string> = { day: '', month: '', year: '' };
  fields[order[0]] = onlyDigits(first);
  fields[order[1]] = onlyDigits(second);
  fields[order[2]] = onlyDigits(third);
  const year = parseYear(fields.year);
  if (year === null) return null;
  return toIso(year, Number(fields.month), Number(fields.day));
}

/**
 * A data de um texto colado: no formato do idioma (`10/02/2026`) ou em ISO
 * (`2026-02-10`), que é como a data aparece em quase todo lugar.
 */
export function parseDateInput(text: string, language: Language): string | null {
  const local = parseDateText(text, language);
  if (local !== null) return local;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text.trim());
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1) return null;
  return toIso(year, month, day);
}

/**
 * O ISO (`YYYY-MM-DD`) no texto da máscara do idioma.
 *
 * Texto vazio quando não há data ou quando o ISO não é uma data.
 */
export function formatDateText(iso: string | undefined, language: Language): string {
  if (iso === undefined || iso === '') return '';
  if (!/^\d{4}-\d{2}-\d{2}/u.test(iso)) return '';
  const values: Record<DateField, string> = {
    day: iso.slice(8, 10),
    month: iso.slice(5, 7),
    year: iso.slice(0, 4),
  };
  const order = SEGMENT_FIELDS[ORDERS[language]];
  return order.map((field) => values[field]).join('/');
}

/** `true` quando o texto tem todos os dígitos de uma data. */
export function isCompleteDateText(text: string, language: Language): boolean {
  const total = SEGMENT_SIZES[ORDERS[language]].reduce((sum, size) => sum + size, 0);
  return onlyDigits(text).length === total;
}
