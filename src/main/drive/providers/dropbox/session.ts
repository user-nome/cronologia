import type { Tokens } from '@zero/main/drive/state';
import { providerLabel } from '@zero/main/drive/constants';
import {
  DROPBOX_SCOPE_VERSION,
  DROPBOX_TOKEN_MARGIN_MS,
} from '@zero/main/drive/providers/dropbox/constants';
import {
  exchangeAuthorizationCode,
  missingScopes as flowMissingScopes,
  renewAccessToken,
  requestAuthorizationCode,
} from '@zero/main/drive/oauth-flow';
import { dropboxFlow } from '@zero/main/drive/providers/dropbox/oauth';
import { currentMessages } from '@zero/main/i18n';
import { appKey, emit, persistState, setError, state, toMessage } from '@zero/main/drive/state';
import { vaultUnlocked } from '@zero/main/vault/secrets';

/**
 * Sessão do Dropbox: o que entra em `state.tokens` e o que o REST consome.
 *
 * Espelha `providers/google/session.ts`. A diferença em relação ao Google é que
 * aqui a App key tem um override guardado no cofre (`appKey()` em `state.ts`,
 * que prefere `settings.driveClientId` ao valor embutido no build), porque o
 * Dropbox exige a URI de redirecionamento pré-cadastrada no App Console e cada
 * registro tem a sua: quem registra o seu app precisa poder apontar para ele.
 */

/** Escopos que faltaram na concessão ('' quando o provedor não informou). */
export function missingScopes(granted: string | undefined): string[] {
  return flowMissingScopes(dropboxFlow, granted);
}

export async function authorize(): Promise<{ ok: boolean; error?: string }> {
  const key = appKey();
  if (key === '') {
    const error = currentMessages().driveErrors.configureAppKey;
    setError(error);
    return { ok: false, error };
  }
  // A sessão só vale gravando no cofre: sem cofre aberto nem começa.
  if (!vaultUnlocked()) {
    const error = currentMessages().vault.errors.vaultLocked;
    setError(error);
    return { ok: false, error };
  }
  try {
    const grant = await requestAuthorizationCode(dropboxFlow, key);
    const raw = await exchangeAuthorizationCode(dropboxFlow, grant);
    const tokens: Tokens = {
      accessToken: raw.accessToken,
      refreshToken: raw.refreshToken,
      expiresAt: Date.now() + raw.expiresIn * 1000,
      accountEmail: null,
      lastSync: null,
      scopeVersion: DROPBOX_SCOPE_VERSION,
      grantedScopes: raw.grantedScopes,
    };
    const missing = missingScopes(tokens.grantedScopes);
    if (missing.length > 0) {
      const error = currentMessages().driveErrors.missingScopesList(
        providerLabel('dropbox'),
        missing.join(', '),
      );
      setError(error);
      return { ok: false, error };
    }
    tokens.accountEmail = await dropboxFlow.accountEmail(tokens.accessToken);
    const previous = state.tokens;
    state.tokens = tokens;
    try {
      persistState();
    } catch (error) {
      // cofre trancou no meio do fluxo: a sessão não fica "conectada" sem
      // ter sido gravada (voltaria como desconectada na próxima abertura).
      state.tokens = previous;
      throw error;
    }
    setError(null);
    emit();
    return { ok: true };
  } catch (err) {
    const message = toMessage(err);
    setError(message);
    return { ok: false, error: message };
  }
}

export async function refreshAccessToken(): Promise<string> {
  const m = currentMessages();
  const key = appKey();
  if (key === '') {
    throw new Error(m.driveErrors.configureAppKey);
  }
  const refreshToken = state.tokens?.refreshToken;
  if (refreshToken === undefined || refreshToken === '') {
    throw new Error(m.driveErrors.sessionExpired(providerLabel('dropbox')));
  }
  const raw = await renewAccessToken(dropboxFlow, key, refreshToken);
  const tokens = state.tokens;
  if (tokens === null) throw new Error(m.driveErrors.noAccount(providerLabel('dropbox')));
  tokens.accessToken = raw.accessToken;
  tokens.expiresAt = Date.now() + raw.expiresIn * 1000;
  persistState();
  return tokens.accessToken;
}

export async function accessToken(): Promise<string> {
  const tokens = state.tokens;
  if (tokens === null)
    throw new Error(currentMessages().driveErrors.noAccount(providerLabel('dropbox')));
  if (Date.now() > tokens.expiresAt - DROPBOX_TOKEN_MARGIN_MS) return refreshAccessToken();
  return tokens.accessToken;
}
