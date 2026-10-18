import { describe, expect, it } from 'vitest';
import {
  LEVELS_PER_METER,
  MASTER_PASSWORD_LENGTH,
  PIN_LENGTH,
  RECOVERY_MIN_WORDS,
  meterWidthPercent,
  strengthFor,
} from '@zero/shared';
import type { StrengthKind, StrengthResult } from '@zero/shared';

/**
 * A régua de força é a mesma função nos dois processos: o renderer mostra a nota
 * e o main recusa o que for `blocked`. O teste que importa aqui é o do **acordo
 * entre os dois**: o que a tela mostra como "muito fraca" tem de ser exatamente o
 * que o app vai recusar, e nenhum valor degenerado pode passar.
 */

/** Nota de um valor, com os motivos que a justificam. */
function gradeOf(kind: StrengthKind, value: string): StrengthResult {
  return strengthFor(kind).evaluate(value);
}

const SENHA_BOA = 'Tz7#mQ2!vZ9@pL4$xR8!nW3&';
const PIN_BOM = '49201733';
const FRASE_BOA =
  'cavalo cenoura feira inverno bibliografia zettelkasten kalamita peixoto velleda aurora jubileu silhueta';

describe('shared/strategy: uma régua por credencial', () => {
  it('o mapa entrega a estratégia do tipo pedido, e a mesma a cada chamada', () => {
    expect(strengthFor('master').kind).toBe('master');
    expect(strengthFor('pin').kind).toBe('pin');
    expect(strengthFor('phrase').kind).toBe('phrase');
    // São estratégias sem estado: a régua de uma não muda a da outra.
    expect(strengthFor('master').evaluate(SENHA_BOA).blocked).toBe(false);
    expect(strengthFor('pin').evaluate(PIN_BOM).blocked).toBe(false);
    expect(strengthFor('phrase').evaluate(FRASE_BOA).blocked).toBe(false);
  });
});

describe('shared/strength: senha mestra', () => {
  it('entrada vazia é neutra: nada bloqueia antes de digitar', () => {
    const result = gradeOf('master', '');
    expect(result).toEqual({ level: 'veryWeak', score: 0, blocked: false, reasons: [] });
  });

  it('senha bem formada e variada passa sem bloqueio', () => {
    expect(gradeOf('master', SENHA_BOA).blocked).toBe(false);
    expect(gradeOf('master', SENHA_BOA).reasons).not.toContain('allSame');
  });

  it('bloqueia o mesmo caractere repetido', () => {
    const result = gradeOf('master', 'a'.repeat(MASTER_PASSWORD_LENGTH));
    expect(result.blocked).toBe(true);
    expect(result.reasons).toContain('allSame');
    expect(result.level).toBe('veryWeak');
  });

  it('bloqueia bloco repetido e sequência', () => {
    expect(gradeOf('master', 'ab'.repeat(MASTER_PASSWORD_LENGTH / 2)).blocked).toBe(true);
    expect(gradeOf('master', 'abcdefghijklmnopqrstuvwx').reasons).toContain('sequence');
    expect(gradeOf('master', 'abcdefghijklmnopqrstuvwx').blocked).toBe(true);
    expect(gradeOf('master', 'zyxwvutsrqponmlkjihgfedcb').blocked).toBe(true);
  });

  it('uma sequência curta derruba a nota sem bloquear', () => {
    // `Wxyz` no meio de uma senha longa é comum e não reduz a entropia a ponto
    // de justificar recusa: só a nota cai.
    const result = gradeOf('master', '7#WwxyzB4!cD9@eF2$gH6&A');
    expect(result.reasons).toContain('sequence');
    expect(result.blocked).toBe(false);
  });

  it('fragmento comum derruba a nota, mas não recusa', () => {
    // O nome do projeto e a palavra "senha" são os primeiros palpites de um
    // ataque; a nota tem de refletir isso. A recusa fica com o degenerado.
    for (const obvio of ['biblioteca-1A#cD2@eF3$gH', 'minhasenha-1A#cD2@eF3$gH']) {
      const result = gradeOf('master', obvio);
      expect(result.reasons).toContain('commonWord');
    }
  });

  it('senha com cara de data é marcada e tem a nota derrubada', () => {
    const result = gradeOf('master', '01012020Qv3%bN8@wF5&');
    expect(result.reasons).toContain('dateLike');
  });

  it('poucos tipos de caractere ou poucos distintos derrubam a nota', () => {
    // Seis caracteres distintos em 16 posições: a nota diz "fraca", mas o valor
    // ainda não é degenerado e passa.
    expect(gradeOf('master', 'aabbccddeafbdcee').reasons).toContain('lowVariety');
    expect(gradeOf('master', 'aabbccddeafbdcee').blocked).toBe(false);
    const soMinusculas = gradeOf('master', 'kqmzpwrvtbnjghflcxdsz');
    expect(soMinusculas.reasons).toContain('fewKinds');
  });

  it('o corte do bloqueio é o do degenerado, não o da nota', () => {
    // Entrada incompleta (menos de 8 caracteres) nunca bloqueia: quem está
    // digitando ainda não tem nada a perder.
    expect(gradeOf('master', 'aaaaaa').blocked).toBe(false);
    expect(gradeOf('master', 'ababab').blocked).toBe(false);
    // Completa e degenerada bloqueia, mesmo sem ser do mesmo tipo.
    expect(gradeOf('master', 'abababab').blocked).toBe(true);
  });
});

describe('shared/strength: PIN', () => {
  it('a nota do PIN nunca passa de "razoável", mesmo com 8 dígitos bons', () => {
    // 8 dígitos são 10^8 candidatos: o formato não é força, e a nota fingir que é
    // seria dizer ao usuário que 8 dígitos equivalem a uma senha boa.
    expect(gradeOf('pin', '94817263').level).toBe('fair');
    expect(gradeOf('pin', PIN_BOM).score).toBeLessThanOrEqual(2);
    expect(gradeOf('pin', PIN_BOM).blocked).toBe(false);
  });

  it('entrada vazia ou não numérica não bloqueia (o formato cobre isso)', () => {
    expect(gradeOf('pin', '').blocked).toBe(false);
    expect(gradeOf('pin', 'abcd').reasons).toContain('fewKinds');
    expect(gradeOf('pin', 'abcd').blocked).toBe(false);
  });

  it('bloqueia dígitos repetidos e sequência', () => {
    expect(gradeOf('pin', '11111111').blocked).toBe(true);
    // Dois dígitos alternados: só 100 candidatos, o pior caso de um PIN.
    expect(gradeOf('pin', '12121212').blocked).toBe(true);
    expect(gradeOf('pin', '12345678').blocked).toBe(true);
    expect(gradeOf('pin', '87654321').blocked).toBe(true);
  });

  it('bloqueia PIN com cara de data, nas duas ordens', () => {
    // Data é o primeiro palpite de qualquer ataque a PIN de 8 dígitos.
    expect(gradeOf('pin', '01012020').blocked).toBe(true);
    expect(gradeOf('pin', '20200101').blocked).toBe(true);
    expect(gradeOf('pin', '01012020').reasons).toContain('dateLike');
  });

  it('poucos dígitos distintos caem na nota, sem bloquear', () => {
    // Quatro dígitos só: a nota diz que é fraco, e o app aceita. O bloqueio é
    // para o degenerado e para a data, não para "pouca variedade".
    const result = gradeOf('pin', '12131214');
    expect(result.reasons).toContain('lowVariety');
    expect(result.blocked).toBe(false);
  });
});

describe('shared/strength: frase de recuperação', () => {
  it('entrada vazia ou de uma palavra é neutra', () => {
    expect(gradeOf('phrase', '').blocked).toBe(false);
    expect(gradeOf('phrase', '   ').blocked).toBe(false);
    expect(gradeOf('phrase', 'cavalo').blocked).toBe(false);
  });

  it('frase com 12+ palavras distintas passa sem bloqueio', () => {
    expect(gradeOf('phrase', FRASE_BOA).blocked).toBe(false);
    expect(gradeOf('phrase', FRASE_BOA).score).toBeGreaterThanOrEqual(2);
  });

  it('bloqueia 12+ palavras com quase tudo repetido', () => {
    // A entropia real de `cavalo cavalo cavalo…` é de uma palavra; o formato
    // sozinho passaria, e é exatamente por isso que a régua existe.
    const repetida = `${'cavalo '.repeat(RECOVERY_MIN_WORDS - 1)}aurora`;
    expect(gradeOf('phrase', repetida).blocked).toBe(true);
    expect(gradeOf('phrase', repetida).reasons).toContain('fewUniqueWords');
  });

  it('uma palavra repetida três vezes é marcada, sem bloquear', () => {
    const resultado = gradeOf(
      'phrase',
      'cavalo cenoura feira inverno bibliografia zettelkasten kalamita cavalo peixoto velleda aurora cavalo',
    );
    expect(resultado.reasons).toContain('repeatedWords');
    expect(resultado.blocked).toBe(false);
  });

  it('palavras curtas e palavras comuns derrubam a nota', () => {
    const curtas = 'a é io ul li no sim vai deu ter luz voz paz rei';
    expect(gradeOf('phrase', curtas).reasons).toContain('shortWords');
    expect(gradeOf('phrase', curtas).blocked).toBe(false);
    const comuns = 'a de que do da em um para com por nao os no se';
    expect(gradeOf('phrase', comuns).reasons).toContain('commonWord');
  });
});

describe('shared/strength: as bordas da nota', () => {
  it('um só tipo de caractere trava a nota, mesmo com 24 posições', () => {
    // 24 letras minúsculas têm entropia de sobra na teoria, mas a régua não pode
    // premiar um passphrase de 24 letras como se fossem 24 caracteres de entropia
    // plena; o teto de um tipo é o que segura essa leitura.
    expect(gradeOf('master', 'kqmzpwrvtbnjghflcxdszaq').score).toBe(2);
    expect(gradeOf('master', 'kqmzpwrvtbnjghflcxdszaq').level).toBe('fair');
    // Com as quatro classes, a mesma senha sobe ao topo: o teto é do fator, não
    // do tamanho.
    expect(gradeOf('master', SENHA_BOA).score).toBe(4);
    expect(gradeOf('master', SENHA_BOA).level).toBe('veryStrong');
  });

  it('PIN de um só dígito, de 4 e de 8 distintos cobrem os três degraus da nota', () => {
    expect(gradeOf('pin', '11111111').score).toBe(0);
    expect(gradeOf('pin', '12131214').score).toBe(1);
    expect(gradeOf('pin', '94817263').score).toBe(2);
  });

  it('a detecção de data exige 8 dígitos, ano plausível e dia/mês válidos', () => {
    // Não-data: 4 dígitos não têm forma de data, e um ano impossível também não.
    expect(gradeOf('pin', '1231').reasons).not.toContain('dateLike');
    // Ano 9999 passa da faixa e dia 39 não existe: nenhum dos dois serve.
    expect(gradeOf('pin', '99999999').reasons).not.toContain('dateLike');
    expect(gradeOf('pin', '99139999').reasons).not.toContain('dateLike');
    expect(gradeOf('pin', '20200101').reasons).toContain('dateLike');
  });

  it('um único caractere não é sequência nem bloco', () => {
    // `longestRun` e `repeatedBlock` têm de sair sem inventar padrão a partir de
    // uma entrada de tamanho zero ou um.
    expect(gradeOf('master', 'x').blocked).toBe(false);
    expect(gradeOf('pin', '7').blocked).toBe(false);
  });

  it('entrada de um caractere no PIN não é considerada completa', () => {
    // `complete` exige os 8 dígitos: sem isso o bloqueio valeria para a entrada
    // parcial, que é o estado normal de quem está digitando.
    expect(gradeOf('pin', '1111').blocked).toBe(false);
  });
});

describe('shared/strength: o medidor e o cofre concordam', () => {
  it('todo valor que o cofre recusa aparece como fraco na tela', () => {
    const recusados = {
      master: ['a'.repeat(MASTER_PASSWORD_LENGTH), 'abcdefghijklmnopqrstuvwx'],
      pin: ['11111111', '12345678', '01012020'],
      phrase: [`${'cavalo '.repeat(RECOVERY_MIN_WORDS - 1)}aurora`],
    } as const satisfies Record<StrengthKind, string[]>;

    for (const [kind, valores] of Object.entries(recusados)) {
      for (const valor of valores) {
        const result = gradeOf(kind as StrengthKind, valor);
        expect(result.blocked, `${kind}=${valor}`).toBe(true);
        expect(result.score, `${kind}=${valor}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('os formatos de produção passam nos três tipos', () => {
    expect(SENHA_BOA.length).toBe(MASTER_PASSWORD_LENGTH);
    expect(PIN_BOM.length).toBe(PIN_LENGTH);
    expect(gradeOf('phrase', FRASE_BOA).blocked).toBe(false);
  });
});

/**
 * A barra do medidor é desenhada no renderer a partir de `score`, e o número de
 * segmentos vem de `LEVELS_PER_METER` para não sair do lugar único. O teste
 * amarra as duas coisas: se um nível for acrescentado na régua, a barra tem de
 * acompanhar sem ninguém editar o CSS.
 */
describe('shared/strength: largura da barra', () => {
  it('a barra tem um segmento aceso mesmo no score 0', () => {
    expect(meterWidthPercent(0)).toBe(20);
  });

  it('cada nível aceso soma um segmento sobre o total', () => {
    expect(meterWidthPercent(1)).toBe(40);
    expect(meterWidthPercent(2)).toBe(60);
    expect(meterWidthPercent(3)).toBe(80);
    expect(meterWidthPercent(4)).toBe(100);
  });

  it('o total de segmentos vem da régua, não de um literal na tela', () => {
    expect(LEVELS_PER_METER).toBe(5);
    // A barra nunca fica com 6 ou 4 segmentos: o denominador é derivado.
    expect(meterWidthPercent(LEVELS_PER_METER - 1)).toBe(100);
  });

  it('a nota mais alta que a régua produz para PIN não acende a barra toda', () => {
    // O PIN nunca passa de "razoável" de propósito (8 dígitos não têm entropia
    // de senha); se um dia `score` vier 4, é bug da régua, não da barra.
    const maximo = Math.max(...[0, 1, 2, 3, 4].map((d) => gradeOf('pin', String(d)).score));
    expect(maximo).toBeLessThanOrEqual(2);
  });
});
