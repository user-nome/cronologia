import type { AccountEmailResponse } from '@zero/types';
import type { OAuthFlow } from '@zero/main/drive/oauth-flow';
import { providerLabel } from '@zero/main/drive/constants';
import {
  DROPBOX_API_ENDPOINT,
  DROPBOX_AUTH_ENDPOINT,
  DROPBOX_AUTH_TIMEOUT_MS,
  DROPBOX_LOOPBACK_PATH,
  DROPBOX_LOOPBACK_PORT,
  DROPBOX_SCOPES,
  DROPBOX_TOKEN_ENDPOINT,
} from '@zero/main/drive/providers/dropbox/constants';
import { parseJson } from '@zero/main/drive/json';
import { currentMessages } from '@zero/main/i18n';

/**
 * Fluxo OAuth do Dropbox: só as constantes e o que faz o pedido dele.
 *
 * Toda a parte de PKCE e de loopback vive em `oauth-flow.ts`, compartilhada com
 * o Google Drive; aqui ficam os endpoints, os escopos e a leitura do e-mail da
 * conta. A sessão (o que entra em `state.tokens`, o que vai para o cofre) está
 * em `session.ts`.
 *
 * O Dropbox, ao contrário do Google, dispensa `app secret`: cliente público com
 * PKCE se identifica só pela chave, e a chave é pública por definição (aparece
 * na URL de consentimento e sai extraída do binário). Por isso `tokenParams`
 * não existe aqui.
 */

/** Valida a resposta de `users/get_current_account` (só o e-mail interessa). */
function isAccountEmail(data: unknown): data is AccountEmailResponse {
  if (typeof data !== 'object' || data === null || !('email' in data)) return false;
  return typeof data.email === 'string';
}

async function fetchAccountEmail(token: string): Promise<string | null> {
  try {
    // Token no header Authorization (nunca na query string: URL vaza em logs/proxies).
    const res = await fetch(`${DROPBOX_API_ENDPOINT}/users/get_current_account`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: 'null',
    });
    if (!res.ok) return null;
    const data: unknown = await parseJson(res);
    return isAccountEmail(data) ? data.email : null;
  } catch {
    return null;
  }
}

/** Constantes do fluxo OAuth do Dropbox. */
export const dropboxFlow: OAuthFlow = {
  id: 'dropbox',
  authorizeEndpoint: DROPBOX_AUTH_ENDPOINT,
  tokenEndpoint: DROPBOX_TOKEN_ENDPOINT,
  scopes: DROPBOX_SCOPES,
  timeoutMs: DROPBOX_AUTH_TIMEOUT_MS,
  loopbackPath: DROPBOX_LOOPBACK_PATH,
  // A URI de redirecionamento é pré-cadastrada no App Console, então a porta é
  // fixa; se estiver ocupada, `oauth-flow.ts` cai para uma porta livre.
  fixedPort: DROPBOX_LOOPBACK_PORT,
  accountEmail: fetchAccountEmail,
  authorizeParams: () => ({ token_access_type: 'offline' }),
  renewError: () => currentMessages().driveErrors.refreshFailed(providerLabel('dropbox')),
};
