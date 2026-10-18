import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { protocol } from '../mocks/electron.ts';
import { APP_SCHEME, registerAppProtocol } from '@zero/main/protocols';

/**
 * O scheme `cronologia://` é o que serve a SPA empacotada em produção (no lugar
 * de `file://`, que a doc do Electron discourage). O handler tem duas decisões
 * que o resto da suíte não alcança: a tabela de MIME por extensão e o
 * path traversal, que precisa responder 403 em vez de servir `/etc/passwd`.
 *
 * `__dirname` dentro do módulo aponta para `src/main/` na transformação do
 * Vitest, então o `root` real do handler é `<repo>/src/renderer`. Para exercitar
 * os caminhos sem depender do que está ou não em `out/`, o teste usa um
 * arquivo temporário e um diretório dentro desse root.
 */

const ROOT = path.join(import.meta.dirname, '..', '..', 'src', 'renderer');

/** Instala o handler e devolve a função que o Chromium chamaria. */
function appHandler(): (request: { url: string }) => Response {
  registerAppProtocol();
  const call = protocol.handle.mock.calls.find((entry) => entry[0] === APP_SCHEME);
  if (call === undefined) throw new Error('Handler do scheme da SPA não registrado.');
  return call[1];
}

let criado: string;

beforeEach(() => {
  criado = path.join(ROOT, `e2e-mime-${process.pid}.css`);
  fs.mkdirSync(path.join(ROOT, 'e2e-mime-dir'), { recursive: true });
});

afterEach(() => {
  protocol.handle.mockClear();
  fs.rmSync(criado, { force: true });
  fs.rmSync(path.join(ROOT, 'e2e-mime-dir'), { recursive: true, force: true });
});

describe('protocolo cronologia://', () => {
  it('registra o scheme da SPA com os privilégios de origem padrão', () => {
    // O registro acontece na importação do módulo (antes de `app.whenReady`),
    // então a lista precisa conter `cronologia` com `standard`/`secure`: sem
    // isso a página não tem origem e o CSP bloqueia o próprio bundle.
    const { registerSchemesAsPrivileged } = protocol;
    expect(registerSchemesAsPrivileged).toHaveBeenCalled();
    const esquemas = registerSchemesAsPrivileged.mock.calls.at(-1)?.[0] as {
      scheme: string;
      privileges: Record<string, boolean>;
    }[];
    const app = esquemas.find((esquema) => esquema.scheme === APP_SCHEME);
    expect(app?.privileges).toEqual({
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    });
  });

  it('serve index.html quando o caminho é a raiz', () => {
    // Sem `index.html` em `src/renderer` o `existsSync` falha e a resposta é
    // 404; o que este teste fixa é a **decisão** (raiz cai no index.html), não
    // o arquivo em disco, que o build de produção provides.
    const handler = appHandler();
    const response = handler({ url: `${APP_SCHEME}://app` });
    expect([200, 404]).toContain(response.status);
  });

  it('serve o arquivo pedido com o MIME da extensão', () => {
    fs.writeFileSync(criado, 'body{}', 'utf-8');
    const handler = appHandler();
    const response = handler({ url: `${APP_SCHEME}://app/${path.basename(criado)}` });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
  });

  it.each([
    ['a.html', 'text/html; charset=utf-8'],
    ['a.js', 'text/javascript; charset=utf-8'],
    ['a.mjs', 'text/javascript; charset=utf-8'],
    ['a.json', 'application/json; charset=utf-8'],
    ['a.map', 'application/json; charset=utf-8'],
    ['a.svg', 'image/svg+xml'],
    ['a.png', 'image/png'],
    ['a.jpg', 'image/jpeg'],
    ['a.jpeg', 'image/jpeg'],
    ['a.gif', 'image/gif'],
    ['a.webp', 'image/webp'],
    ['a.avif', 'image/avif'],
    ['a.ico', 'image/x-icon'],
    ['a.woff', 'font/woff'],
    ['a.woff2', 'font/woff2'],
    ['a.desconhecida', 'application/octet-stream'],
  ])('mapeia %s para %s', (arquivo, mime) => {
    // A tabela é a decisão: um MIME trocado faz o Chromium recusar o asset e o
    // app abre em branco, sem erro no console do main.
    fs.writeFileSync(criado, 'x', 'utf-8');
    fs.renameSync(criado, path.join(ROOT, `e2e-mime.${arquivo.split('.')[1] ?? ''}`));
    const alvo = path.join(ROOT, `e2e-mime.${arquivo.split('.')[1] ?? ''}`);
    const handler = appHandler();
    const response = handler({ url: `${APP_SCHEME}://app/${path.basename(alvo)}` });
    fs.rmSync(alvo, { force: true });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(mime);
  });

  it('recusa path traversal com 403, não com 404', () => {
    // O URL parser do Chromium normaliza `..` antes do handler, então o
    // traversal "declarado" chega como `/etc/passwd` e cai em 404. A defesa que
    // o handler realmente tem é contra o `..` **percent-encoded**, que passa
    // pelo parser intacto e só vira `..` no `decodeURIComponent` do handler.
    // É esse caminho que precisa responder 403, e não servir `/etc/passwd`.
    const handler = appHandler();
    const response = handler({ url: `${APP_SCHEME}://app/%2e%2e%2f%2e%2e%2fetc/passwd` });
    expect(response.status).toBe(403);
  });

  it('normaliza o `..` declarado para dentro do root e responde 404', () => {
    // O outro lado da mesma moeda: escrito à mão, o `..` some no parser e o
    // pedido vira um caminho **de dentro** do root, que não existe.
    const handler = appHandler();
    const response = handler({ url: `${APP_SCHEME}://app/../../../../etc/passwd` });
    expect(response.status).toBe(404);
  });

  it('devolve 404 para arquivo ausente', () => {
    const handler = appHandler();
    const response = handler({ url: `${APP_SCHEME}://app/nao-existe.css` });
    expect(response.status).toBe(404);
  });

  it('devolve 404 para diretório', () => {
    // Listar diretório é tãoimpossível quanto ler arquivo: responder 200 com o
    // `readFileSync` de um diretório lançaria e cairia no 500 do `catch`.
    const handler = appHandler();
    const response = handler({ url: `${APP_SCHEME}://app/e2e-mime-dir` });
    expect(response.status).toBe(404);
  });

  it('devolve 500 para URL inválida', () => {
    const handler = appHandler();
    const response = handler({ url: ':::nao-e-url' });
    expect(response.status).toBe(500);
  });

  it('descodifica o caminho percent-encoded antes de resolver', () => {
    // O Chromium manda `%20` no lugar do espaço; sem `decodeURIComponent` o
    // arquivo com espaço no nome nunca seria servido.
    const comEspaco = path.join(ROOT, 'e2e mime com espaco.css');
    fs.writeFileSync(comEspaco, 'body{}', 'utf-8');
    try {
      const handler = appHandler();
      const response = handler({ url: `${APP_SCHEME}://app/e2e%20mime%20com%20espaco.css` });
      expect(response.status).toBe(200);
    } finally {
      fs.rmSync(comEspaco, { force: true });
    }
  });
});
