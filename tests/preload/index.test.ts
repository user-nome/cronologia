import { beforeEach, describe, expect, it } from 'vitest';
import type { AppSettings, DriveStatus, ElectronApi } from '@zero/types';
import { makeWork } from '../helpers/fixtures.ts';
import { contextBridge, ipcRenderer } from '../mocks/electron.ts';
import '@zero/preload/index';

function exposedApi(): ElectronApi {
  const call = contextBridge.exposeInMainWorld.mock.calls[0];
  if (call === undefined) throw new Error('Nenhum API exposta via contextBridge.');
  if (call[0] !== 'api') throw new Error(`Chave inesperada: ${call[0]}`);
  return call[1] as ElectronApi;
}

describe('preload (contextBridge)', () => {
  beforeEach(() => {
    ipcRenderer.invoke.mockClear();
    ipcRenderer.on.mockClear();
    ipcRenderer.removeListener.mockClear();
  });

  it('expõe window.api uma única vez', () => {
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(contextBridge.exposeInMainWorld.mock.calls[0]?.[0]).toBe('api');
    expect(exposedApi().library).toBeDefined();
  });

  it('encaminha a biblioteca para os canais de IPC', async () => {
    const api = exposedApi();
    const work = makeWork();
    await api.library.get();
    await api.library.save(work);
    await api.library.remove('id-1');
    await api.library.reset();
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, 'library:get');
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, 'library:save', work);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(3, 'library:delete', 'id-1');
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(4, 'library:reset');
  });

  it('encaminha capa e configurações', async () => {
    const api = exposedApi();
    const settings: AppSettings = {
      driveClientId: 'id',
      drivePassphrase: 'frase',
      backupProvider: 'dropbox',
      language: 'pt-BR',
    };
    await api.pickCover();
    await api.settings.get();
    await api.settings.set(settings);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('cover:pick');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('settings:get');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('settings:set', settings);
  });

  it('encaminha as operações do Drive', async () => {
    const api = exposedApi();
    await api.drive.status();
    await api.drive.providers();
    await api.drive.auth();
    await api.drive.backup();
    await api.drive.restore('senha-de-teste');
    await api.drive.backupInfo();
    await api.drive.disconnect();
    await api.drive.purge();
    expect(ipcRenderer.invoke.mock.calls.map((call) => call[0])).toEqual([
      'drive:status',
      'drive:providers',
      'drive:auth',
      'drive:backup',
      'drive:restore',
      'drive:backup-info',
      'drive:disconnect',
      'drive:purge',
    ]);
  });

  it('assina e cancela a assinatura do status do Drive', () => {
    const api = exposedApi();
    const received: DriveStatus[] = [];
    const unsubscribe = api.drive.onStatus((status) => received.push(status));

    expect(ipcRenderer.on).toHaveBeenCalledTimes(1);
    const subscription = ipcRenderer.on.mock.calls[0];
    expect(subscription?.[0]).toBe('drive:status-changed');
    const listener = subscription?.[1];

    const status: DriveStatus = {
      connected: true,
      syncing: false,
      lastSync: null,
      lastError: null,
      accountEmail: 'leitor@x.com',
    };
    listener?.({}, status);
    expect(received).toEqual([status]);

    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('drive:status-changed', listener);
  });

  it('encaminha os canais do cofre', async () => {
    const api = exposedApi();
    const create = { masterPassword: 'a'.repeat(24), pin: '49201733', recoveryPhrase: 'frase' };
    const unlock = { credential: '49201733', kind: 'pin' as const };
    const reset = { phrase: 'frase', newPin: '73851042' };
    const master = { currentPassword: 'a'.repeat(24), newPassword: 'b'.repeat(24) };
    const pin = { currentPin: '49201733', newPin: '73851042' };

    await api.vault.status();
    await api.vault.create(create);
    await api.vault.unlock(unlock);
    await api.vault.resetPin(reset);
    await api.vault.changeMaster(master);
    await api.vault.changePin(pin);
    await api.vault.lock();
    await api.vault.destroy();
    await api.vault.touch();

    expect(ipcRenderer.invoke.mock.calls.map((call) => call[0])).toEqual([
      'vault:status',
      'vault:create',
      'vault:unlock',
      'vault:reset-pin',
      'vault:change-master',
      'vault:change-pin',
      'vault:lock',
      'vault:destroy',
      'vault:touch',
    ]);
    // O objeto inteiro atravessa o IPC, e não um campo solto: quem decide o que
    // vale é o main, e a forma do pedido é parte do contrato.
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('vault:create', create);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('vault:unlock', unlock);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('vault:reset-pin', reset);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('vault:change-master', master);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('vault:change-pin', pin);
  });

  it('repassa ao ouvinte se o bloqueio foi automático ou pedido', () => {
    // O booleano é o que separa "o cofre fechou sozinho" de "eu apertei o
    // botão": a tela não pode anunciar o primeiro quando foi o segundo. Ler o
    // argumento errado aqui devolveria `undefined` para um `if (automatic)`.
    const api = exposedApi();
    const received: boolean[] = [];
    const unsubscribe = api.vault.onLocked((automatic) => received.push(automatic));

    const subscription = ipcRenderer.on.mock.calls.at(-1);
    expect(subscription?.[0]).toBe('vault:locked');
    const listener = subscription?.[1];

    listener?.({}, true);
    listener?.({}, false);
    expect(received).toEqual([true, false]);

    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('vault:locked', listener);
  });
});
