// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseFile, walk } from '../../tools/mutation/ast.ts';
import { buildModuleGraph } from '../../tools/mutation/graph.ts';
import { applyMutant, enumerateMutants } from '../../tools/mutation/mutants.ts';
import { MUTATION_TEST_OPTIONS } from '../../tools/mutation/vitest-options.ts';
import { isInScope } from '../../tools/mutation/scope.ts';

/**
 * A varredura de mutação mede "se esta linha fizesse outra coisa, a suíte
 * perceberia?". A resposta depende inteiramente de o mutante **entrar** na
 * execução; se ele não entra, a suíte passa e o veredito é `survived`, que é
 * mentira com a forma certa.
 *
 * Já aconteceu: o `fsModuleCache` do Vitest (ligado por padrão) guarda o módulo
 * transformado em `node_modules/.vitest-cache`, indexado pelo id do arquivo. A
 * chave não enxerga o mutante que o plugin injeta, então o cache deixado pelo
 * mutante anterior era revalidado como válido. Na prática só o primeiro mutante
 * de cada arquivo era medido de verdade, e o score caía sozinho conforme a
 * varredura avançava, sem nenhuma alteração no código sob teste.
 *
 * Os testes abaixo travam as duas metades: o splicing aplica a troca no texto, e
 * a config desliga o cache que faria a troca ser ignorada.
 */

const ALVO = 'src/main/vault/crypto.ts';

describe('splicing do mutante', () => {
  it('troca o trecho do mutante e só ele', () => {
    const code = readFileSync(ALVO, 'utf8');
    const mutante = enumerateMutants(ALVO, ALVO, code)[0];
    expect(mutante).toBeDefined();
    if (mutante === undefined) return;

    const mutado = applyMutant(code, mutante);

    // O splicing é `antes + troca + depois`: o que vem antes do mutante fica
    // intacto, e o que vem depois continua igual, deslocado pelo tamanho da
    // substituição.
    expect(mutado).not.toBe(code);
    expect(mutado.slice(0, mutante.start)).toBe(code.slice(0, mutante.start));
    expect(mutado.slice(mutante.start + mutante.replacement.length)).toBe(code.slice(mutante.end));
  });

  it('cada mutante aponta para um trecho diferente do arquivo', () => {
    const mutantes = enumerateMutants(ALVO, ALVO, 'const a = 1;\nconst b = 2;\n');
    const inicios = new Set(mutantes.map((m) => m.start));
    expect(inicios.size).toBe(mutantes.length);
  });
});

describe('config da varredura', () => {
  it('desliga o cache de módulo do Vitest', () => {
    // Sem isto, o cache revalida o texto do mutante anterior e este veredito
    // inteiro (o `survived` falso) volta. Ver o comentário do topo do arquivo.
    expect(MUTATION_TEST_OPTIONS.fsModuleCache).toBe(false);
  });

  it('zera os limiares de cobertura, que são os da suíte inteira', () => {
    // A varredura liga a cobertura só para montar a matriz de linhas. Um arquivo
    // de teste sozinho nunca bate 50%, então manter o limiar reprovaria tudo.
    expect(MUTATION_TEST_OPTIONS.coverage.enabled).toBe(false);
    expect(MUTATION_TEST_OPTIONS.coverage.thresholds).toEqual({
      lines: 0,
      statements: 0,
      functions: 0,
      branches: 0,
    });
  });
});

/**
 * O motor de mutação decide o que é mutável comparando **nomes de nó da AST**.
 * Um Babel maior pode renomear um tipo de nó, e aí a comparação simplesmente
 * nunca casa: nenhum erro, nenhuma exceção, só um mutante ou um import que
 * some. Foi exatamente o que o Babel 8 fez com `import('x')`, que deixou de ser
 * `CallExpression` com `callee` do tipo `Import` e passou a ser
 * `ImportExpression`: `src/preload/index.ts` saiu do grafo de módulos (só é
 * alcançado por `import()`) e deixou de ser medido, sem uma única falha.
 *
 * O teste abaixo fixa os nomes de que o motor depende. Quando um Babel trocar
 * algum, a falha aponta o nome exato em vez de deixar o escore mentir.
 */
describe('os nós que o motor de mutação reconhece', () => {
  const NOVAS = new Set<string>();

  function parseFixture(codigo: string): void {
    walk(parseFile('fixture.ts', codigo), (node) => NOVAS.add(node.type));
  }

  beforeAll(() => {
    parseFixture(
      [
        "import { a, b as c } from 'mod';",
        "export * from './reexporta';",
        'export default 42;',
        'const objeto = { metodo() {}, chave: 1 };',
        'const acessado = objeto?.prop;',
        'export { a as d } from "outro";',
        'async function dinamico() { await import("so-em-tempo-de-execucao"); }',
        // O app não tem classe hoje, mas `isNamePosition` compara com
        // `ClassProperty`/`ClassMethod` para saber que o nó está na posição de
        // nome: o nome da regra é fixado pelo fixture, não pelo `src/` atual.
        'class Cofre {oz: string = ""; abre(): void {}}',
      ].join('\n'),
    );
    for (const arquivo of [
      'src/main/vault/crypto.ts',
      'src/main/library.ts',
      'src/main/shred.ts',
      'src/main/store-crypto.ts',
      'src/renderer/src/components/Select.tsx',
    ]) {
      walk(parseFile(arquivo, readFileSync(arquivo, 'utf8')), (node) => NOVAS.add(node.type));
    }
  });

  it.each([
    'ImportDeclaration',
    'ImportSpecifier',
    'ExportSpecifier',
    'ExportNamedDeclaration',
    'ExportAllDeclaration',
    'ExportDefaultDeclaration',
    'MemberExpression',
    'OptionalMemberExpression',
    'ObjectProperty',
    'ObjectMethod',
    'TSPropertySignature',
    'FunctionDeclaration',
    'ClassDeclaration',
    'ClassMethod',
    'ClassProperty',
    'VariableDeclaration',
    'BinaryExpression',
    'LogicalExpression',
    'ConditionalExpression',
    'UnaryExpression',
    'IfStatement',
    'NumericLiteral',
    'StringLiteral',
    'ImportExpression',
  ])('reconhece %s', (tipo) => {
    expect(NOVAS.has(tipo)).toBe(true);
  });
});

describe('grafo de módulos', () => {
  // O grafo é caro (o Babel parseia `src/` e `tests/` inteiros) e não muda
  // entre os três vereditos: construí-lo uma vez é a diferença entre passar e
  // estourar o tempo limite quando a suíte roda instrumentada. O prazo do hook
  // é maior que o padrão porque o trabalho é de verdade — e a máquina pode
  // estar ocupada com os outros arquivos da suíte.
  let graph: ReturnType<typeof buildModuleGraph>;

  beforeAll(() => {
    graph = buildModuleGraph(process.cwd());
  }, 60_000);

  it('o preload entra no grafo, alcançado pelo import() dinâmico do teste', () => {
    // `tests/preload/index.test.ts` carrega o preload com `await import()` para
    // poder rodar `vi.resetModules()`, e é o único caminho até ele. Sem
    // *following* do `import()` literal, este arquivo saía do plano de mutação e
    // a ponte entre a interface e o processo main deixava de ser medida.
    expect(graph.testsBySource.get('src/preload/index.ts')).toContain(
      'tests/preload/index.test.ts',
    );
  });

  it('todo arquivo de src/ que nenhum teste alcança está fora de escopo', () => {
    // Um órfão que está em escopo é arquivo de `src/` que a varredura não mede
    // por buraco de teste, e ele aparece como tal no relatório. `scope.ts` já
    // exclui os tipos, as traduções, o carregador do Node e os dados puros, então
    // este teste falha no momento em que um desses arquivos ganha teste: o sinal
    // para tirá-lo da lista de exclusões.
    expect(graph.orphans.filter((file) => isInScope(file))).toEqual([]);
  });

  it('os tipos e o carregador do Node são órfãos por construção', () => {
    // Nenhum teste importa `src/types/index.ts` (só tipos, que somem em tempo de
    // runtime) nem `src/node.loader.ts` (só roda em processo filho). São órfãos
    // esperados, e `scope.ts` já os tira do denominador.
    expect(graph.orphans).toContain('src/node.loader.ts');
    expect(graph.orphans).toContain('src/types/index.ts');
  });
});
