import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Espelha `paths` de tsconfig.base.json e o mapa de `node.loader.ts`. */
export const aliases = {
  '@zero/types': resolve(import.meta.dirname, 'src/types'),
  '@zero/messages': resolve(import.meta.dirname, 'src/messages'),
  '@zero/main': resolve(import.meta.dirname, 'src/main'),
  '@zero/preload': resolve(import.meta.dirname, 'src/preload'),
  '@zero/renderer': resolve(import.meta.dirname, 'src/renderer/src'),
  electron: resolve(import.meta.dirname, 'tests/mocks/electron.ts'),
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: aliases,
  },
  test: {
    name: 'cronologia',
    root: import.meta.dirname,
    environment: 'jsdom',
    pool: 'forks',
    // Com 21 forks abrindo jsdom em paralelo, testes que rodam em <1s isolados
    // já estouraram os 5s padrão e flakaram sob carga; 15s dá folga sem esconder
    // teste travado (o failure ainda aparece no timeout).
    testTimeout: 15_000,
    // O registro de IPC/scheme do processo main acontece no import; limpar mocks
    // antes de cada teste apagaria essas chamadas e quebraria os asserts.
    clearMocks: false,
    setupFiles: ['tests/setup-env.ts', 'tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/renderer/src/global.d.ts',
        'src/renderer/index.html',
        // Declarações de tipo e barrels de reexport. Com `verbatimModuleSyntax`,
        // `interface`, `type` e `export type {...} from` não emitem nada, então
        // estes arquivos têm 0 statements e 0 funções: o 0% deles é artefato de
        // medição, e nenhum teste os cobriria. Ficam de fora do denominador em
        // vez de virar uma meta impossível.
        'src/types/**',
        'src/messages/index.ts',
        // Hook de resolução do Node para rodar `.ts` sem bundler (`npm run
        // dev`, `node --import`). Ele é verificado por `tests/main/node-loader.test.ts`,
        // que roda o Node de verdade em processo filho, mas o V8 não mede
        // cobertura entre processos: manter o arquivo no relatório só faria
        // o número deitar um teste que existe e passa.
        'src/node.loader.ts',
      ],
      // Meta de 95% **por arquivo** nas quatro métricas. Subiu de 50% depois
      // da leva de testes de 2026-10: a varredura por arquivo, de baixo para
      // cima, mostrou que o piso agregado deixava passar um arquivo inteiro
      // sem teste (o entry do renderer estava em 0%, os bundles de idioma em
      // 10% e o scheme da SPA em 35%). A diferença entre 95% global e 95% por
      // arquivo é que a segunda não perdoa o arquivo esquecido.
      thresholds: {
        perFile: true,
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 95,
      },
    },
  },
});
