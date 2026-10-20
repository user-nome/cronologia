import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { protocol } from 'electron';
import { mimeFor, readCoverBuffer } from '@zero/main/library';

/**
 * Scheme da página do app em produção (via `protocol.handle`, no lugar de
 * `file://`, recomendado pela doc atual do Electron) e o scheme das capas.
 *
 * `registerSchemesAsPrivileged` roda na importação do módulo, antes do
 * `app.whenReady` (exigência do Electron); daí o registro ficar no topo.
 */

export const APP_SCHEME = 'cronologia';
export const APP_ORIGIN = `${APP_SCHEME}://app`;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'cover',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

/**
 * URL da página do app: o dev server do Vite em desenvolvimento, o scheme
 * `cronologia://` em produção.
 *
 * Fica em um lugar só porque **duas** guardas precisam concordar com essa base:
 * a `will-navigate` da janela (que barra salto para outra URL) e a guarda de
 * origem do IPC, que decide se o emissor é a página oficial. Se as duas
 * resolvessem a base por conta própria, uma delas passaria a recusar o frame
 * legítimo em silêncio, e o sintoma seria "o app não salva nada" em vez de um
 * erro visível.
 */
export function appPageUrl(): string {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  return devUrl !== undefined && devUrl !== '' ? devUrl : `${APP_ORIGIN}/index.html`;
}

/**
 * Serve a capa decifrada da biblioteca. O arquivo em disco é `.enc` (AES-256-GCM
 * com a chave do cofre), então a decifração acontece aqui, a cada requisição:
 * com o cofre fechado ou a capa ilegível, `readCoverBuffer` devolve `null` e a
 * imagem simplesmente não aparece. `basename` no nome segue sendo a barreira
 * de path traversal.
 *
 * O corpo das respostas de erro é status de transporte, em inglês e literal de
 * propósito (mesma razão de `registerAppProtocol`): quem chega aqui é o
 * carregador de imagem, não a pessoa, e não há tela para traduzir.
 */
export function registerCoverProtocol(): void {
  protocol.handle('cover', (request) => {
    try {
      const url = new URL(request.url);
      const name = path.basename(decodeURIComponent(url.pathname));
      if (name === '') return new Response(NOT_FOUND, { status: HTTP_NOT_FOUND });
      const buffer = readCoverBuffer(name);
      if (buffer === null) return new Response(NOT_FOUND, { status: HTTP_NOT_FOUND });
      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': mimeFor(name),
          'Cache-Control': `max-age=${COVER_CACHE_MAX_AGE_SECONDS}`,
        },
      });
    } catch {
      return new Response(INTERNAL_ERROR, { status: HTTP_INTERNAL_ERROR });
    }
  });
}

/**
 * Frases de status do protocolo.
 *
 * Uma constante só para as duas, porque a alternativa foi o arquivo ter
 * `'Forbidden'` ao lado de `'Não encontrado.'`: dois idiomas no mesmo arquivo de
 * transporte, sem regra para dizer qual usar, é como se pega `'Erro'` na
 * próxima linha. O idioma é trabalho de `src/messages/`, e este não é um
 * lugar visível para a pessoa.
 */
const FORBIDDEN = 'Forbidden';
const NOT_FOUND = 'Not Found';
const INTERNAL_ERROR = 'Internal Error';

/**
 * Status HTTP das respostas de transporte.
 *
 * Números, e não texto: quem chega aqui é o carregador de asset ou de imagem,
 * não a pessoa. O status é o que o carregador entende, e a frase de status é o
 * corpo.
 */
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_ERROR = 500;

/** Tempo de cache da capa decifrada, em segundos (a capa só muda com a obra). */
const COVER_CACHE_MAX_AGE_SECONDS = 3_600;

/** Extensão → tipo MIME mínimo para servir a SPA local. */
function rendererMime(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.map':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    case '.ico':
      return 'image/x-icon';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Serve a SPA empacotada sob o scheme `cronologia://`: todo `/assets/...`
 * resolve dentro de `out/renderer`, com path traversal rejeitado por
 * `path.resolve` + prefixo (`/../../../../etc/passwd` cai fora e vira 403;
 * o parser de URL do Chromium normaliza os `..` antes, então o handler
 * enxerga um caminho já relativo).
 *
 * Os corpos das respostas são frases de status do protocolo, em inglês e
 * literais de propósito: é transporte, não interface. Quem chega aqui é o
 * carregador de asset, não a pessoa, então localizá-los seria ler um bundle de
 * mensagens por requisição sem ganho nenhum.
 */
export function registerAppProtocol(): void {
  const root = path.join(__dirname, '../renderer');
  protocol.handle(APP_SCHEME, (request) => {
    try {
      const u = new URL(request.url);
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const full = path.resolve(root, rel === '' ? 'index.html' : rel);
      if (!full.startsWith(`${root}${path.sep}`)) {
        return new Response(FORBIDDEN, { status: HTTP_FORBIDDEN });
      }
      if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        return new Response(NOT_FOUND, { status: HTTP_NOT_FOUND });
      }
      return new Response(new Uint8Array(fs.readFileSync(full)), {
        headers: { 'Content-Type': rendererMime(full) },
      });
    } catch {
      return new Response(INTERNAL_ERROR, { status: HTTP_INTERNAL_ERROR });
    }
  });
}
