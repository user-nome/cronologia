import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProvider } from '@zero/main/drive/provider';
import { dropboxProvider } from '@zero/main/drive/providers/dropbox/provider';
import { DROPBOX_SCOPE_VERSION } from '@zero/main/drive/providers/dropbox/constants';
import { appKey, state } from '@zero/main/drive/state';
import { saveSettings } from '@zero/main/settings';
import { messages } from '@zero/messages';
import { resetSandbox } from '../helpers/sandbox.ts';
import { openTestVault } from '../helpers/vault.ts';
import {
  DOWNLOAD_ENDPOINT,
  LIST_FOLDER_ENDPOINT,
  UPLOAD_ENDPOINT,
  json,
  stubFetch,
} from '../helpers/drive.ts';
import type { FetchCall } from '../helpers/drive.ts';

const m = messages('pt-BR');
const DROPBOX_KEY = 'dropbox-app-key';

/**
 * O objeto `BackupProvider` do Dropbox, que é só a adaptação de `session.ts` e
 * `rest.ts` ao contrato.
 *
 * O que este arquivo fixa é a **ligação por referência**: cada campo do
 * adaptador tem de ser exatamente a função do módulo de onde veio, e o
 * `operational` tem de ser lido a cada acesso, não congelado no import. O getter
 * existe porque a App key efetiva muda de fonte (override no cofre ou chave do
 * build), e um valor avaliado uma vez traria a disponibilidade do momento em que
 * o app carregou.
 */

beforeEach(() => {
  resetSandbox();
  vi.stubEnv('DROPBOX_APP_KEY', '');
  state.provider = 'dropbox';
});

afterEach(() => {
  vi.unstubAllEnvs();
  state.provider = 'dropbox';
});

describe('dropboxProvider: identidade e contrato', () => {
  it('é o mesmo objeto que o catálogo devolve para o id', () => {
    expect(getProvider('dropbox')).toBe(dropboxProvider);
  });

  it('fala com a API pelas operações do Dropbox, não por uma reimplementação', async () => {
    // Comparar as funções por identidade não diria nada: se o adaptador
    // reimplementasse a chamada, os dois lados do `toBe` mudariam juntos. O que
    // segura é o **endereço**: a fachada tem de pedir exatamente a rota que o
    // REST do Dropbox pede, no mesmo método e com o mesmo corpo.
    await openTestVault();
    state.tokens = {
      accessToken: 'token-do-teste',
      refreshToken: 'refresh-do-teste',
      expiresAt: Date.now() + 3_600_000,
      accountEmail: null,
      lastSync: null,
      scopeVersion: DROPBOX_SCOPE_VERSION,
    };

    const calls = stubFetch((call: FetchCall) => {
      if (call.url === LIST_FOLDER_ENDPOINT) {
        return json({ entries: [], cursor: 'cursor-fim', has_more: false });
      }
      if (call.url === UPLOAD_ENDPOINT) return json({ '.tag': 'file', id: 'id-1' });
      if (call.url === DOWNLOAD_ENDPOINT) return new Response(new Uint8Array([1, 2]));
      if (call.url === 'https://api.dropboxapi.com/2/files/delete_v2') {
        return json({ metadata: { '.tag': 'file', id: 'id-1' } });
      }
      return json({ error_summary: 'rota_desconhecida' }, 500);
    });

    await dropboxProvider.listAppFiles();
    await dropboxProvider.uploadFile('biblioteca.enc', Buffer.from('cifrado'));
    const baixado = await dropboxProvider.downloadFile('id-1');
    await dropboxProvider.deleteFile('id-1');

    expect([...baixado]).toEqual([1, 2]);
    const rotas = calls.map((call) => `${call.init.method ?? 'GET'} ${call.url}`);
    expect(rotas).toEqual([
      `POST ${LIST_FOLDER_ENDPOINT}`,
      `POST ${UPLOAD_ENDPOINT}`,
      `POST ${DOWNLOAD_ENDPOINT}`,
      'POST https://api.dropboxapi.com/2/files/delete_v2',
    ]);
  });

  it('declara pasta visível do Dropbox, o oposto da appDataFolder do Google', () => {
    expect(dropboxProvider.id).toBe('dropbox');
    expect(dropboxProvider.label).toBe('Dropbox');
    expect(dropboxProvider.storageHidden).toBe(false);
  });
});

describe('dropboxProvider: o getter operational é lido a cada acesso', () => {
  it('segue a App key injetada no build, sem congelar no import', () => {
    expect(dropboxProvider.operational).toBe(false);

    // A chave entra no ambiente depois do import: um valor avaliado uma vez só
    // continuaria `false`, e o provedor apareceria quebrado para sempre.
    vi.stubEnv('DROPBOX_APP_KEY', DROPBOX_KEY);
    expect(dropboxProvider.operational).toBe(true);

    vi.stubEnv('DROPBOX_APP_KEY', '');
    expect(dropboxProvider.operational).toBe(false);
  });

  it('prefere o override guardado no cofre à chave do build', async () => {
    vi.stubEnv('DROPBOX_APP_KEY', DROPBOX_KEY);
    // Sem override no cofre, a chave do build é a que vale.
    expect(appKey()).toBe(DROPBOX_KEY);

    await openTestVault();
    saveSettings({
      driveClientId: 'chave-do-usuario',
      drivePassphrase: '',
      language: 'pt-BR',
      backupProvider: 'dropbox',
    });

    expect(appKey()).toBe('chave-do-usuario');
    expect(dropboxProvider.operational).toBe(true);
    expect(dropboxProvider.describe(m).operational).toBe(true);
  });
});

describe('dropboxProvider.describe', () => {
  it('descreve o Dropbox com o destino de pasta visível', () => {
    vi.stubEnv('DROPBOX_APP_KEY', DROPBOX_KEY);

    expect(dropboxProvider.describe(m)).toEqual({
      id: 'dropbox',
      label: 'Dropbox',
      operational: true,
      unavailableReason: null,
      storageTarget: m.providers.dropboxStorageTarget,
      storageHidden: false,
    });
  });

  it('diz o que fazer quando o build não traz App key', () => {
    vi.stubEnv('DROPBOX_APP_KEY', '');

    const info = dropboxProvider.describe(m);
    expect(info.operational).toBe(false);
    expect(info.unavailableReason).toBe(m.driveErrors.configureAppKey);
    // O destino continua sendo dito: quem não configurou a chave ainda precisa
    // saber onde o backup vai ficar.
    expect(info.storageTarget).toBe(m.providers.dropboxStorageTarget);
  });
});
