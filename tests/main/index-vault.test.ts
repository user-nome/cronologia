import os from 'os';
import path from 'path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { VaultResult, VaultStatus } from '@zero/types';
import { IDLE_LOCK_MS, readContainer, vaultSession, writeContainer } from '@zero/main/vault';
import { MASTER, PHRASE, PIN, VAULT_INPUT } from '../helpers/vault.ts';
import { resetSandbox } from '../helpers/sandbox.ts';
import { BrowserWindow, app, ipcMain } from '../mocks/electron.ts';
import type { IpcHandler } from '../mocks/electron.ts';

function handler(channel: string): IpcHandler {
  const call = ipcMain.handle.mock.calls.find((entry) => entry[0] === channel);
  if (call === undefined) throw new Error(`Handler IPC ausente: ${channel}`);
  return call[1];
}

const APP_EVENT = { senderFrame: { url: 'cronologia://app/index.html' } };

function invoke(channel: string, ...args: unknown[]): unknown {
  return handler(channel)(APP_EVENT, ...args);
}

function invokeAsync<T>(channel: string, ...args: unknown[]): Promise<T> {
  return invoke(channel, ...args) as Promise<T>;
}

/** Cofre criado e aberto, como a tela encontra depois da criação. */
const ABERTO: VaultStatus = {
  exists: true,
  unlocked: true,
  attempts: 0,
  lockUntil: 0,
  lockRemainingMs: 0,
  hasRecovery: true,
};

/** Cofre criado e fechado, que é o estado depois de `vault:lock`. */
const FECHADO: VaultStatus = { ...ABERTO, unlocked: false };

beforeAll(async () => {
  resetSandbox();
  app.getPath.mockReturnValue(path.join(os.tmpdir(), 'cronologia-tests-vault'));
  await import('@zero/main/index');
  await vi.waitFor(() => expect(ipcMain.handle).toHaveBeenCalled());
});

describe('canais do cofre (vault:*)', () => {
  it('vault:status começa sem cofre', () => {
    expect(invoke('vault:status')).toEqual({
      exists: false,
      unlocked: false,
      attempts: 0,
      lockUntil: 0,
      lockRemainingMs: 0,
      hasRecovery: false,
    });
  });

  it('vault:create recusa credencial malformada antes do Argon2id', async () => {
    const result = await invokeAsync<VaultResult>('vault:create', {
      ...VAULT_INPUT,
      masterPassword: 'curta',
    });
    expect(result).toEqual({ ok: false, code: 'vaultInvalidMaster', retryInMs: 0 });
    expect(invoke('vault:status')).toMatchObject({ exists: false });
  });

  it('vault:create com as três credenciais cria e desbloqueia o cofre', async () => {
    const result = await invokeAsync<VaultResult>('vault:create', VAULT_INPUT);
    expect(result).toEqual({ ok: true, status: ABERTO });
  });

  it('vault:lock fecha a sessão e vault:status espelha', () => {
    const status = invoke('vault:lock') as VaultStatus;
    expect(status).toEqual(FECHADO);
    expect(vaultSession.isUnlocked()).toBe(false);
  });

  it('vault:unlock com o PIN do dia a dia reabre e relê o estado do drive', async () => {
    const result = await invokeAsync<VaultResult>('vault:unlock', {
      credential: PIN,
      kind: 'pin',
    });
    expect(result).toEqual({ ok: true, status: ABERTO });
  });

  it('vault:unlock com a senha mestra reabre pelo mesmo caminho', async () => {
    invoke('vault:lock');
    const result = await invokeAsync<VaultResult>('vault:unlock', {
      credential: MASTER,
      kind: 'master',
    });
    expect(result).toEqual({ ok: true, status: ABERTO });
  });

  it('PIN errado soma tentativa e devolve a espera de 10 s', async () => {
    invoke('vault:lock');
    const result = await invokeAsync<VaultResult>('vault:unlock', {
      credential: '00000000',
      kind: 'pin',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('vaultWrongPin');
    expect(result.retryInMs).toBeGreaterThan(0);
    expect(result.retryInMs).toBeLessThanOrEqual(10_000);
    expect(invoke('vault:status')).toMatchObject({ attempts: 1, unlocked: false });
  });

  it('durante a espera o desbloqueio é recusado sem rodar o Argon2id', async () => {
    const result = await invokeAsync<VaultResult>('vault:unlock', {
      credential: PIN,
      kind: 'pin',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('vaultLockedOut');
    expect(result.retryInMs).toBeGreaterThan(0);
    expect(result.retryInMs).toBeLessThanOrEqual(10_000);
  });

  /**
   * Tira a trava do disco. A espera da rampa mora no container e a sessão é
   * zerada a cada abertura, então um teste que precisa do cofre aberto no meio da
   * jornada só tem um caminho honesto: esperar a rampa passar ou zerar o relógio
   * dela. Aqui é o relógio.
   */
  function releaseLock(): void {
    const container = readContainer();
    if (container === null) throw new Error('cofre ausente');
    writeContainer({ ...container, lockUntil: 0 });
  }

  it('trocar o PIN mantém a sessão aberta e o cofre usável', async () => {
    releaseLock();
    await invokeAsync<VaultResult>('vault:unlock', { credential: PIN, kind: 'pin' });

    const novo = '73851042';
    const result = await invokeAsync<VaultResult>('vault:change-pin', {
      currentPin: PIN,
      newPin: novo,
    });
    expect(result.ok).toBe(true);
    expect(vaultSession.isUnlocked()).toBe(true);

    // Volta o PIN original para o próximo teste continuar com as constantes.
    expect(
      (await invokeAsync<VaultResult>('vault:change-pin', { currentPin: novo, newPin: PIN })).ok,
    ).toBe(true);
  });

  it('frase de recuperação não é login: ela redefine o PIN e abre', async () => {
    releaseLock();
    invoke('vault:lock');
    const novo = '73851042';
    const result = await invokeAsync<VaultResult>('vault:reset-pin', {
      phrase: PHRASE,
      newPin: novo,
    });
    expect(result).toEqual({ ok: true, status: ABERTO });

    expect(
      (await invokeAsync<VaultResult>('vault:change-pin', { currentPin: novo, newPin: PIN })).ok,
    ).toBe(true);
  });
});

describe('guarda de origem dos canais de cofre', () => {
  it('recusa chamada de frame fora da página do app', async () => {
    const evil = { senderFrame: { url: 'https://evil.example/pagina' } };
    expect(() => handler('vault:status')(evil)).toThrow('IPC bloqueado');
    expect(() => handler('vault:lock')(evil)).toThrow('IPC bloqueado');
    for (const channel of [
      'vault:create',
      'vault:unlock',
      'vault:reset-pin',
      'vault:change-master',
      'vault:change-pin',
    ]) {
      await expect(handler(channel)(evil, VAULT_INPUT)).rejects.toThrow('IPC bloqueado');
    }
  });
});

describe('auto-lock do cofre', () => {
  it('derruba a sessão após a ociosidade e avisa a janela que foi o auto-lock', () => {
    const win = BrowserWindow.instances[0];
    if (win === undefined) throw new Error('Janela não criada.');
    win.webContents.send.mockClear();

    vi.useFakeTimers();
    try {
      vaultSession.adopt(Buffer.alloc(32, 7));
      expect(vaultSession.isUnlocked()).toBe(true);
      vi.advanceTimersByTime(IDLE_LOCK_MS);
      expect(vaultSession.isUnlocked()).toBe(false);
      expect(win.webContents.send).toHaveBeenCalledWith('vault:locked', true);
    } finally {
      vi.useRealTimers();
      vaultSession.wipe();
    }
  });

  it('o bloqueio manual também avisa a janela, marcado como não automático', () => {
    // O acervo é cifrado com a chave do cofre: fechar o cofre tem de ter o mesmo
    // efeito na tela que o auto-lock. Sem o aviso, as obras ficavam descifradas
    // na grade com o disco já sem chave (achado pelo E2E).
    const win = BrowserWindow.instances[0];
    if (win === undefined) throw new Error('Janela não criada.');
    vaultSession.adopt(Buffer.alloc(32, 7));
    win.webContents.send.mockClear();

    expect(invoke('vault:lock')).toMatchObject({ unlocked: false });
    expect(win.webContents.send).toHaveBeenCalledWith('vault:locked', false);
  });
});
