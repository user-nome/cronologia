import fs from 'fs';
import http from 'http';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveStatus } from '@zero/types';
import { authorize, disconnect, getStatus, initDrive, onStatus } from '@zero/main/drive';
import { DROPBOX_SCOPE_VERSION } from '@zero/main/drive/providers/dropbox/constants';
import { currentMessages } from '@zero/main/i18n';
import { setError, toMessage } from '@zero/main/drive/state';
import { saveSettings } from '@zero/main/settings';
import { lockVault, setSecret, unlockVault } from '@zero/main/vault';
import { VaultError } from '@zero/main/vault/errors';
import { VAULT_SECRET } from '@zero/main/vault/secrets';
import { shell } from '../mocks/electron.ts';
import { APP_KEY, connect, json, resetDrive, stubFetch, tokensPath } from '../helpers/drive.ts';
import { MASTER } from '../helpers/vault.ts';

describe('estado do Dropbox', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    vi.stubEnv('DROPBOX_APP_KEY', '');
    await resetDrive();
  });

  it('inicia desconectado e sem erros', () => {
    const status = getStatus();
    expect(status.connected).toBe(false);
    expect(status.syncing).toBe(false);
    expect(status.lastSync).toBeNull();
    expect(status.lastError).toBeNull();
    expect(status.accountEmail).toBeNull();
    disconnect();
    expect(getStatus().connected).toBe(false);
  });

  it('onStatus recebe o status a cada transição', async () => {
    const listener = vi.fn<(status: DriveStatus) => void>();
    onStatus(listener);
    await connect();
    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls.at(-1)?.[0].connected).toBe(true);
    disconnect();
    expect(listener.mock.calls.at(-1)?.[0].connected).toBe(false);
  });

  it('initDrive recarrega os tokens gravados no cofre', async () => {
    await connect();
    expect(getStatus().connected).toBe(true);
    // O cofre é a única fonte: nenhum arquivo de token fora dele.
    expect(fs.existsSync(tokensPath())).toBe(false);

    lockVault();
    initDrive();
    expect(getStatus().connected).toBe(false);

    await unlockVault({ credential: MASTER, kind: 'master' });
    initDrive();
    const status = getStatus();
    expect(status.connected).toBe(true);
    expect(status.accountEmail).toBe('leitor@example.com');
    expect(status.lastError).toBeNull();
  });

  it('initDrive falha fechada com token ilegível no cofre', () => {
    setSecret(VAULT_SECRET.dropboxTokens, '{ corrompido');
    initDrive();
    expect(getStatus().connected).toBe(false);
  });

  it('initDrive ignora arquivo de token legado deixado no disco', () => {
    fs.mkdirSync(path.dirname(tokensPath()), { recursive: true });
    fs.writeFileSync(
      tokensPath(),
      JSON.stringify({
        accessToken: 'token-antigo',
        expiresAt: Date.now() + 3_600_000,
        accountEmail: 'outra@x.com',
        lastSync: '2026-01-05T00:00:00.000Z',
        scopeVersion: DROPBOX_SCOPE_VERSION,
      }),
      'utf-8',
    );
    initDrive();
    expect(getStatus().connected).toBe(false);
  });
});

describe('authorize', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    await resetDrive();
  });

  it('recusa sem abrir o navegador quando não há chave do aplicativo', async () => {
    vi.stubEnv('DROPBOX_APP_KEY', '');
    saveSettings({
      driveClientId: '',
      drivePassphrase: 'frase',
      backupProvider: 'dropbox',
      language: 'pt-BR',
    });
    const result = await authorize();
    expect(result.ok).toBe(false);
    expect(result.error).toBe(currentMessages().driveErrors.configureAppKey);
    expect(getStatus().lastError).toBe(currentMessages().driveErrors.configureAppKey);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('abre o OAuth com PKCE, offline e redirect fixo', async () => {
    saveSettings({
      driveClientId: APP_KEY,
      drivePassphrase: 'frase',
      backupProvider: 'dropbox',
      language: 'pt-BR',
    });
    shell.openExternal.mockImplementationOnce((url: string): Promise<void> => {
      const params = new URL(url).searchParams;
      const redirect = params.get('redirect_uri');
      if (redirect !== null) {
        const request = http.get(
          `${redirect}?error=access_denied&state=${params.get('state') ?? ''}`,
        );
        request.on('error', () => undefined);
      }
      return Promise.resolve();
    });

    const result = await authorize();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('access_denied');
    expect(getStatus().lastError).toBe('access_denied');
    expect(shell.openExternal).toHaveBeenCalledTimes(1);
    const opened = shell.openExternal.mock.calls[0]?.[0] ?? '';
    const params = new URL(opened).searchParams;
    expect(params.get('client_id')).toBe(APP_KEY);
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).not.toBeNull();
    expect(params.get('token_access_type')).toBe('offline');
    // Porta fixa quando livre; efêmera sob contenção (suíte em paralelo).
    expect(params.get('redirect_uri')).toMatch(/^http:\/\/localhost:\d+\/callback$/);
    expect(opened).not.toContain('client_secret');
  });

  it('conclui o OAuth pelo callback local e grava o e-mail da conta', async () => {
    await connect();
    const status = getStatus();
    expect(status.connected).toBe(true);
    expect(status.accountEmail).toBe('leitor@example.com');
    expect(status.lastError).toBeNull();
    expect(shell.openExternal).toHaveBeenCalledTimes(1);
  });

  it('propaga o erro quando o usuário recusa a autorização', async () => {
    saveSettings({
      driveClientId: APP_KEY,
      drivePassphrase: '',
      backupProvider: 'dropbox',
      language: 'pt-BR',
    });
    shell.openExternal.mockImplementationOnce((url: string): Promise<void> => {
      const params = new URL(url).searchParams;
      const redirect = params.get('redirect_uri');
      if (redirect !== null) {
        const request = http.get(
          `${redirect}?error=access_denied&state=${params.get('state') ?? ''}`,
        );
        request.on('error', () => undefined);
      }
      return Promise.resolve();
    });
    const result = await authorize();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('access_denied');
    expect(getStatus().lastError).toBe('access_denied');
  });

  it('recusa a concessão sem todos os escopos', async () => {
    saveSettings({
      driveClientId: APP_KEY,
      drivePassphrase: '',
      backupProvider: 'dropbox',
      language: 'pt-BR',
    });
    shell.openExternal.mockImplementationOnce((url: string): Promise<void> => {
      const params = new URL(url).searchParams;
      const redirect = params.get('redirect_uri');
      if (redirect !== null) {
        const request = http.get(
          `${redirect}?code=codigo-valido&state=${params.get('state') ?? ''}`,
        );
        request.on('error', () => undefined);
      }
      return Promise.resolve();
    });
    stubFetch((call) => {
      if (call.url.endsWith('/oauth2/token')) {
        return json({
          access_token: 'token-parcial',
          refresh_token: 'refresh-parcial',
          expires_in: 3600,
          scope: 'account_info.read files.content.read',
        });
      }
      return json({ error_summary: 'inesperado' }, 500);
    });
    const result = await authorize();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Faltam permissões no app Dropbox');
    expect(result.error).toContain('files.metadata.read');
    expect(getStatus().connected).toBe(false);
  });

  it('reporta falha na troca do código por tokens', async () => {
    saveSettings({
      driveClientId: APP_KEY,
      drivePassphrase: '',
      backupProvider: 'dropbox',
      language: 'pt-BR',
    });
    shell.openExternal.mockImplementationOnce((url: string): Promise<void> => {
      const params = new URL(url).searchParams;
      const redirect = params.get('redirect_uri');
      if (redirect !== null) {
        const request = http.get(
          `${redirect}?code=codigo-valido&state=${params.get('state') ?? ''}`,
        );
        request.on('error', () => undefined);
      }
      return Promise.resolve();
    });
    stubFetch(() => json({ error: 'invalid_grant' }, 400));
    const result = await authorize();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Falha ao obter tokens (400).');
    expect(getStatus().lastError).toBe('Falha ao obter tokens (400).');
  });
});

// A sessão persistida é a única fonte do estado do Dropbox, então o que está
// gravado no cofre passa por uma validação de forma antes de virar "conectado".
describe('tokens persistidos no cofre', () => {
  beforeEach(async () => {
    await resetDrive();
    setError(null);
  });

  it('sessão com versão de escopo antiga exige reconexão em vez de valer', () => {
    setSecret(
      VAULT_SECRET.dropboxTokens,
      JSON.stringify({
        accessToken: 'token-antigo',
        expiresAt: Date.now() + 3_600_000,
        accountEmail: 'leitor@example.com',
        lastSync: null,
        scopeVersion: DROPBOX_SCOPE_VERSION - 1,
      }),
    );

    initDrive();

    const status = getStatus();
    expect(status.connected).toBe(false);
    expect(status.lastError).toBe('Permissões do Dropbox atualizadas. Reconecte a conta Dropbox.');
  });

  it('ignora token gravado que não é objeto', () => {
    setSecret(VAULT_SECRET.dropboxTokens, '"apenas um texto"');

    initDrive();

    expect(getStatus().connected).toBe(false);
    expect(getStatus().lastError).toBeNull();
  });

  it('ignora token gravado sem accessToken ou sem scopeVersion', () => {
    setSecret(VAULT_SECRET.dropboxTokens, JSON.stringify({ expiresAt: 1, lastSync: null }));

    initDrive();

    expect(getStatus().connected).toBe(false);
    expect(getStatus().lastError).toBeNull();
  });

  it('toMessage traduz o código do cofre e serializa o que não é Error', () => {
    expect(toMessage(new VaultError('vaultLocked'))).toBe('O cofre está fechado.');
    expect(toMessage('falha avulsa')).toBe('falha avulsa');
    expect(toMessage(new Error('erro comum'))).toBe('erro comum');
  });
});

afterEach(() => {
  onStatus(() => undefined);
});
