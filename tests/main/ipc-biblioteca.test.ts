import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ipcMain } from '../mocks/electron.ts';
import type { IpcHandler } from '../mocks/electron.ts';
import { currentMessages } from '@zero/main/i18n';
import { dataDir, saveLibrary } from '@zero/main/library';
import { makeDraft, makeWork } from '../helpers/fixtures.ts';
import { openTestVault } from '../helpers/vault.ts';

/**
 * A mensagem que atravessa o IPC.
 *
 * O código do cofre (`libraryTampered`, `vaultLocked`) não sobrevive ao IPC:
 * o renderer recebe só a mensagem. Se a mensagem que sai for a crua
 * (`VaultError: libraryTampered`), a tela mostra o nome de um código de
 * domínio como se fosse interface — e a pessoa não tem o que fazer com isso.
 *
 * Estes testes seguram a tradução no main: o erro do cofre sai no idioma
 * vigente, e o erro que **não** é do cofre passa intacto, com a mensagem que o
 * domínio escreveu.
 */

const FAKE_EVENT = { senderFrame: { url: 'cronologia://app/index.html' } };

function handler(channel: string): IpcHandler {
  const call = ipcMain.handle.mock.calls.find((entry) => entry[0] === channel);
  if (call === undefined) throw new Error(`Handler IPC ausente: ${channel}`);
  return call[1];
}

function invoke(channel: string, ...args: unknown[]): unknown {
  return handler(channel)(FAKE_EVENT, ...args);
}

beforeAll(async () => {
  // O acervo é cifrado com a chave do cofre: o cofre de teste precisa existir
  // **antes** de o acervo ser gravado.
  await openTestVault();
  saveLibrary([makeWork()]);
  await import('@zero/main/index');
  await vi.waitFor(() => expect(ipcMain.handle).toHaveBeenCalled());
});

describe('erro do acervo atravessando o IPC', () => {
  it('acervo ilegível recusa com a mensagem localizada', () => {
    const file = path.join(dataDir(), 'library.enc');
    const raw = fs.readFileSync(file);
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0xff;
    fs.writeFileSync(file, raw);

    expect(() => invoke('library:get')).toThrow(currentMessages().vault.errors.libraryTampered);
    // O acervo continua no disco: a falha é fechada, ninguém apagou nada.
    expect(fs.existsSync(file)).toBe(true);
  });

  it('cofre fechado recusa com a mensagem localizada, nos três canais', async () => {
    const { destroyVault } = await import('@zero/main/vault');
    destroyVault();

    for (const run of [
      () => invoke('library:get'),
      () => invoke('library:save', makeDraft({ id: 'nova' })),
      () => invoke('library:delete', 'qualquer'),
    ]) {
      expect(run).toThrow(currentMessages().vault.errors.vaultLocked);
    }

    await openTestVault();
  });

  it('erro que não é do cofre passa intacto, com a mensagem do domínio', () => {
    // O que se traduz é o erro do cofre; o resto já tem mensagem própria (a do
    // id inválido, por exemplo) e não pode ser reescrito aqui.
    expect(() => invoke('library:save', makeDraft({ id: '../fora' }))).toThrow(
      currentMessages().libraryErrors.invalidId,
    );
  });
});
