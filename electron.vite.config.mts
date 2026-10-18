import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { resolve } from 'path';

const root = import.meta.dirname;

/** Espelha `paths` de tsconfig.base.json e o mapa de `node.loader.ts`. */
const sharedAliases = {
  '@zero/types': resolve(root, 'src/types'),
  '@zero/messages': resolve(root, 'src/messages'),
} as const;

/**
 * Identificadores OAuth que o build do `main` carrega dentro do binário.
 *
 * `loadEnv(mode, root, '')` lê o `.env` local **e** o `process.env` do CI, com o
 * segundo vencendo sobre o primeiro. Os valores não aparecem no código-fonte;
 * o Dropbox e o client_id do Google são públicos em clientes desktop, e o
 * client_secret do Google não é uma barreira de segurança.
 */
function oauthCredentials(mode: string): Record<string, string> {
  const env = loadEnv(mode, root, '');
  return {
    'process.env.DROPBOX_APP_KEY': JSON.stringify(env.DROPBOX_APP_KEY ?? ''),
    'process.env.GOOGLE_CLIENT_ID': JSON.stringify(env.GOOGLE_CLIENT_ID ?? ''),
    'process.env.GOOGLE_CLIENT_SECRET': JSON.stringify(env.GOOGLE_CLIENT_SECRET ?? ''),
  };
}

export default defineConfig(({ mode }) => ({
  main: {
    resolve: {
      alias: {
        ...sharedAliases,
        '@zero/main': resolve(root, 'src/main'),
      },
    },
    define: oauthCredentials(mode),
    build: {
      rollupOptions: {
        input: resolve(root, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        ...sharedAliases,
        '@zero/preload': resolve(root, 'src/preload'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(root, 'src/preload/index.ts'),
        output: {
          // Preload sandboxed não tem loader ESM no Electron: precisa sair como
          // CommonJS (`.cjs`), mesmo com `package.json` em `"type": "module"`.
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name]-[hash].cjs',
        },
      },
    },
  },
  renderer: {
    root: resolve(root, 'src/renderer'),
    server: {
      fs: {
        // O root do renderer é `src/renderer`; sem liberar a raiz do projeto o
        // Vite recusa (403) os webfonts do FontAwesome em `node_modules` no dev.
        allow: [root],
      },
    },
    resolve: {
      alias: {
        ...sharedAliases,
        '@zero/renderer': resolve(root, 'src/renderer/src'),
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(root, 'src/renderer/index.html'),
      },
    },
  },
}));
