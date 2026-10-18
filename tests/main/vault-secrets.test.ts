import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DROPBOX_SCOPE_VERSION } from '@zero/main/drive/providers/dropbox/constants';
import { dropboxAppKey } from '@zero/main/drive/providers/dropbox/credentials';
import { appKey, loadState, persistState, state } from '@zero/main/drive/state';
import { loadSettings, saveSettings } from '@zero/main/settings';
import {
  createVault,
  destroyVault,
  getSecret,
  lockVault,
  setSecret,
  unlockVault,
  vaultExists,
  vaultPath,
} from '@zero/main/vault';
import {
  VAULT_SECRET,
  clearSecret,
  readJsonSecret,
  vaultUnlocked,
  writeJsonSecret,
} from '@zero/main/vault/secrets';
import { isVaultError, type VaultError } from '@zero/main/vault/errors';
import { resetSandbox, sandboxPath } from '../helpers/sandbox.ts';
import { MASTER, openTestVault, VAULT_INPUT } from '../helpers/vault.ts';

const TOKENS = {
  accessToken: 'token-abc',
  refreshToken: 'refresh-abc',
  expiresAt: 1_800_000_000_000,
  accountEmail: 'user@example.com',
  lastSync: null,
  scopeVersion: DROPBOX_SCOPE_VERSION,
};

function configFile(name: string): string {
  return path.join(sandboxPath('XDG_CONFIG_HOME'), 'cronologia', name);
}

function writeJson(name: string, data: object): void {
  fs.mkdirSync(path.dirname(configFile(name)), { recursive: true });
  fs.writeFileSync(configFile(name), JSON.stringify(data), { mode: 0o600 });
}

function diskRaw(name: string): string | null {
  const file = configFile(name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
}

/** Pega o `VaultError` lançado de forma síncrona (falha fechada). */
function catchError(run: () => unknown): VaultError {
  try {
    run();
  } catch (error) {
    if (isVaultError(error)) return error;
    throw error;
  }
  throw new Error('esperava um VaultError');
}

/** Estraga o payload do cofre mantendo a sessão desbloqueada. */
function tamperVault(): void {
  const buffer = fs.readFileSync(vaultPath());
  const last = buffer.length - 1;
  buffer[last] = (buffer[last] ?? 0) ^ 0xff;
  fs.writeFileSync(vaultPath(), buffer, { mode: 0o600 });
}

/** Deixa um `settings.json` antigo, com segredo em claro, no disco. */
function writeLegacySettings(): void {
  writeJson('settings.json', {
    driveClientId: 'app-key-legada',
    drivePassphrase: 'frase-legada',
    backupProvider: 'dropbox',
    language: 'pt-BR',
  });
}

/**
 * Guard de teste, no formato que `readJsonSecret` espera: a validação é do
 * consumidor, não do módulo. Serve para provar a decisão do ternário da linha 31
 * (guard aceita devolve o objeto, guard recusa devolve `null`) sem depender do
 * guard de `Tokens`, que é privado de `drive/state.ts`.
 */
function isMarcador(value: unknown): value is { id: string; rotulo: string } {
  if (typeof value !== 'object' || value === null) return false;
  if (!('id' in value) || !('rotulo' in value)) return false;
  return typeof value.id === 'string' && typeof value.rotulo === 'string';
}

const MARCADOR = { id: 'a', rotulo: 'primeiro' };

describe('cofre é a única fonte de segredos e tokens', () => {
  beforeEach(() => {
    resetSandbox();
    vi.stubEnv('DROPBOX_APP_KEY', '');
    destroyVault();
    state.tokens = null;
    state.lastError = null;
    state.syncing = false;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('sem cofre', () => {
    it('loadSettings lê só o idioma e não cria cofre', () => {
      writeLegacySettings();
      expect(loadSettings()).toEqual({
        driveClientId: '',
        drivePassphrase: '',
        backupProvider: 'dropbox',
        language: 'pt-BR',
      });
      expect(vaultExists()).toBe(false);
    });

    it('saveSettings recusa gravar sem cofre', () => {
      const error = catchError(() =>
        saveSettings({
          driveClientId: 'id',
          drivePassphrase: 'frase',
          backupProvider: 'dropbox',
          language: 'en',
        }),
      );
      expect(error.code).toBe('vaultLocked');
      expect(vaultExists()).toBe(false);
      expect(fs.existsSync(configFile('settings.json'))).toBe(false);
    });

    it('tokens do dropbox-tokens.json legado não voltam do disco', () => {
      writeJson('dropbox-tokens.json', TOKENS);
      loadState();
      expect(state.tokens).toBeNull();
      expect(state.lastError).toBeNull();
    });
  });

  describe('com cofre aberto', () => {
    it('saveSettings grava segredos no cofre e só idioma e provedor no disco', async () => {
      await openTestVault();
      const saved = saveSettings({
        driveClientId: '  app-key-nova  ',
        drivePassphrase: 'frase-nova',
        backupProvider: 'dropbox',
        language: 'ko',
      });
      expect(saved.driveClientId).toBe('app-key-nova');
      expect(getSecret(VAULT_SECRET.drivePassphrase)).toBe('frase-nova');
      expect(getSecret(VAULT_SECRET.driveClientId)).toBe('app-key-nova');
      // O disco guarda idioma e provedor; os segredos é que não saem de lá.
      expect(JSON.parse(diskRaw('settings.json') ?? '')).toEqual({
        language: 'ko',
        backupProvider: 'dropbox',
      });
      expect(diskRaw('settings.json')).not.toContain('frase-nova');
      expect(fs.statSync(configFile('settings.json')).mode & 0o777).toBe(0o600);
      expect(loadSettings()).toMatchObject({
        driveClientId: 'app-key-nova',
        drivePassphrase: 'frase-nova',
        backupProvider: 'dropbox',
        language: 'ko',
      });
    });

    it('um settings.json legado é ignorado: o que vale é o cofre', async () => {
      writeLegacySettings();
      await openTestVault();
      expect(loadSettings().drivePassphrase).toBe('');
      expect(getSecret(VAULT_SECRET.drivePassphrase)).toBeNull();

      // O primeiro salvamento sobrescreve o arquivo, sem segredo em claro.
      saveSettings({
        driveClientId: '',
        drivePassphrase: '',
        backupProvider: 'dropbox',
        language: 'pt-BR',
      });
      expect(diskRaw('settings.json')).not.toContain('frase-legada');
      expect(diskRaw('settings.json')).not.toContain('app-key-legada');
    });

    it('persistState grava no cofre e não cria arquivo de token', async () => {
      await openTestVault();
      state.tokens = { ...TOKENS, accessToken: 'token-novo' };
      persistState();
      expect(fs.existsSync(configFile('dropbox-tokens.json'))).toBe(false);
      expect(getSecret(VAULT_SECRET.dropboxTokens)).toContain('token-novo');

      state.tokens = null;
      loadState();
      expect(state.tokens).toMatchObject({ accessToken: 'token-novo' });
      expect(state.lastError).toBeNull();
    });

    it('persistState sem tokens apaga a sessão do cofre (desconexão)', async () => {
      await openTestVault();
      setSecret(VAULT_SECRET.dropboxTokens, JSON.stringify(TOKENS));
      state.tokens = null;
      persistState();
      expect(getSecret(VAULT_SECRET.dropboxTokens)).toBeNull();
      expect(fs.existsSync(configFile('dropbox-tokens.json'))).toBe(false);
    });

    it('appKey usa a App key alternativa guardada no cofre', async () => {
      await openTestVault();
      expect(appKey()).toBe('');
      vi.stubEnv('DROPBOX_APP_KEY', 'chave-do-build');
      expect(dropboxAppKey()).toBe('chave-do-build');
      expect(appKey()).toBe('chave-do-build');
      setSecret(VAULT_SECRET.driveClientId, 'app-key-do-cofre');
      expect(appKey()).toBe('app-key-do-cofre');
    });
  });

  describe('cofre fechado', () => {
    it('loadSettings devolve segredos vazios e mantém o idioma', async () => {
      await openTestVault();
      saveSettings({
        driveClientId: 'id',
        drivePassphrase: 'frase',
        backupProvider: 'dropbox',
        language: 'zh-CN',
      });
      lockVault();
      expect(loadSettings()).toEqual({
        driveClientId: '',
        drivePassphrase: '',
        backupProvider: 'dropbox',
        language: 'zh-CN',
      });
      expect(appKey()).toBe('');
    });

    it('saveSettings recusa gravar e não toca no disco', async () => {
      await openTestVault();
      saveSettings({
        driveClientId: 'id',
        drivePassphrase: 'frase',
        backupProvider: 'dropbox',
        language: 'pt-BR',
      });
      const antes = diskRaw('settings.json');
      lockVault();
      const error = catchError(() =>
        saveSettings({
          driveClientId: 'outra',
          drivePassphrase: 'outra',
          backupProvider: 'dropbox',
          language: 'en',
        }),
      );
      expect(error.code).toBe('vaultLocked');
      expect(diskRaw('settings.json')).toBe(antes);
      expect(loadSettings().drivePassphrase).toBe('');
    });

    it('tokens saem da memória: nem o arquivo legado no disco vale', async () => {
      writeJson('dropbox-tokens.json', TOKENS);
      await openTestVault();
      lockVault();
      loadState();
      expect(state.tokens).toBeNull();
    });

    it('persistState com sessão em memória lança e não escreve no disco', async () => {
      await openTestVault();
      lockVault();
      state.tokens = { ...TOKENS, accessToken: 'token-fechado' };
      expect(() => persistState()).toThrow();
      expect(diskRaw('dropbox-tokens.json')).toBeNull();
      expect(() => getSecret(VAULT_SECRET.dropboxTokens)).toThrow();
    });
  });

  describe('cofre adulterado', () => {
    it('loadSettings falha fechada e não zera o settings.json', async () => {
      writeLegacySettings();
      await openTestVault();
      tamperVault();
      expect(loadSettings()).toEqual({
        driveClientId: '',
        drivePassphrase: '',
        backupProvider: 'dropbox',
        language: 'pt-BR',
      });
      expect(diskRaw('settings.json')).toContain('frase-legada');
    });

    it('tokens não voltam e nenhum arquivo de token é criado', async () => {
      await openTestVault();
      tamperVault();
      state.tokens = { ...TOKENS, accessToken: 'token-que-sumiu' };
      loadState();
      expect(state.tokens).toBeNull();
      expect(diskRaw('dropbox-tokens.json')).toBeNull();
    });
  });

  describe('sessão e arquivo', () => {
    it('unlockVault devolve o que foi gravado antes de trancar', async () => {
      await createVault(VAULT_INPUT);
      saveSettings({
        driveClientId: 'id-x',
        drivePassphrase: 'frase-x',
        backupProvider: 'dropbox',
        language: 'ja',
      });
      lockVault();
      expect(() => getSecret(VAULT_SECRET.drivePassphrase)).toThrow();
      await unlockVault({ credential: MASTER, kind: 'master' });
      expect(getSecret(VAULT_SECRET.drivePassphrase)).toBe('frase-x');
      expect(loadSettings()).toMatchObject({ driveClientId: 'id-x', language: 'ja' });
    });
  });
});

/**
 * O módulo `secrets.ts` é a porta de entrada do cofre para o resto do main
 * (`settings.ts`, `drive/state.ts`, `drive/backup.ts`, `drive/oauth.ts`). A
 * regra que ele fixa é sempre a mesma: quem lê decide o formato, e qualquer
 * coisa fora do formato vira `null` em vez de exceção ou objeto pela metade.
 */
describe('secrets.ts: leitura e escrita de segredo JSON', () => {
  beforeEach(() => {
    resetSandbox();
    destroyVault();
    state.tokens = null;
    state.lastError = null;
    state.syncing = false;
  });

  it('writeJsonSecret grava JSON determinístico e o guard devolve o objeto', async () => {
    await openTestVault();
    writeJsonSecret(VAULT_SECRET.dropboxTokens, MARCADOR);
    // A serialização é determinística: o payload selado no cofre tem a mesma
    // forma de quando foi lido de novo.
    expect(getSecret(VAULT_SECRET.dropboxTokens)).toBe('{"id":"a","rotulo":"primeiro"}');
    expect(readJsonSecret(VAULT_SECRET.dropboxTokens, isMarcador)).toEqual(MARCADOR);
  });

  it('forma fora do guard vira null, sem exceção e sem devolver o que sobrou', async () => {
    await openTestVault();
    // O JSON é válido em todos os casos; o que não passa é o guard do
    // consumidor (campo faltando, tipo errado, valor que não é objeto).
    for (const raw of ['{"id":1,"rotulo":"primeiro"}', '"texto"', 'null', '[1,2]', '{"id":"a"}']) {
      setSecret(VAULT_SECRET.dropboxTokens, raw);
      expect(readJsonSecret(VAULT_SECRET.dropboxTokens, isMarcador)).toBeNull();
    }
  });

  it('conteúdo que não é JSON vira ausência, e não exceção', async () => {
    await openTestVault();
    setSecret(VAULT_SECRET.dropboxTokens, '{isso-nao-e-json');
    expect(readJsonSecret(VAULT_SECRET.dropboxTokens, isMarcador)).toBeNull();
  });

  it('segredo ausente é null sem tocar no cofre', async () => {
    await openTestVault();
    expect(readJsonSecret(VAULT_SECRET.dropboxTokens, isMarcador)).toBeNull();
    expect(getSecret(VAULT_SECRET.dropboxTokens)).toBeNull();
  });

  it('cofre fechado ou adulterado lê como ausente, sem derrubar o chamador', async () => {
    await openTestVault();
    writeJsonSecret(VAULT_SECRET.dropboxTokens, MARCADOR);

    // Sem chave na sessão, `getSecret` lança; a leitura engole e devolve `null`,
    // que é o que faz `loadSettings` devolver segredo vazio em vez de estourar.
    lockVault();
    expect(readJsonSecret(VAULT_SECRET.dropboxTokens, isMarcador)).toBeNull();

    await unlockVault({ credential: MASTER, kind: 'master' });
    expect(readJsonSecret(VAULT_SECRET.dropboxTokens, isMarcador)).toEqual(MARCADOR);

    // Container ilegível é a mesma resposta: nada de objeto pela metade.
    tamperVault();
    expect(readJsonSecret(VAULT_SECRET.dropboxTokens, isMarcador)).toBeNull();
  });

  it('clearSecret apaga de verdade com o cofre aberto', async () => {
    await openTestVault();
    writeJsonSecret(VAULT_SECRET.dropboxTokens, MARCADOR);
    clearSecret(VAULT_SECRET.dropboxTokens);
    expect(getSecret(VAULT_SECRET.dropboxTokens)).toBeNull();
    // Apagar um nome que nunca existiu não é erro.
    expect(() => clearSecret(VAULT_SECRET.drivePassphrase)).not.toThrow();
  });

  it('clearSecret com o cofre fechado é melhor esforço: não propaga e não apaga', async () => {
    await openTestVault();
    writeJsonSecret(VAULT_SECRET.dropboxTokens, MARCADOR);
    lockVault();

    // Sem chave não há como ressellar o container, então o segredo fica como
    // está; o erro é engolido para o chamador não ter que tratar isso.
    expect(() => clearSecret(VAULT_SECRET.dropboxTokens)).not.toThrow();

    await unlockVault({ credential: MASTER, kind: 'master' });
    expect(readJsonSecret(VAULT_SECRET.dropboxTokens, isMarcador)).toEqual(MARCADOR);
  });

  it('vaultUnlocked é a sessão, não o arquivo: ela liga e desliga com a chave', async () => {
    expect(vaultExists()).toBe(false);
    expect(vaultUnlocked()).toBe(false);

    await openTestVault();
    expect(vaultUnlocked()).toBe(true);

    // Trancar zera a chave em memória, mesmo com o cofre no disco.
    lockVault();
    expect(vaultExists()).toBe(true);
    expect(vaultUnlocked()).toBe(false);
  });

  it('token de forma errada não ressuscita a sessão do Dropbox', async () => {
    await openTestVault();
    // `accessToken` numérico: o JSON é válido, a forma não é a de `Tokens`, e o
    // erro de permissão também não é o caso (isso é para `scopeVersion`
    // diferente). A sessão simplesmente não volta.
    setSecret(VAULT_SECRET.dropboxTokens, JSON.stringify({ ...TOKENS, accessToken: 42 }));
    loadState();
    expect(state.tokens).toBeNull();
    expect(state.lastError).toBeNull();
  });
});
