import os from 'os';
import path from 'path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { VaultResult } from '@zero/types';
import { app, ipcMain } from '../mocks/electron.ts';
import type { IpcHandler } from '../mocks/electron.ts';
import { PIN, VAULT_INPUT } from '../helpers/vault.ts';
import { openTestVault } from '../helpers/vault.ts';
import { destroyVault } from '@zero/main/vault';
import { resetSandbox } from '../helpers/sandbox.ts';

/**
 * Os canais do cofre vistos **pela ponte**, com o `main` de verdade registrado.
 *
 * A diferença para `index-vault.test.ts` é o que está em foco: aqui o que
 * importa é o envelope que o `ipcMain` entrega ao renderer (código de erro,
 * `retryInMs` e o status inteiro do cofre), não a regra do cofre em si.
 */

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

/** Abre pelo PIN do dia a dia, que é o caminho que a tela usa. */
const unlockInput = (credential: string = PIN): { credential: string; kind: 'pin' } => ({
  credential,
  kind: 'pin',
});

/** Status de um cofre recém-criado e aberto, que é o que a ponte devolve. */
const ABERTO = {
  exists: true,
  unlocked: true,
  attempts: 0,
  lockUntil: 0,
  lockRemainingMs: 0,
  hasRecovery: true,
};

beforeAll(async () => {
  resetSandbox();
  app.getPath.mockReturnValue(path.join(os.tmpdir(), 'cronologia-tests-vault-ponte'));
  await import('@zero/main/index');
  await vi.waitFor(() => expect(ipcMain.handle).toHaveBeenCalled());
});

describe('canais do cofre pela ponte', () => {
  it('vault:status começa sem cofre', () => {
    expect(invoke('vault:status')).toMatchObject({ exists: false, unlocked: false });
  });

  it('vault:create cria e devolve o status inteiro do cofre', async () => {
    destroyVault();
    const criado = await invokeAsync<VaultResult>('vault:create', VAULT_INPUT);
    expect(criado).toEqual({ ok: true, status: ABERTO });
    expect(invoke('vault:status')).toMatchObject({ exists: true, unlocked: true });
    expect(invoke('vault:lock')).toMatchObject({ exists: true, unlocked: false });
  });

  it('vault:create recusa credencial previsível antes de qualquer escrita', async () => {
    await openTestVault();
    destroyVault();

    const fraco = await invokeAsync<VaultResult>('vault:create', {
      ...VAULT_INPUT,
      pin: '11111111',
    });

    // Sem espera: PIN degenerado é recusa de formato, e segurar a pessoa numa
    // contagem regressiva por causa disso seria errado.
    expect(fraco).toEqual({ ok: false, code: 'vaultWeakPin', retryInMs: 0 });
    expect(invoke('vault:status')).toMatchObject({ exists: false });
  });

  it('vault:unlock conta a tentativa errada e arma a espera da rampa', async () => {
    await openTestVault();

    const errado = await invokeAsync<VaultResult>('vault:unlock', unlockInput('00000000'));
    expect(errado.ok).toBe(false);
    if (errado.ok) return;
    expect(errado.code).toBe('vaultWrongPin');
    expect(errado.retryInMs).toBeGreaterThan(0);
    expect(errado.retryInMs).toBeLessThanOrEqual(10_000);
    // A tentativa falhada é registrada no disco, mas derrubar uma sessão já
    // aberta seria jogar fora o acesso de quem digitou certo.
    expect(invoke('vault:status')).toMatchObject({ attempts: 1, unlocked: true });
    // E durante a espera nem o Argon2id roda.
    expect(await invokeAsync<VaultResult>('vault:unlock', unlockInput())).toMatchObject({
      ok: false,
      code: 'vaultLockedOut',
    });
  });

  it('vault:unlock com o PIN certo reabre e zera a trava', async () => {
    await openTestVault();
    expect(await invokeAsync<VaultResult>('vault:unlock', unlockInput())).toEqual({
      ok: true,
      status: ABERTO,
    });
  });
});
