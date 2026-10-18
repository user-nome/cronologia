import { describe, expect, it, vi } from 'vitest';
import {
  CATEGORIES,
  FILTER_OPTIONS,
  STATUS_COLORS,
  STATUS_OPTIONS,
  TYPE_COLORS,
  TYPE_OPTIONS,
  clampProgress,
  coverUrl,
  formatDate,
} from '@zero/renderer/constants';
import type { StatusFilter } from '@zero/renderer/constants';

describe('opções e cores', () => {
  it('cobre todos os tipos de obra', () => {
    expect(TYPE_OPTIONS).toEqual(['webtoon', 'manhwa', 'manhua', 'manga', 'livro', 'outro']);
    for (const type of TYPE_OPTIONS) {
      expect(TYPE_COLORS[type]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('cobre todos os status', () => {
    expect(STATUS_OPTIONS).toEqual(['planejado', 'lendo', 'pausado', 'concluido', 'cancelado']);
    for (const status of STATUS_OPTIONS) {
      expect(STATUS_COLORS[status]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('expõe os filtros da barra superior', () => {
    const values: readonly StatusFilter[] = FILTER_OPTIONS;
    expect(values).toEqual(['todos', 'lendo', 'planejado', 'pausado', 'concluido', 'cancelado']);
  });

  it('lista categorias prontas para uso', () => {
    expect(CATEGORIES).toContain('Isekai');
    expect(CATEGORIES).toContain('Ação');
    expect(CATEGORIES).toContain('Ficção Científica');
    expect(CATEGORIES).toContain('Sobrenatural');
    expect(CATEGORIES).toHaveLength(56);
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length);
  });
});

describe('coverUrl', () => {
  it('devolve null sem capa', () => {
    expect(coverUrl(undefined)).toBeNull();
    expect(coverUrl('')).toBeNull();
  });

  it('monta a URL do protocolo cover com encoding', () => {
    expect(coverUrl('capa.png')).toBe('cover://app/capa.png');
    expect(coverUrl('minha capa.png')).toBe('cover://app/minha%20capa.png');
  });
});

describe('formatDate', () => {
  it('usa hífen para datas vazias', () => {
    expect(formatDate(null, 'pt-BR')).toBe('-');
    expect(formatDate('', 'en')).toBe('-');
  });

  it('formata datas ISO válidas no idioma pedido', () => {
    const pt = formatDate('2026-03-04T15:30:00.000Z', 'pt-BR');
    expect(pt).not.toBe('-');
    expect(pt).toMatch(/\d{2}\/\d{2}\/\d{2}/);

    const en = formatDate('2026-03-04T15:30:00.000Z', 'en');
    expect(en).not.toBe('-');
    expect(en).not.toBe(pt);
  });

  it('cai no hífen quando o motor não sabe formatar a data', () => {
    // Nenhum valor de `Language` é uma tag inválida, então o `catch` de
    // `formatDate` só dispara quando o próprio motor levanta: build do Chromium
    // sem os dados de locale da tag salva em Configurações, por exemplo. O
    // stub reproduz esse motor; o que o teste fixa é que a exceção **não** vaza
    // para a renderização do card, que cairia no hífen como uma data vazia.
    vi.spyOn(Date.prototype, 'toLocaleString').mockImplementation(() => {
      throw new RangeError('Incorrect locale information provided');
    });

    expect(formatDate('2026-03-04T15:30:00.000Z', 'pt-BR')).toBe('-');
    expect(formatDate('2026-03-04T15:30:00.000Z', 'ja')).toBe('-');
  });
});

describe('clampProgress', () => {
  it('normaliza para inteiro não negativo', () => {
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(33.7)).toBe(34);
    expect(clampProgress(100)).toBe(100);
  });
});
