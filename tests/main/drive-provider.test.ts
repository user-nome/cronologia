import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentProvider, getProvider, listProviders } from '@zero/main/drive/provider';
import {
  googleClientId,
  googleClientSecret,
  hasGoogleCredentials,
} from '@zero/main/drive/providers/google';
import { googleFlow } from '@zero/main/drive/providers/google/oauth';
import { dropboxAppKey } from '@zero/main/drive/providers/dropbox/credentials';
import { state } from '@zero/main/drive/state';
import { messages } from '@zero/messages';
import { resetSandbox } from '../helpers/sandbox.ts';

const m = messages('pt-BR');

/**
 * O catálogo é o que a interface mostra, então ele responde por uma pergunta
 * que a credencial decide: **este build tem o que conectar o Google Drive?**
 *
 * Nos testes o `process.env` está vazio (o `define` do Vite só roda no build),
 * o que é o mesmo estado de um `npm ci` limpo: o Google Drive aparece como não
 * operante, com o motivo real. Os casos com credencial usam `vi.stubEnv`, que
 * escreve no mesmo lugar que `credentials.ts` lê.
 */
const CHAVE = '123.apps.googleusercontent.com';
const SEGREDO = 'GOCSPX-segredo-de-teste';
const DROPBOX_KEY = 'dropbox-app-key';

beforeEach(() => {
  resetSandbox();
  vi.stubEnv('DROPBOX_APP_KEY', '');
  state.provider = 'dropbox';
});

afterEach(() => {
  vi.unstubAllEnvs();
  state.provider = 'dropbox';
});

describe('catálogo de provedores de backup', () => {
  it('marca ambos os provedores como indisponíveis sem credenciais de build', () => {
    const [dropbox, google] = listProviders();
    expect(dropbox).toEqual({
      id: 'dropbox',
      label: 'Dropbox',
      operational: false,
      unavailableReason: m.driveErrors.configureAppKey,
      storageTarget: m.providers.dropboxStorageTarget,
      storageHidden: false,
    });
    expect(google).toEqual({
      id: 'google-drive',
      label: 'Google Drive',
      operational: false,
      unavailableReason: m.providers.googleNoCredentials,
      storageTarget: m.providers.googleStorageTarget,
      storageHidden: true,
    });
  });

  it('lê a App key do Dropbox injetada pelo build, aparando espaços', () => {
    vi.stubEnv('DROPBOX_APP_KEY', `  ${DROPBOX_KEY}\n`);

    expect(dropboxAppKey()).toBe(DROPBOX_KEY);
    expect(getProvider('dropbox').describe(m)).toMatchObject({
      operational: true,
      unavailableReason: null,
    });
  });

  it('diz ao usuário que a falta é de credencial do build, não do Google', () => {
    const info = getProvider('google-drive').describe(m);
    expect(info.operational).toBe(false);
    // A mensagem precisa dizer o que fazer (o par entra na publicação) e para
    // onde o backup vai enquanto isso, senão o usuário acha que perdeu o Drive.
    expect(info.unavailableReason ?? '').toContain('build');
    expect(info.unavailableReason ?? '').toContain('backup usa o Dropbox');
  });

  it('marca o Google Drive como operante quando o build traz a credencial', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', CHAVE);
    const info = getProvider('google-drive').describe(m);
    expect(info.operational).toBe(true);
    // Operante não leva motivo de recusa: sobrar um texto de "indisponível" ao
    // lado de um provedor conectável seria o app se contradizendo.
    expect(info.unavailableReason).toBeNull();
    expect(hasGoogleCredentials()).toBe(true);
  });

  it('lê o par de chaves injetado, aparando o espaço das variaveis de ambiente', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', `  ${CHAVE}\n`);
    vi.stubEnv('GOOGLE_CLIENT_SECRET', ` ${SEGREDO} `);
    expect(googleClientId()).toBe(CHAVE);
    expect(googleClientSecret()).toBe(SEGREDO);
  });

  it('trata ambiente vazio como sem credencial, sem exceção', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    expect(googleClientId()).toBe('');
    expect(googleClientSecret()).toBe('');
    expect(hasGoogleCredentials()).toBe(false);
  });

  it('googleClientSecret usa fallback quando a variável não está definida', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', CHAVE);
    // Deleta explicitamente para testar o fallback `?? ''`
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(googleClientSecret()).toBe('');
  });

  it('dropboxAppKey usa fallback quando a variável não está definida', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', CHAVE);
    // Deleta explicitamente para testar o fallback `?? ''`
    delete process.env.DROPBOX_APP_KEY;
    expect(dropboxAppKey()).toBe('');
  });

  it('grava o backup do Google Drive em pasta oculta (appDataFolder)', () => {
    const info = getProvider('google-drive').describe(m);
    expect(info.storageHidden).toBe(true);
    expect(info.storageTarget).toContain('appDataFolder');
    expect(info.storageTarget).toContain('não aparece na interface do Google Drive');
    // O Dropbox continua com pasta visível em /Apps/.
    expect(getProvider('dropbox').describe(m).storageHidden).toBe(false);
  });

  it('recusa autorizar sem credencial, com o mesmo motivo da interface', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    // O Google Drive precisa estar escolhido: a sessão é gravada na vaga do
    // destino ativo, então autorizar fora dele nem chega a olhar a credencial.
    state.provider = 'google-drive';
    // A interface diz "não traz credencial"; a autorização precisa recusar com a
    // mesma frase, senão o usuário recebe um erro de OAuth para um build que nem
    // tenta sair no navegador.
    await expect(getProvider('google-drive').authorize()).resolves.toEqual({
      ok: false,
      error: m.providers.googleNoCredentials,
    });
  });

  it('segue o provedor escolhido, não o Dropbox fixo', () => {
    expect(currentProvider().id).toBe('dropbox');
    state.provider = 'google-drive';
    expect(currentProvider().id).toBe('google-drive');
    // O catálogo descreve o mesmo objeto que as operações usam.
    const provider = currentProvider();
    expect(getProvider(provider.id)).toBe(provider);
    expect(provider.describe(m)).toEqual(getProvider('google-drive').describe(m));
  });

  it('o getter operational do Dropbox reflete a App key do build', () => {
    // Sem chave: operational é false
    vi.stubEnv('DROPBOX_APP_KEY', '');
    expect(getProvider('dropbox').operational).toBe(false);

    // Com chave: operational é true
    vi.stubEnv('DROPBOX_APP_KEY', DROPBOX_KEY);
    expect(getProvider('dropbox').operational).toBe(true);
  });

  it('o getter operational e o campo operational do describe concordam', () => {
    vi.stubEnv('DROPBOX_APP_KEY', DROPBOX_KEY);
    const provider = getProvider('dropbox');
    expect(provider.operational).toBe(provider.describe(m).operational);

    vi.stubEnv('DROPBOX_APP_KEY', '');
    expect(provider.operational).toBe(provider.describe(m).operational);
  });

  it('googleDriveProvider.describe reflete operational=true com credencial', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', CHAVE);
    const info = getProvider('google-drive').describe(m);
    expect(info.operational).toBe(true);
    expect(info.unavailableReason).toBeNull();
    expect(info.storageHidden).toBe(true);
  });

  it('googleDriveProvider.describe reflete operational=false sem credencial', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    const info = getProvider('google-drive').describe(m);
    expect(info.operational).toBe(false);
    expect(info.unavailableReason).toBe(m.providers.googleNoCredentials);
    expect(info.storageHidden).toBe(true);
  });
});

describe('googleFlow.renewError', () => {
  it('retorna mensagem de falha de renovação com nome do provedor', () => {
    const errorMsg = googleFlow.renewError();
    expect(errorMsg).toContain('Google Drive');
    // A mensagem real vem do bundle de mensagens
    expect(typeof errorMsg).toBe('string');
    expect(errorMsg.length).toBeGreaterThan(0);
  });
});
