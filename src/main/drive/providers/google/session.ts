import type { AuthorizeResult, TokenGrant } from '@zero/types';
import type { Tokens } from '@zero/main/drive/state';
import { providerLabel } from '@zero/main/drive/constants';
import { currentMessages } from '@zero/main/i18n';
import {
  exchangeAuthorizationCode,
  missingScopes,
  renewAccessToken,
  requestAuthorizationCode,
} from '@zero/main/drive/oauth-flow';
import { googleFlow } from '@zero/main/drive/providers/google/oauth';
import { googleClientId } from '@zero/main/drive/providers/google/credentials';
import {
  GOOGLE_SCOPE_VERSION,
  GOOGLE_TOKEN_MARGIN_MS,
} from '@zero/main/drive/providers/google/constants';
import { emit, persistState, setError, state, toMessage } from '@zero/main/drive/state';
import { vaultUnlocked } from '@zero/main/vault/secrets';

/**
 * A sessão do Google Drive: o mesmo desenho do `drive/oauth.ts` do Dropbox,
 * com o PKCE e o loopback vindos de `oauth-flow.ts`.
 *
 * A diferença estrutural é o alvo da sessão. O Dropbox tem `driveClientId`
 * guardado no cofre como override (chave do app é pública, mas o override
 * existe para quem registra o seu); o Google **não** tem, porque a credencial
 * entra no binário na publicação (ver `credentials.ts`). Assim este módulo lê
 * `state.tokens`, que só faz sentido quando o Google Drive é o provedor
 * escolhido: `authorize()` recusa fora desse caso, e `googleAccessToken()` usa o
 * mesmo objeto que `drive/state.ts` guarda para o provedor ativo.
 */

/** Converte a resposta da nuvem na forma que o app guarda. */
function toTokens(raw: TokenGrant): Tokens {
  return {
    accessToken: raw.accessToken,
    refreshToken: raw.refreshToken,
    expiresAt: Date.now() + raw.expiresIn * 1000,
    accountEmail: null,
    lastSync: null,
    scopeVersion: GOOGLE_SCOPE_VERSION,
    grantedScopes: raw.grantedScopes,
  };
}

/**
 * Conecta a conta do Google Drive.
 *
 * Recusa fora do lugar certo duas vezes: sem credencial no build não há o que
 * autorizar, e sem cofre aberto a sessão não tem onde ser gravada (ela vive no
 * cofre, então uma conexão só em memória voltaria como "desconectada" na próxima
 * abertura, que é pior do que não conectar).
 */
export async function googleAuthorize(): Promise<AuthorizeResult> {
  const clientId = googleClientId();
  if (clientId === '') {
    const error = currentMessages().providers.googleNoCredentials;
    setError(error);
    return { ok: false, error };
  }
  if (!vaultUnlocked()) {
    const error = currentMessages().vault.errors.vaultLocked;
    setError(error);
    return { ok: false, error };
  }
  try {
    const grant = await requestAuthorizationCode(googleFlow, clientId);
    const raw = await exchangeAuthorizationCode(googleFlow, grant);
    const tokens = toTokens(raw);
    const missing = missingScopes(googleFlow, tokens.grantedScopes);
    if (missing.length > 0) {
      const error = currentMessages().driveErrors.missingScopesList(
        providerLabel('google-drive'),
        missing.join(', '),
      );
      setError(error);
      return { ok: false, error };
    }
    tokens.accountEmail = await googleFlow.accountEmail(tokens.accessToken);
    const anterior = state.tokens;
    state.tokens = tokens;
    try {
      persistState();
    } catch (error) {
      // Cofre trancou no meio do fluxo: a sessão não fica "conectada" sem ter
      // sido gravada (voltaria como desconectada na próxima abertura).
      state.tokens = anterior;
      throw error;
    }
    setError(null);
    emit();
    return { ok: true };
  } catch (error) {
    const message = toMessage(error);
    setError(message);
    return { ok: false, error: message };
  }
}

/**
 * Renova o access token do Google Drive, à força.
 *
 * Separada do `googleAccessToken` porque o REST precisa das duas coisas: renovar
 * quando o token está a menos de um minuto de vencer, e renovar quando a API
 * respondeu 401 (token revogado no meio da sessão).
 */
export async function googleRenewAccessToken(): Promise<string> {
  const m = currentMessages();
  const clientId = googleClientId();
  if (clientId === '') throw new Error(m.providers.googleNoCredentials);
  const refreshToken = state.tokens?.refreshToken;
  if (refreshToken === undefined || refreshToken === '') {
    throw new Error(m.driveErrors.sessionExpired(providerLabel('google-drive')));
  }
  const raw = await renewAccessToken(googleFlow, clientId, refreshToken);
  const tokens = state.tokens;
  if (tokens === null) throw new Error(m.driveErrors.noAccount(providerLabel('google-drive')));
  tokens.accessToken = raw.accessToken;
  tokens.expiresAt = Date.now() + raw.expiresIn * 1000;
  // O Google devolve o `refresh_token` na renovação, mas nem todo provedor
  // devolve: preserva o anterior quando vier ausente, senão a próxima renovação
  // não teria com o que tentar.
  if (raw.refreshToken !== undefined && raw.refreshToken !== '') {
    tokens.refreshToken = raw.refreshToken;
  }
  persistState();
  return tokens.accessToken;
}

/**
 * Access token válido agora: renova se estiver a menos de um minuto de vencer.
 *
 * O desconto de 60 s é o mesmo do Dropbox: uma requisição que sai com o token
 * ainda válido mas vence no meio do caminho vira 401, e o REST só descobre
 * depois de gastar a chamada.
 */
export async function googleAccessToken(): Promise<string> {
  const tokens = state.tokens;
  if (tokens === null)
    throw new Error(currentMessages().driveErrors.noAccount(providerLabel('google-drive')));
  if (Date.now() > tokens.expiresAt - GOOGLE_TOKEN_MARGIN_MS) return googleRenewAccessToken();
  return tokens.accessToken;
}
