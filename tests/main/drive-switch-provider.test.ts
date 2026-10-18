import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DROPBOX_SCOPE_VERSION } from '@zero/main/drive/providers/dropbox/constants';
import { currentProvider, getProvider } from '@zero/main/drive/provider';
import { GOOGLE_SCOPE_VERSION } from '@zero/main/drive/providers/google/constants';
import {
  getStatus,
  loadState,
  onStatus,
  persistState,
  state,
  switchProvider,
} from '@zero/main/drive/state';
import { currentMessages } from '@zero/main/i18n';
import { loadSettings, saveSettings } from '@zero/main/settings';
import {
  VAULT_SECRET,
  clearSecret,
  readJsonSecret,
  writeJsonSecret,
} from '@zero/main/vault/secrets';
import { resetSandbox } from '../helpers/sandbox.ts';
import { closeTestVault, openTestVault, PASSWORD } from '../helpers/vault.ts';

/**
 * Escolher o destino do backup é uma decisão de duas metades: a **preferência**
 * (que provedor, em `settings.json`) e a **sessão** (o token daquele destino, no
 * cofre). A regra que importa aqui é que trocar não desconecta o outro: quem
 * estava com o Dropbox conectado continua conectado ao voltar para ele.
 *
 * Os testes montam o estado direto (`state.tokens`), porque o OAuth de cada
 * provedor tem suíte própria (`drive-oauth.test.ts` e `google-drive.test.ts`).
 */

const DROPBOX = {
  accessToken: 'token-dropbox',
  refreshToken: 'refresh-dropbox',
  expiresAt: 0,
  accountEmail: 'leitor@example.com',
  lastSync: null,
  scopeVersion: DROPBOX_SCOPE_VERSION,
};

const GOOGLE = {
  accessToken: 'token-google',
  refreshToken: 'refresh-google',
  expiresAt: 0,
  accountEmail: 'leitor@gmail.com',
  lastSync: null,
  scopeVersion: GOOGLE_SCOPE_VERSION,
};

/**
 * Sessão ativa vista pelo teste.
 *
 * Passa por uma função porque o TypeScript acompanha o `state.tokens = null` e
 * só o larga quando alguma chamada invalida a militias; aqui o token volta por
 * `switchProvider`, que o compilador não pode saber que ele muda.
 */
function sessaoAtual(): typeof state.tokens {
  return state.tokens;
}

/**
 * Guard só para conferir "tem alguma coisa gravada": o valor não interessa, e o
 * `readJsonSecret` exige um type predicate, não um booleano.
 */
function isObjeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Entrada do cofre onde cada provedor guarda a sessão. */
const ENTRADA = {
  dropbox: VAULT_SECRET.dropboxTokens,
  'google-drive': VAULT_SECRET.googleDriveTokens,
} as const;

/** Grava a sessão de um destino direto no cofre, sem passar pelo OAuth. */
function gravarSessao(id: keyof typeof ENTRADA, tokens: typeof DROPBOX): void {
  writeJsonSecret(ENTRADA[id], tokens);
}

function cofreAberto(): void {
  // `expiresAt` no passado não importa aqui: o alvo é a troca, não a leitura.
  saveSettings({ ...loadSettings(), drivePassphrase: PASSWORD });
  state.provider = 'dropbox';
  state.tokens = DROPBOX;
  gravarSessao('dropbox', DROPBOX);
  gravarSessao('google-drive', GOOGLE);
}

describe('troca de provedor de backup', () => {
  beforeEach(async () => {
    resetSandbox();
    await openTestVault();
    cofreAberto();
  });

  afterEach(() => {
    state.provider = 'dropbox';
    state.tokens = null;
  });

  it('grava a escolha no settings.json, que sobrevive ao cofre fechado', () => {
    switchProvider('google-drive');

    expect(loadSettings().backupProvider).toBe('google-drive');
    expect(currentProvider().id).toBe('google-drive');
  });

  it('carrega a sessão do destino escolhido', () => {
    switchProvider('google-drive');

    expect(sessaoAtual()?.accessToken).toBe('token-google');
    expect(getStatus().connected).toBe(true);
    expect(getStatus().accountEmail).toBe('leitor@gmail.com');
  });

  it('não desconecta o outro destino: voltar recupera a sessão guardada', () => {
    switchProvider('google-drive');
    switchProvider('dropbox');

    expect(sessaoAtual()?.accessToken).toBe('token-dropbox');
    // As duas entradas continuam no cofre: trocar é consulta, não descarte.
    expect(readJsonSecret(VAULT_SECRET.googleDriveTokens, isObjeto)).not.toBeNull();
    expect(readJsonSecret(VAULT_SECRET.dropboxTokens, isObjeto)).not.toBeNull();
  });

  it('o destino sem sessão aparece como desconectado, não como erro', () => {
    switchProvider('google-drive');
    clearSecret(ENTRADA['google-drive']);

    loadState();

    expect(state.tokens).toBeNull();
    expect(getStatus().connected).toBe(false);
    // Sem sessão não há erro: "desconectado" é o estado, não uma falha.
    expect(getStatus().lastError).toBeNull();
  });

  it('trocar para o mesmo provedor não é erro nem reescreve nada', () => {
    state.provider = 'google-drive';
    state.tokens = GOOGLE;

    expect(switchProvider('google-drive')).toEqual({ ok: true });
    expect(sessaoAtual()?.accessToken).toBe('token-google');
  });

  it('cofre fechado não troca o destino e diz que falta o cofre', () => {
    closeTestVault();

    const result = switchProvider('google-drive');

    expect(result).toEqual({ ok: false, error: currentMessages().vault.errors.vaultLocked });
    expect(loadSettings().backupProvider).toBe('dropbox');
    expect(currentProvider().id).toBe('dropbox');
  });

  it('id fora do catálogo não vira destino (falha fechada, sem trocar)', () => {
    // O `as` reproduz o que a IPC receberia de um renderer adulterado; o tipo
    // é fechado de propósito, e a defesa real está em `saveSettings`, que
    // normaliza para o Dropbox antes de gravar.
    const forjado = 'onedrive' as unknown as 'google-drive';

    const result = switchProvider(forjado);

    expect(result).toEqual({ ok: false, error: currentMessages().settings.providerSwitchFailed });
    expect(loadSettings().backupProvider).toBe('dropbox');
  });

  it('avisa os ouvintes para a barra de status descrever o destino novo', () => {
    let chamada = 0;
    onStatus(() => {
      chamada += 1;
    });

    switchProvider('google-drive');

    // Uma por troca: sem emissão, a barra continuaria descrevendo a conta do
    // destino anterior como se ainda fosse a conectada.
    expect(chamada).toBe(1);
  });

  it('cada provedor valida a sessão contra a sua versão de escopo', () => {
    // Sessão gravada por uma versão antiga de escopo não volta: reconectar é
    // obrigatório, e o motivo vai para a barra de status.
    switchProvider('google-drive');
    state.tokens = null;
    gravarSessao('google-drive', { ...GOOGLE, scopeVersion: 0 });

    loadState();

    expect(state.tokens).toBeNull();
    expect(getStatus().lastError).toBe(
      currentMessages().driveErrors.permissionsUpdated('Google Drive'),
    );
  });

  it('desconectar grava a limpeza só na entrada do destino', () => {
    switchProvider('google-drive');
    state.tokens = null;
    // Caminho real do `disconnect()`: `persistState` apaga a entrada do
    // provedor ativo quando não há sessão.
    persistState();
    switchProvider('dropbox');

    expect(sessaoAtual()?.accessToken).toBe('token-dropbox');
    expect(readJsonSecret(VAULT_SECRET.dropboxTokens, isObjeto)).not.toBeNull();
    expect(readJsonSecret(VAULT_SECRET.googleDriveTokens, isObjeto)).toBeNull();
  });

  it('o provedor em uso é sempre o que o catálogo devolve para o id', () => {
    switchProvider('google-drive');

    expect(currentProvider()).toBe(getProvider('google-drive'));
  });
});
