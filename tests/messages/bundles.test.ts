// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LANGUAGES, messages } from '@zero/messages';
import type { Language } from '@zero/types';

/**
 * Varredura de todas as mensagens dos cinco bundles.
 *
 * Um bundle é dado, e por isso a cobertura de linha dele não diz nada sobre a
 * suíte. O que **é** defeito, e o que este arquivo pega, é o que a paridade de
 * chaves (`typeof ptBR`) não pega: uma tradução vazia, uma string com
 * marcador de negrito pela metade (que vira texto cru na tela), reticências de
 * três pontos em vez da elipse `…`, ou uma mensagem com parâmetro que devolve
 * string vazia.
 *
 * As mensagens com parâmetro são funções, então esta varredura também as
 * executa: cada uma é chamada com dois tamanhos de número (um pequeno e um
 * grande) e com texto de exemplo, o que cobre os ramos internos dos bundles
 * (o "em segundos" × "em minutos" de `vault.lockout` e
 * `driveErrors.restoreLocked`, por exemplo).
 */

/** Amostra para parâmetro `number`, na ordem deGnúo do teste. */
const NUMEROS = [2, 120] as const;

/** Amostra para parâmetro `string`. */
const TEXTO = 'exemplo';

/** Nó do bundle ainda não percorrido (grupo intermediário). */
interface Grupo {
  [chave: string]: string | ((...args: never[]) => string) | Grupo;
}

type Folha =
  | { chave: string; tipo: 'texto'; valor: string }
  | { chave: string; tipo: 'função'; valor: (...args: never[]) => string };

/** Percorre o bundle em profundidade e devolve cada folha com o caminho dela. */
function folhas(bundle: unknown, prefixo = ''): Folha[] {
  const saida: Folha[] = [];
  for (const [chave, valor] of Object.entries(bundle as Grupo)) {
    const caminho = `${prefixo}${chave}`;
    if (typeof valor === 'string') {
      saida.push({ chave: caminho, tipo: 'texto', valor });
      continue;
    }
    if (typeof valor === 'function') {
      saida.push({ chave: caminho, tipo: 'função', valor });
      continue;
    }
    saida.push(...folhas(valor, `${caminho}.`));
  }
  return saida;
}

/** Monta os argumentos de uma função de mensagem a partir do número de parâmetros. */
function argumentos(f: (...args: never[]) => string, numero: number): unknown[] {
  return Array.from({ length: f.length }, (_, indice) =>
    // Alterna número/string pela posição: nenhuma mensagem usa três parâmetros,
    // e o que importa é que nenhum fique `undefined` dentro do template.
    indice % 2 === 0 ? numero : TEXTO,
  );
}

const TODOS: { language: Language; folhas: Folha[] }[] = LANGUAGES.map((language) => ({
  language,
  folhas: folhas(messages(language)),
}));

describe('bundles de mensagens: toda folha é texto utilizável', () => {
  it.each(TODOS)('$language tem folhas para percorrer', ({ folhas: lista }) => {
    // Rede de segurança do próprio teste: uma varredura vazia passaria por
    // cima de tudo, e "0 folhas" é o sintoma de bundle quebrado.
    expect(lista.length).toBeGreaterThan(150);
  });

  it.each(TODOS)('$language: nenhuma mensagem vazia ou só com espaço', ({ folhas: lista }) => {
    const vazias = lista
      .filter((folha) => folha.tipo === 'texto' && folha.valor.trim() === '')
      .map((folha) => folha.chave);
    expect(vazias).toEqual([]);
  });

  it.each(TODOS)('$language: negrito e código fecham', ({ folhas: lista }) => {
    const quebradas = lista
      .filter((folha) => {
        if (folha.tipo === 'função') return false;
        const texto = folha.valor;
        const negritos = texto.match(/\*\*/g)?.length ?? 0;
        const crases = texto.match(/`/g)?.length ?? 0;
        return negritos % 2 !== 0 || crases % 2 !== 0;
      })
      .map((folha) => folha.chave);
    expect(quebradas).toEqual([]);
  });

  it.each(TODOS)(
    '$language: usa a elipse tipográfica, não reticências',
    ({ language, folhas: lista }) => {
      const comReticencias = lista
        .filter((folha) => folha.tipo === 'texto' && folha.valor.includes('...'))
        .map((folha) => folha.chave);
      // `zh-CN` e `ko` não têm o mesmo repertório de elipse do português, então a
      // regra vale para os idiomas ocidentais, que é onde a elipse aparece.
      if (language === 'zh-CN' || language === 'ko' || language === 'ja') return;
      expect(comReticencias).toEqual([]);
    },
  );

  it.each(TODOS)('$language: toda mensagem com parâmetro devolve texto', ({ folhas: lista }) => {
    const vazias: string[] = [];
    for (const folha of lista) {
      if (folha.tipo !== 'função') continue;
      for (const numero of NUMEROS) {
        const texto = folha.valor(...(argumentos(folha.valor, numero) as never[]));
        if (typeof texto !== 'string' || texto.trim() === '') vazias.push(folha.chave);
      }
    }
    expect(vazias).toEqual([]);
  });

  it('a contagem de folhas é a mesma nos cinco idiomas', () => {
    // A paridade de chave é garantida pelo tipo; o que este teste fixa é que os
    // bundles **executáveis** também fechem: uma tradução que vira string fixa
    // onde o canônico é função continua compilando? Não. Mas uma que vire função
    // a mais, ou que perca o `tipo` de alguma folha, muda a contagem.
    const contagens = TODOS.map((entrada) => entrada.folhas.length);
    expect(new Set(contagens).size).toBe(1);
  });
});
