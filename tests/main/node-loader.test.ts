// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * O loader de aliases (`src/node.loader.ts`) só roda em processo filho: ele se
 * registra com `module.registerHooks()` e vale justamente fora do Vitest, que
 * tem o próprio `resolve.alias`. Por isso o teste aqui roda o Node de verdade
 * em vez de importar o módulo: o que precisa ser provado é que o hook resolve
 * os cinco aliases `@zero/*` para arquivos que existem, com e sem extensão.
 *
 * O V8 não mede cobertura entre processos, então `node.loader.ts` fica fora do
 * denominador (ver `exclude` em `vitest.config.mts`): manter o 0% dele no
 * relatório só faria o número deitar um teste que existe e passa.
 */

const ROOT = process.cwd();
const LOADER = path.join(ROOT, 'src', 'node.loader.ts');

let dir: string;

/** Executa um trecho `.ts` com o loader registrado e devolve o stdout. */
function runNode(source: string): string {
  const file = path.join(dir, 'alvo.ts');
  writeFileSync(file, source, 'utf8');
  return execFileSync(process.execPath, ['--import', LOADER, file], {
    encoding: 'utf8',
    cwd: ROOT,
    // O último caso provoke `ERR_MODULE_NOT_FOUND` de propósito; sem pipar o
    // stderr, a stack do filho apareceria como ruído no relatório do Vitest.
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cronologia-loader-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('node.loader: aliases @zero/*', () => {
  it('resolve barrel sem extensão (o caminho mais comum)', () => {
    // `@zero/types` e `@zero/messages` são barrels: o alvo é `index.ts`.
    expect(runNode("console.log((await import('@zero/messages')).LANGUAGES.join(','));")).toBe(
      'pt-BR,en,ko,zh-CN,ja',
    );
  });

  it('resolve arquivo com subcaminho e sem extensão', () => {
    expect(
      runNode("console.log((await import('@zero/renderer/constants')).CATEGORIES.length);"),
    ).toBe('56');
  });

  it('resolve arquivo com a extensão explícita que o tsconfig usa', () => {
    expect(
      runNode("console.log(typeof (await import('@zero/main/settings.ts')).saveSettings);"),
    ).toBe('function');
  });

  it('deixa passar especificador que não é alias', () => {
    // `node:path` não passa por nenhum prefixo: o hook tem que devolver o
    // próximo resolvedor intacto, senão o Node puro quebra.
    expect(runNode("console.log((await import('node:path')).join('a', 'b'));")).toBe('a/b');
  });

  it('propaga o erro do Node quando o alias não existe em disco', () => {
    // `resolveFile` devolve `null` para alvo inexistente e o hook cai em
    // `nextResolve`, que é quem deve reclamar (ERR_MODULE_NOT_FOUND).
    expect(() => runNode("await import('@zero/main/nao-existe');")).toThrow();
  });
});
