import type { AccountEmailResponse } from '@zero/types';
import type { OAuthFlow } from '@zero/main/drive/oauth-flow';
import {
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_LOOPBACK_PATH,
  GOOGLE_SCOPES,
  GOOGLE_TOKEN_ENDPOINT,
  GOOGLE_USERINFO_ENDPOINT,
} from '@zero/main/drive/providers/google/constants';
import { googleClientSecret } from '@zero/main/drive/providers/google/credentials';
import { parseJson } from '@zero/main/drive/json';
import { currentMessages } from '@zero/main/i18n';

/** Valida a resposta do `userinfo` (só o e-mail interessa). */
function isUserInfo(data: unknown): data is AccountEmailResponse {
  if (typeof data !== 'object' || data === null || !('email' in data)) return false;
  return typeof data.email === 'string';
}

/**
 * E-mail de quem autorizou.
 *
 * Falha de rede ou formato inesperado devolve `null` em vez de derrubar a
 * conexão: o e-mail é rótulo na barra de status, e um token válido sem e-mail é
 * uma sessão boa. O token vai no header, nunca na query string (URL vaza em log
 * e proxy).
 */
async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data: unknown = await parseJson(res);
    return isUserInfo(data) ? data.email : null;
  } catch {
    return null;
  }
}

/**
 * Parâmetros do pedido de consentimento, além dos do PKCE.
 *
 * `access_type=offline` é o que faz o Google devolver `refresh_token`; sem ele a
 * sessão morre em uma hora. `prompt=consent` força a tela de consentimento mesmo
 * quando a conta já autorizou o app antes, que é o jeito de garantir o refresh
 * token numa reconexão depois de um "desconectar" local.
 */
function authorizeParams(): Record<string, string> {
  return { access_type: 'offline', prompt: 'consent' };
}

/**
 * Parâmetros da troca e da renovação, além dos do PKCE.
 *
 * Aqui entra o `client_secret`, e o comentário de `credentials.ts` vale para
 * este ponto: num cliente *Desktop* ele é declarado não confidencial pela
 * própria plataforma, e a documentação do OAuth o chama de "concordar com os
 * termos". O que protege a conta é o `code_verifier` do PKCE, que só existe
 * neste processo. Build sem o secret manda o pedido sem ele, que o Google
 * também aceita quando o PKCE está presente.
 */
function tokenParams(clientId: string): Record<string, string> {
  const secret = googleClientSecret();
  if (secret === '') return {};
  return { client_id: clientId, client_secret: secret };
}

/** Constantes do fluxo OAuth do Google Drive. */
export const googleFlow: OAuthFlow = {
  id: 'google-drive',
  authorizeEndpoint: GOOGLE_AUTH_ENDPOINT,
  tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
  scopes: GOOGLE_SCOPES,
  timeoutMs: 5 * 60 * 1000,
  loopbackPath: GOOGLE_LOOPBACK_PATH,
  authorizeParams,
  tokenParams,
  renewError: () => currentMessages().driveErrors.refreshFailed('Google Drive'),
  accountEmail: fetchAccountEmail,
};
