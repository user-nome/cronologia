import crypto from 'crypto';
import http from 'http';
import { URLSearchParams } from 'url';
import type { BackupProviderId } from '@zero/types';
import { providerLabel } from '@zero/main/drive/constants';
import { parseJson } from '@zero/main/drive/json';
import { openExternalSafe } from '@zero/main/external';
import { currentMessages } from '@zero/main/i18n';

/**
 * O pedaço de OAuth que é o mesmo em qualquer nuvem: PKCE, servidor local de
 * callback, troca do código por tokens e renovação. Só isso.
 *
 * Endpoints, parâmetros extras e a leitura de "de quem é a conta" são descritos
 * pelo `OAuthFlow`, e cada provedor continua tendo o seu módulo cuidando da
 * sessão (`drive/oauth.ts` para o Dropbox, `drive/providers/google/oauth.ts`
 * para o Google).
 *
 * Extrair isto aqui não foi estética: com o Google passando a ser operante, a
 * alternativa era copiar umas duzentas linhas de PKCE e loopback, e as duas
 * cópias divergiriam na primeira correção de segurança.
 */

/** Constantes do fluxo: tudo que muda entre um provedor e outro. */
export interface OAuthFlow {
  id: BackupProviderId;
  /** Tela de consentimento, sem a query. */
  authorizeEndpoint: string;
  /** Endpoint de token. */
  tokenEndpoint: string;
  /** Escopo pedido, separado por espaço. */
  scopes: string;
  /** Milissegundos até desistir do consentimento aberto. */
  timeoutMs: number;
  /** Caminho do callback no servidor local (`/callback` nos dois). */
  loopbackPath: string;
  /**
   * Porta fixa do callback, quando o provedor exige a URI pré-cadastrada.
   * Ausente = porta efêmera, que é o caso do Google.
   */
  fixedPort?: number | undefined;
  /** Parâmetros extras do pedido de consentimento (`token_access_type` etc.). */
  authorizeParams?: (clientId: string) => Record<string, string>;
  /** Parâmetros extras da troca e da renovação (o `client_secret` do Google). */
  tokenParams?: (clientId: string) => Record<string, string>;
  /**
   * Mensagem de falha da **renovação**.
   *
   * A troca do código por tokens falha com `tokenFailed` (o status HTTP basta),
   * mas uma renovação que falha é outra história: a sessão do usuário está no
   * fim da validade, e o que ele precisa saber é que precisa reconectar. Por
   * isso a mensagem é do provedor, não do fluxo, e vale tanto para o status
   * ruim quanto para o corpo fora da forma (o status 200 com corpo inválido não
   * ajuda ninguém a decidir o que fazer).
   */
  renewError: () => string;
  /** E-mail de quem autorizou, para a barra de status; `null` se não houver. */
  accountEmail: (accessToken: string) => Promise<string | null>;
}

/** O que o consentimento devolve, mais o que a troca vai precisar. */
export interface AuthorizationGrant {
  clientId: string;
  code: string;
  /** Segredo do PKCE, guardado só até a troca. */
  codeVerifier: string;
  /** URI usada na troca: precisa bater com a do pedido de consentimento. */
  redirectUri: string;
}

/** Resposta de token já validada, nos nomes do app (não os da nuvem). */
export interface RawTokens {
  accessToken: string;
  refreshToken?: string | undefined;
  /** Segundos de validade, contados de agora. */
  expiresIn: number;
  /** Escopos que a nuvem disse ter concedido, quando ela informa. */
  grantedScopes?: string | undefined;
}

interface AuthOutcome {
  code: string | null;
  error: string | null;
}

const LOOPBACK_HOST = '127.0.0.1';

function listen(server: http.Server, port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    // Host explícito e único: evita a ambiguidade de `localhost` resolver ora
    // para `127.0.0.1` ora para `::1` enquanto o servidor e o navegador não
    // concordarem sobre o mesmo endereço.
    server.listen(port, LOOPBACK_HOST, () => resolve());
  });
}

function shutdown(server: http.Server): void {
  server.close();
  server.closeAllConnections();
}

/** Página do callback, antes de fechar o servidor (nunca vazia o `code`). */
function respond(res: http.ServerResponse, denied: boolean): void {
  const m = currentMessages();
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;background:#000;color:#e8ecf6;padding:40px">
      <h2>${denied ? m.oauthPage.deniedTitle : m.oauthPage.doneTitle}</h2>
      <p>${denied ? m.oauthPage.deniedBody : m.oauthPage.doneBody}</p>
    </body>`,
  );
}

/**
 * Sobe o servidor de callback, abre o consentimento e espera o navegador
 * voltar com o `code`.
 *
 * `expectedState` é conferido aqui, dentro do handler: um `code` acompanhado de
 * um `state` diferente é de outra origem (ou de outra aba), e o PKCE, sozinho,
 * impediria a troca de qualquer forma. Comparar no servidor evita responder
 * "pronto" para um callback que não é nosso.
 */
async function openBrowser(
  flow: OAuthFlow,
  params: URLSearchParams,
  expectedState: string,
): Promise<{ code: string; redirectUri: string }> {
  let resolveOutcome: (outcome: AuthOutcome) => void = () => undefined;
  const outcomePromise = new Promise<AuthOutcome>((resolve) => {
    resolveOutcome = resolve;
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== flow.loopbackPath) {
      res.writeHead(404).end();
      return;
    }
    const error = url.searchParams.get('error_description') ?? url.searchParams.get('error');
    const code = url.searchParams.get('code');
    const receivedState = url.searchParams.get('state');
    const outcome: AuthOutcome =
      receivedState === expectedState
        ? { code, error }
        : { code: null, error: currentMessages().driveErrors.csrfRejected };
    respond(res, error !== null || outcome.error !== null);
    // Só conclui após o flush: `closeAllConnections` destruiria a resposta
    // ainda na fila se resolvesse antes.
    setImmediate(() => {
      shutdown(server);
      resolveOutcome(outcome);
    });
  });

  // Provedor com URI de redirecionamento pré-cadastrada (Dropbox) tenta a
  // porta fixa; se ela estiver ocupada (ex.: suíte de testes em paralelo), cai
  // para uma porta livre, e nesse caso a nuvem recusa o redirect, com o erro da
  // troca de tokens indicando o motivo. Provedor sem exigência (Google) já sobe
  // em porta efêmera.
  const desired = flow.fixedPort ?? 0;
  let port = desired;
  try {
    await listen(server, desired);
  } catch {
    server.removeAllListeners('error');
    await listen(server, 0);
    port = 0;
  }
  const address = server.address();
  if (typeof address === 'object' && address !== null) port = address.port;
  const redirectUri = `http://localhost:${port}${flow.loopbackPath}`;
  params.set('redirect_uri', redirectUri);

  // URL montada pelo app (endpoint fixo + params do PKCE); o helper recusa
  // qualquer protocolo fora de `https:`.
  openExternalSafe(`${flow.authorizeEndpoint}?${params.toString()}`);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AuthOutcome>((resolve) => {
    timer = setTimeout(
      () => resolve({ code: null, error: currentMessages().driveErrors.tokenTimeout }),
      flow.timeoutMs,
    );
    // Não segura o processo (testes) quando o fluxo já terminou por outro caminho.
    if (typeof timer.unref === 'function') timer.unref();
  });
  const outcome = await Promise.race([outcomePromise, timeout]);
  if (timer !== undefined) clearTimeout(timer);
  if (server.listening) shutdown(server);

  if (outcome.code !== null && outcome.code !== '') return { code: outcome.code, redirectUri };
  throw new Error(outcome.error ?? currentMessages().driveErrors.authCancelled);
}

/**
 * Abre o consentimento no navegador e devolve o que a troca de token precisa.
 *
 * O `code_verifier` é gerado aqui e **não** sai do processo: é o que impede
 * que um callback interceptado troque o código por tokens.
 */
export async function requestAuthorizationCode(
  flow: OAuthFlow,
  clientId: string,
): Promise<AuthorizationGrant> {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('base64url');
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: flow.scopes,
    state,
    ...(flow.authorizeParams?.(clientId) ?? {}),
  });
  const { code, redirectUri } = await openBrowser(flow, params, state);
  return { clientId, code, codeVerifier, redirectUri };
}

/** Valida a forma mínima da resposta de tokens antes de usar (falha fechada). */
function isTokenResponse(data: unknown): data is {
  access_token: string;
  refresh_token?: string | undefined;
  expires_in: number;
  scope?: string | undefined;
} {
  if (typeof data !== 'object' || data === null) return false;
  if (!('access_token' in data && 'expires_in' in data)) return false;
  if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') {
    return false;
  }
  if ('scope' in data && data.scope !== undefined && typeof data.scope !== 'string') {
    return false;
  }
  return (
    !('refresh_token' in data) ||
    data.refresh_token === undefined ||
    typeof data.refresh_token === 'string'
  );
}

async function postToken(
  flow: OAuthFlow,
  body: URLSearchParams,
  /** Mensagem de falha, quando não for a padrão da troca do código. */
  onFailure?: () => string,
): Promise<RawTokens> {
  const res = await fetch(flow.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(onFailure?.() ?? currentMessages().driveErrors.tokenFailed(res.status));
  }
  const data: unknown = await parseJson(res);
  if (!isTokenResponse(data)) {
    throw new Error(
      onFailure?.() ?? currentMessages().driveErrors.invalidTokenResponse(res.status),
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    grantedScopes: data.scope !== undefined && data.scope !== '' ? data.scope : undefined,
  };
}

/** Troca o `code` do consentimento por tokens (com o `code_verifier` do PKCE). */
export function exchangeAuthorizationCode(
  flow: OAuthFlow,
  grant: AuthorizationGrant,
): Promise<RawTokens> {
  return postToken(
    flow,
    new URLSearchParams({
      code: grant.code,
      grant_type: 'authorization_code',
      code_verifier: grant.codeVerifier,
      client_id: grant.clientId,
      redirect_uri: grant.redirectUri,
      ...(flow.tokenParams?.(grant.clientId) ?? {}),
    }),
  );
}

/**
 * Renova o access token a partir do refresh token.
 *
 * A nuvem pode não devolver `refresh_token` na renovação (o Dropbox não
 * devolve); quem chama preserva o anterior quando vier ausente.
 */
export function renewAccessToken(
  flow: OAuthFlow,
  clientId: string,
  refreshToken: string,
): Promise<RawTokens> {
  return postToken(
    flow,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      ...(flow.tokenParams?.(clientId) ?? {}),
    }),
    flow.renewError,
  );
}

/** Escopos que ficaram de fora da concessão ('' quando o provedor não informou). */
export function missingScopes(flow: OAuthFlow, granted: string | undefined): string[] {
  if (granted === undefined) return [];
  const have = new Set(granted.split(' ').filter((scope) => scope !== ''));
  return flow.scopes.split(' ').filter((scope) => !have.has(scope));
}

/**
 * Falha de rede da nuvem traduzida, com o nome do provedor na mensagem.
 *
 * Os dois provedores compartilham o `tokenFailed`, que hoje diz só o status;
 * acrescentar o provedor evita o "Erro do Dropbox (HTTP 401)" numa sessão que
 * na verdade é do Google Drive.
 */
export function httpError(flow: OAuthFlow, status: number, response: string): Error {
  return new Error(
    currentMessages().driveErrors.providerHttp(providerLabel(flow.id), status, response),
  );
}
