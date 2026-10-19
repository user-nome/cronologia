import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, LibraryReset, PurgeResult, VaultResult, Work } from '@zero/types';
import {
  configDir,
  coversDir,
  dataDir,
  readCoverBuffer,
  saveLibrary,
  writeCoverFile,
} from '@zero/main/library';
import { currentMessages } from '@zero/main/i18n';
import { IDLE_LOCK_MS, setSecret, vaultSession } from '@zero/main/vault';
import { destroyVault } from '@zero/main/vault';
import { VAULT_SECRET } from '@zero/main/vault/secrets';
import { makeDraft, makeWork } from '../helpers/fixtures.ts';
import { sandboxPath } from '../helpers/sandbox.ts';
import { openTestVault } from '../helpers/vault.ts';
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  session,
  shell,
} from '../mocks/electron.ts';
import type { IpcHandler, WindowEventHandler } from '../mocks/electron.ts';

function handler(channel: string): IpcHandler {
  const call = ipcMain.handle.mock.calls.find((entry) => entry[0] === channel);
  if (call === undefined) throw new Error(`Handler IPC ausente: ${channel}`);
  return call[1];
}

const FAKE_EVENT = { senderFrame: { url: 'cronologia://app/index.html' } };

function invoke(channel: string, ...args: unknown[]): unknown {
  return handler(channel)(FAKE_EVENT, ...args);
}

function invokeAsync<T>(channel: string, ...args: unknown[]): Promise<T> {
  return invoke(channel, ...args) as Promise<T>;
}

/**
 * Roda o OAuth até o fim recusando o consentimento e devolve a URL aberta.
 *
 * Serve para qualquer provedor: o que interessa aqui é a URL que o main montou.
 */
async function negarOAuth(): Promise<URL> {
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
  const result = await invokeAsync<{ ok: boolean; error?: string }>('drive:auth');
  expect(result).toEqual({ ok: false, error: 'access_denied' });
  return new URL(shell.openExternal.mock.calls.at(-1)?.[0] ?? '');
}

function appListener(event: string): WindowEventHandler {
  const call = app.on.mock.calls.find((entry) => entry[0] === event);
  if (call === undefined) throw new Error(`Listener de app ausente: ${event}`);
  return call[1];
}

function windowEvent(win: BrowserWindow, event: string): WindowEventHandler {
  const call = win.on.mock.calls.find((entry) => entry[0] === event);
  if (call === undefined) throw new Error(`Listener de janela ausente: ${event}`);
  return call[1];
}

function onceEvent(win: BrowserWindow, event: string): WindowEventHandler {
  const call = win.once.mock.calls.find((entry) => entry[0] === event);
  if (call === undefined) throw new Error(`Listener one-shot ausente: ${event}`);
  return call[1];
}

function coverHandler(): (request: { url: string }) => Response {
  const call = protocol.handle.mock.calls.find((entry) => entry[0] === 'cover');
  if (call === undefined) throw new Error('Protocolo cover não registrado.');
  return call[1];
}

/** Credenciais de teste nos formatos de produção; o KDF é o de `tests/helpers`. */
const MASTER = 'Tz7#mQ2!vZ9@pL4$xR8!nW3&';
const PIN = '49201733';
const VAULT_INPUT = {
  masterPassword: MASTER,
  pin: PIN,
  recoveryPhrase:
    'cavalo cenoura feira inverno bibliografia zettelkasten kalamita peixoto velleda aurora jubileu silhueta',
};
/** URL que o `electron-vite dev` injeta para o renderer. */
const DEV_URL = 'http://localhost:5173';

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

/** Faz a próxima chamada do `fs` indicada falhar com `code`, como um disco cheio. */
function falhaEm(alvo: 'mkdirSync' | 'lstatSync', code: string): void {
  vi.spyOn(fs, alvo).mockImplementationOnce(() => {
    throw errno(code);
  });
}

const AJUSTES_NOVOS: AppSettings = {
  driveClientId: 'id',
  drivePassphrase: 'frase',
  backupProvider: 'dropbox',
  language: 'en',
};

/** Evento de IPC cujo emissor está na URL dada (a guarda do main compara origem). */
function frameDe(url: unknown): unknown {
  return { senderFrame: { url } };
}

/** Janela já criada pelo app (índice 0 é a primeira); falha alto se não houver. */
function janela(indice = 0): BrowserWindow {
  const win = BrowserWindow.instances[indice];
  if (win === undefined) throw new Error('Janela não criada.');
  return win;
}

/**
 * Janela viva para os avisos do main. Quando não há nenhuma (os testes de
 * ciclo de vida fecharam as que existiam), recria pelo mesmo caminho do app:
 * o `activate` do macOS, que é quem reabre a janela.
 */
function janelaViva(): BrowserWindow {
  const antes = BrowserWindow.instances.length;
  BrowserWindow.getAllWindows.mockReturnValueOnce([]);
  appListener('activate')();
  if (BrowserWindow.instances.length === antes) throw new Error('janela não recriada');
  return janela(BrowserWindow.instances.length - 1);
}

const expectedChannels = [
  'library:get',
  'library:save',
  'library:delete',
  'library:reset',
  'cover:pick',
  'settings:get',
  'settings:set',
  'drive:status',
  'drive:providers',
  'drive:set-provider',
  'drive:auth',
  'drive:backup',
  'drive:restore',
  'drive:backup-info',
  'drive:disconnect',
  'drive:purge',
  'vault:status',
  'vault:create',
  'vault:unlock',
  'vault:reset-pin',
  'vault:change-master',
  'vault:change-pin',
  'vault:lock',
  'vault:destroy',
  'vault:touch',
];

beforeAll(async () => {
  // Instalação existente no lugar. O acervo é cifrado com a chave do cofre,
  // então o cofre de teste precisa existir **antes** do acervo ser gravado.
  await openTestVault();
  saveLibrary([makeWork()]);
  writeCoverFile('capa.png', Buffer.from('cover-image', 'utf-8'));
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(path.join(configDir(), 'settings.json'), JSON.stringify({ language: 'pt-BR' }));

  await import('@zero/main/index');
  await vi.waitFor(() => expect(ipcMain.handle).toHaveBeenCalled());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('inicialização', () => {
  it('registra os schemes cover e cronologia como privilegiados', () => {
    expect(protocol.registerSchemesAsPrivileged).toHaveBeenCalledWith([
      {
        scheme: 'cover',
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          stream: true,
        },
      },
      {
        scheme: 'cronologia',
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          stream: true,
        },
      },
    ]);
  });

  it('move o userData para o cache XDG', () => {
    expect(app.setPath).toHaveBeenCalledWith(
      'userData',
      path.join(sandboxPath('XDG_CACHE_HOME'), 'cronologia'),
    );
  });

  it('registra todos os canais de IPC', () => {
    const channels = ipcMain.handle.mock.calls.map((call) => call[0]);
    expect(channels).toEqual(expectedChannels);
  });

  it('cria a janela com sandbox e context isolation', () => {
    expect(BrowserWindow.instances).toHaveLength(1);
    const options = janela().options as {
      width: number;
      minWidth: number;
      minHeight: number;
      title: string;
      webPreferences: Record<string, unknown>;
    };
    expect(options.width).toBe(1200);
    expect(options.minWidth).toBe(520);
    expect(options.minHeight).toBe(360);
    expect(options.title).toBe('Cronologia');
    expect(options.webPreferences.contextIsolation).toBe(true);
    expect(options.webPreferences.nodeIntegration).toBe(false);
    expect(options.webPreferences.sandbox).toBe(true);
    expect(options.webPreferences.webSecurity).toBe(true);
    // Mock com isPackaged false (modo dev) mantém o DevTools ligado; no .deb
    // empacotado isPackaged vira true e `devTools` desliga.
    expect(options.webPreferences.devTools).toBe(true);
    expect(String(options.webPreferences.preload)).toContain(path.join('preload', 'index'));
    // Em produção o renderer é servido pelo scheme custom `cronologia://` (sem file://).
    expect(janela().loadURL.mock.calls[0]?.[0]).toBe('cronologia://app/index.html');
    // Sem dev URL, loadFile não é usado (scheme custom cobre a home).
    expect(janela().loadFile).not.toHaveBeenCalled();
  });

  it('trava o app em uma única instância', () => {
    expect(app.requestSingleInstanceLock).toHaveBeenCalled();
    expect(app.quit).not.toHaveBeenCalled();
  });

  it('remove o menu da aplicação (sem File/Edit/View) e sem menu de botão direito', () => {
    expect(Menu.setApplicationMenu).toHaveBeenCalledTimes(1);
    expect(Menu.setApplicationMenu).toHaveBeenCalledWith(null);
    // O único listener de webContents é a guarda de navegação; nenhum
    // handler de context-menu (menu de botão direito).
    const events = janela().webContents.on.mock.calls.map((call) => call[0]);
    expect(events).not.toContain('context-menu');
  });

  it('nega permissões da sessão menos o clipboard', () => {
    expect(session.defaultSession.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
    const policy = session.defaultSession.setPermissionRequestHandler.mock.calls[0]?.[0];
    if (policy === undefined) throw new Error('Política de permissões ausente.');
    const grant = vi.fn<(granted: boolean) => void>();
    policy(null, 'geolocation', grant, null);
    expect(grant).toHaveBeenCalledWith(false);
    policy(null, 'media', grant, null);
    expect(grant).toHaveBeenLastCalledWith(false);
    policy(null, 'clipboard-sanitized-write', grant, null);
    expect(grant).toHaveBeenLastCalledWith(true);
    policy(null, 'clipboard-read', grant, null);
    expect(grant).toHaveBeenLastCalledWith(true);
  });

  it('define o ícone da janela a partir do ícone do pacote', () => {
    expect(nativeImage.createFromPath).toHaveBeenCalledWith(
      expect.stringContaining(path.join('build', 'icon.png')),
    );
    expect(janela().options.icon).toBeDefined();
  });
});

describe('atalho F11 (tela cheia)', () => {
  it('registra o F11 ao focar e libera ao desfocar/encerrar', () => {
    const win = janela();
    globalShortcut.register.mockClear();
    globalShortcut.unregister.mockClear();
    globalShortcut.unregisterAll.mockClear();

    appListener('browser-window-focus')();
    expect(globalShortcut.register).toHaveBeenCalledWith('F11', expect.any(Function));

    const toggle = globalShortcut.register.mock.calls.at(-1)?.[1];
    if (toggle === undefined) throw new Error('Callback do F11 ausente.');

    win.isFullScreen.mockReturnValue(false);
    win.setFullScreen.mockClear();
    toggle();
    expect(win.setFullScreen).toHaveBeenCalledWith(true);

    win.isFullScreen.mockReturnValue(true);
    toggle();
    expect(win.setFullScreen).toHaveBeenCalledWith(false);

    appListener('browser-window-blur')();
    expect(globalShortcut.unregister).toHaveBeenCalledWith('F11');

    appListener('will-quit')();
    expect(globalShortcut.unregisterAll).toHaveBeenCalled();
  });
});

describe('diretórios do app', () => {
  it('biblioteca, capas e settings ficam no XDG, sem arquivo de token', () => {
    // O acervo em disco é cifrado: existe o arquivo, e o conteúdo em claro
    // não está lá dentro.
    expect(fs.existsSync(path.join(dataDir(), 'library.enc'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir(), 'library.json'))).toBe(false);
    expect(fs.readFileSync(path.join(dataDir(), 'library.enc')).toString('utf-8')).not.toContain(
      'Solo Leveling',
    );
    expect(fs.existsSync(path.join(coversDir(), 'capa.png.enc'))).toBe(true);
    expect(readCoverBuffer('capa.png')?.toString('utf-8')).toBe('cover-image');
    expect(fs.existsSync(path.join(configDir(), 'settings.json'))).toBe(true);
    expect(fs.existsSync(path.join(configDir(), 'drive-tokens.json'))).toBe(false);
    expect(fs.existsSync(path.join(configDir(), 'dropbox-tokens.json'))).toBe(false);
    expect(fs.existsSync(coversDir())).toBe(true);
  });
});

describe('handlers de biblioteca', () => {
  it('library:get devolve a biblioteca decifrada', () => {
    const works = invoke('library:get') as Work[];
    expect(works).toHaveLength(1);
    expect(works[0]?.title).toBe('Solo Leveling');
  });

  it('library:save insere e library:delete remove', () => {
    const saved = invoke('library:save', makeDraft({ id: 'nova', title: 'Nova obra' })) as Work[];
    expect(saved).toHaveLength(2);
    expect(saved.some((work) => work.id === 'nova')).toBe(true);

    const deleted = invoke('library:delete', 'nova') as Work[];
    expect(deleted).toHaveLength(1);
    expect(deleted[0]?.id).not.toBe('nova');
  });

  it('library:reset devolve a contagem real do shred, sem "apagado" em falso', () => {
    const result = invoke('library:reset') as LibraryReset;

    // 1 obra gravada = `library.enc` sobrescrito; a pasta de capas está vazia.
    expect(result).toEqual({ ok: true, shredded: 1, failed: 0 });

    // Sem acervo gravado, zerar de novo não inventa sucesso nem falha.
    expect(invoke('library:reset')).toEqual({ ok: true, shredded: 0, failed: 0 });
  });

  it('library:reset com cofre fechado recusa com código e não inventa contagem', async () => {
    destroyVault();

    const result = invoke('library:reset') as LibraryReset;

    expect(result.ok).toBe(false);
    expect(result.code).toBe('vaultLocked');

    await openTestVault();
  });
});

describe('handlers de configurações e Drive', () => {
  it('settings:get devolve o idioma do disco (segredos vêm do cofre)', () => {
    const settings = invoke('settings:get') as AppSettings;
    expect(settings).toEqual({
      driveClientId: '',
      drivePassphrase: '',
      backupProvider: 'dropbox',
      language: 'pt-BR',
    });
  });

  it('drive:status inicia desconectado sem sessão anterior', () => {
    const status = invoke('drive:status') as { connected: boolean; accountEmail: string | null };
    expect(status.connected).toBe(false);
    expect(status.accountEmail).toBeNull();
  });

  it('drive:auth usa a chave das configurações e roda o OAuth do Dropbox', async () => {
    vi.stubEnv('DROPBOX_APP_KEY', '');
    invoke('settings:set', {
      driveClientId: 'id-do-teste',
      drivePassphrase: '',
    });
    const opened = await negarOAuth();
    expect(opened.searchParams.get('client_id')).toBe('id-do-teste');
    expect(opened.searchParams.get('redirect_uri')).toMatch(/^http:\/\/localhost:\d+\/callback$/u);
    expect(opened.searchParams.has('client_secret')).toBe(false);
    // O override do cofre tem prioridade sobre a chave do build.
  });

  it('drive:auth usa a chave do build quando o settings não tem override', async () => {
    vi.stubEnv('DROPBOX_APP_KEY', 'chave-do-build');
    setSecret(VAULT_SECRET.driveClientId, '');
    invoke('settings:set', {
      driveClientId: '',
      drivePassphrase: '',
    });
    const opened = await negarOAuth();
    expect(opened.searchParams.get('client_id')).toBe('chave-do-build');
  });

  it('drive:auth conecta o destino escolhido, não o Dropbox fixo', async () => {
    // Regressão: o handler chamava a sessão do Dropbox direto, então escolher o
    // Google Drive e clicar em Conectar abria o consentimento do Dropbox — e, se a
    // pessoa completasse, o token do Dropbox era gravado na vaga do Drive, porque
    // `persistState` escreve na entrada do destino ativo.
    const CHAVE = '123.apps.googleusercontent.com';
    vi.stubEnv('GOOGLE_CLIENT_ID', CHAVE);
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'GOCSPX-segredo-de-teste');
    expect(invoke('drive:set-provider', 'google-drive')).toEqual({ ok: true });
    try {
      const opened = await negarOAuth();

      expect(opened.origin + opened.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(opened.searchParams.get('client_id')).toBe(CHAVE);
      expect(opened.searchParams.get('access_type')).toBe('offline');
    } finally {
      // A escolha é global: voltar ao Dropbox não deixa vazar para os testes de
      // backup e restauração que vem a seguir.
      invoke('drive:set-provider', 'dropbox');
    }
  });

  it('drive:disconnect limpa a sessão e avisa a janela', () => {
    const win = janela();
    win.webContents.send.mockClear();
    const status = invoke('drive:disconnect') as { connected: boolean; lastError: string | null };
    expect(status.connected).toBe(false);
    expect(status.lastError).toBeNull();
    expect(win.webContents.send).toHaveBeenCalledWith(
      'drive:status-changed',
      expect.objectContaining({ connected: false }),
    );
    expect(fs.existsSync(path.join(configDir(), 'dropbox-tokens.json'))).toBe(false);
  });

  it('drive:backup, restore e backup-info exigem conexão', async () => {
    expect(await invokeAsync('drive:backup')).toEqual({
      ok: false,
      error: 'Conecte a conta Dropbox primeiro.',
    });
    expect(await invokeAsync('drive:restore')).toEqual({
      ok: false,
      error: 'Conecte a conta Dropbox primeiro.',
    });
    expect(await invokeAsync('drive:backup-info')).toBeNull();
  });

  it('settings:set grava e normaliza as credenciais', () => {
    const saved = invoke('settings:set', {
      driveClientId: '  novo-id  ',
      drivePassphrase: 'frase',
      backupProvider: 'dropbox',
      language: 'en',
    }) as AppSettings;
    expect(saved).toEqual({
      driveClientId: 'novo-id',
      drivePassphrase: 'frase',
      backupProvider: 'dropbox',
      language: 'en',
    });
    // O disco guarda idioma e provedor; os segredos ficam no cofre.
    const onDisk: unknown = JSON.parse(
      fs.readFileSync(path.join(configDir(), 'settings.json'), 'utf-8'),
    );
    expect(onDisk).toEqual({ language: 'en', backupProvider: 'dropbox' });
  });
});

describe('handler cover:pick', () => {
  it('devolve null quando o diálogo é cancelado', async () => {
    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await invokeAsync<string | null>('cover:pick')).toBeNull();
  });

  it('devolve null quando nenhum arquivo foi escolhido', async () => {
    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [''] });
    expect(await invokeAsync<string | null>('cover:pick')).toBeNull();
  });

  it('importa a imagem escolhida para a pasta de capas', async () => {
    const source = path.join(os.tmpdir(), `cronologia-pick-${Date.now()}.png`);
    fs.writeFileSync(source, 'imagem-escolhida', 'utf-8');
    try {
      dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [source] });
      const name = await invokeAsync<string | null>('cover:pick');
      expect(name).toMatch(/\.png$/);
      expect(fs.existsSync(path.join(coversDir(), `${name ?? 'x'}.enc`))).toBe(true);
      expect(readCoverBuffer(name ?? 'x')?.toString('utf-8')).toBe('imagem-escolhida');
    } finally {
      fs.rmSync(source, { force: true });
    }
  });

  it('abre o diálogo na janela de origem quando disponível', async () => {
    const win = janela();
    BrowserWindow.fromWebContents.mockReturnValueOnce(win);
    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    await invokeAsync<string | null>('cover:pick');
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(win, expect.anything());
  });
});

describe('protocolo cover://', () => {
  it('serve a imagem com mime e cache', () => {
    writeCoverFile('existe.png', Buffer.from('conteudo-da-capa', 'utf-8'));
    const response = coverHandler()({ url: 'cover://app/existe.png' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('max-age=3600');
  });

  it('devolve 404 para capa inexistente', () => {
    const response = coverHandler()({ url: 'cover://app/fantasma.png' });
    expect(response.status).toBe(404);
  });

  it('devolve 404 para caminho vazio', () => {
    const response = coverHandler()({ url: 'cover://app/' });
    expect(response.status).toBe(404);
  });

  it('devolve 500 para URL inválida', () => {
    const response = coverHandler()({ url: ':::nao-e-url' });
    expect(response.status).toBe(500);
  });
});

describe('ciclo de vida da janela', () => {
  it('mostra a janela quando pronta', () => {
    const win = janela();
    win.show.mockClear();
    onceEvent(win, 'ready-to-show')();
    expect(win.show).toHaveBeenCalledTimes(1);
  });

  it('abre links externos no navegador e nega janelas novas', () => {
    const win = janela();
    shell.openExternal.mockClear();
    const opener = win.webContents.setWindowOpenHandler.mock.calls[0]?.[0];
    if (opener === undefined) throw new Error('Window open handler ausente.');
    const decision = opener({ url: 'https://exemplo.com/docs' });
    expect(decision.action).toBe('deny');
    expect(shell.openExternal).toHaveBeenCalledWith('https://exemplo.com/docs');
  });

  it('não abre URLs externas fora de https', () => {
    const win = janela();
    shell.openExternal.mockClear();
    const opener = win.webContents.setWindowOpenHandler.mock.calls[0]?.[0];
    if (opener === undefined) throw new Error('Window open handler ausente.');
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://exemplo.com/', '']) {
      expect(opener({ url }).action).toBe('deny');
    }
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('prende a navegação à página do app (will-navigate)', () => {
    const win = janela();
    const call = win.webContents.on.mock.calls.find((entry) => entry[0] === 'will-navigate');
    if (call === undefined) throw new Error('Listener will-navigate ausente.');
    const listener = call[1];
    const targetUrl = win.loadURL.mock.calls[0]?.[0] ?? '';
    if (targetUrl === '') throw new Error('loadURL não chamado (modo dev?).');

    const event = { preventDefault: vi.fn() };
    listener(event, 'https://exemplo.com/fora');
    expect(event.preventDefault).toHaveBeenCalledTimes(1);

    listener(event, targetUrl);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('foca (e restaura) a janela na segunda instância', () => {
    const win = janela();
    win.focus.mockClear();
    win.restore.mockClear();
    const listener = appListener('second-instance');

    listener();
    expect(win.focus).toHaveBeenCalledTimes(1);
    expect(win.restore).not.toHaveBeenCalled();

    win.isMinimized.mockReturnValueOnce(true);
    listener();
    expect(win.restore).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(2);

    // Sem janela viva o aviso some inteiro: não explode nem inventa janela.
    windowEvent(win, 'closed')();
    const antes = BrowserWindow.instances.length;
    expect(() => listener()).not.toThrow();
    expect(BrowserWindow.instances.length).toBe(antes);
  });

  it('encerra o app quando todas as janelas fecham (menos no macOS)', () => {
    const plataforma = process.platform;
    app.quit.mockClear();

    appListener('window-all-closed')();
    expect(app.quit).toHaveBeenCalledTimes(1);

    // No macOS quem reabre é o `activate`, então fechar não encerra nada.
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    try {
      app.quit.mockClear();
      appListener('window-all-closed')();
      expect(app.quit).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, 'platform', { value: plataforma, configurable: true });
    }
  });

  it('o activate só recria a janela quando não há nenhuma', () => {
    const antes = BrowserWindow.instances.length;
    BrowserWindow.getAllWindows.mockReturnValue([...BrowserWindow.instances]);
    appListener('activate')();
    expect(BrowserWindow.instances.length).toBe(antes);

    BrowserWindow.getAllWindows.mockReturnValueOnce([]);
    appListener('activate')();
    expect(BrowserWindow.instances.length).toBe(antes + 1);
  });
});

describe('status do Drive para o renderer', () => {
  it('para de enviar status depois que a janela é fechada', () => {
    const win = janela();
    windowEvent(win, 'closed')();
    win.webContents.send.mockClear();

    invoke('drive:disconnect');
    expect(win.webContents.send).not.toHaveBeenCalled();
  });
});

describe('F11 depois que a janela é fechada', () => {
  it('ignora o atalho sem janela viva', () => {
    const win = janela();
    windowEvent(win, 'closed')();
    win.setFullScreen.mockClear();

    globalShortcut.register.mockClear();
    appListener('browser-window-focus')();
    const toggle = globalShortcut.register.mock.calls.at(-1)?.[1];
    if (toggle === undefined) throw new Error('Callback do F11 ausente.');
    toggle();
    expect(win.setFullScreen).not.toHaveBeenCalled();
  });
});

describe('o aviso de cofre fechado chega na janela', () => {
  beforeEach(async () => {
    await openTestVault();
  });

  it('o bloqueio pedido pelo usuário avisa a tela e marca como não automático', () => {
    const win = janelaViva();
    win.webContents.send.mockClear();
    win.isDestroyed.mockReturnValue(false);

    const status = invoke('vault:lock') as { unlocked: boolean };

    expect(status.unlocked).toBe(false);
    // Sem este aviso a grade ficava com as obras descifradas e o disco sem chave.
    expect(win.webContents.send).toHaveBeenCalledWith('vault:locked', false);
  });

  it('sem janela viva o aviso é descartado, não vira exceção', () => {
    const win = janelaViva();
    windowEvent(win, 'closed')();

    expect(invoke('vault:lock')).toMatchObject({ unlocked: false });
  });

  it('janela já destruída também não leva o aviso', () => {
    const win = janelaViva();
    win.isDestroyed.mockReturnValue(true);
    win.webContents.send.mockClear();

    invoke('vault:lock');

    expect(win.webContents.send).not.toHaveBeenCalled();
    win.isDestroyed.mockReturnValue(false);
  });

  it('o auto-lock por ociosidade avisa a tela e relê o estado do drive', () => {
    const win = janelaViva();
    win.webContents.send.mockClear();

    vi.useFakeTimers();
    try {
      vaultSession.adopt(Buffer.alloc(32, 7));
      vi.advanceTimersByTime(IDLE_LOCK_MS);
      expect(vaultSession.isUnlocked()).toBe(false);
      expect(win.webContents.send).toHaveBeenCalledWith('vault:locked', true);
      // Com a sessão caída não há conta Dropbox em memória: o status recua.
      expect(invoke('drive:status')).toMatchObject({ connected: false });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('atividade da interface alimenta a janela de ociosidade', () => {
  it('vault:touch repassa o sinal para a sessão, e também guarda a origem', async () => {
    await openTestVault();
    const tocar = vi.spyOn(vaultSession, 'touch');

    expect(invoke('vault:touch')).toBeUndefined();
    expect(tocar).toHaveBeenCalledTimes(1);
    expect(vaultSession.isUnlocked()).toBe(true);
    expect(() => handler('vault:touch')(frameDe('https://evil.example/pagina'))).toThrow(
      currentMessages().errors.foreignFrame,
    );
  });
});

describe('modo desenvolvimento (ELECTRON_RENDERER_URL)', () => {
  it('a janela nasce no dev server e a navegação fica presa a ele', () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', DEV_URL);
    try {
      const win = janelaViva();
      const call = win.webContents.on.mock.calls.find((entry) => entry[0] === 'will-navigate');
      if (call === undefined) throw new Error('Listener will-navigate ausente.');
      const evento = { preventDefault: vi.fn() };

      expect(win.loadURL).toHaveBeenCalledWith(DEV_URL);
      call[1](evento, DEV_URL);
      expect(evento.preventDefault).not.toHaveBeenCalled();
      call[1](evento, 'https://exemplo.com/fora');
      expect(evento.preventDefault).toHaveBeenCalledTimes(1);

      // Em desenvolvimento quem manda na origem é o Vite, não `cronologia://`.
      expect(() => handler('drive:providers')(frameDe(`${DEV_URL}/index.html`))).not.toThrow();
      expect(() => handler('drive:providers')(FAKE_EVENT)).toThrow(
        currentMessages().errors.foreignFrame,
      );
      expect(() =>
        handler('drive:providers')(frameDe('http://outro.local:5173/index.html')),
      ).toThrow(currentMessages().errors.foreignFrame);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('encerramento', () => {
  it('zera a chave do cofre no before-quit', () => {
    vaultSession.adopt(Buffer.alloc(32, 7));
    expect(vaultSession.isUnlocked()).toBe(true);

    appListener('before-quit')();

    expect(vaultSession.isUnlocked()).toBe(false);
    expect(vaultSession.key()).toBeNull();
  });

  it('desregistra o atalho global quando a janela morre', () => {
    // O F11 é registrado no `browser-window-focus` e desregistrado no
    // `browser-window-blur`. Fechar uma janela focada **não** emite `blur`, e
    // o `will-quit` só chega depois do `quit()`, que vem do
    // `window-all-closed`: entre a janela sumir e o processo morrer, um atalho
    // global registrado é o app capturando tecla com nada na tela.
    const janelas = BrowserWindow.instances;
    const anterior = janelas.length;
    expect(anterior).toBeGreaterThan(0);
    const fechar = janelas[anterior - 1]?.on;
    globalShortcut.unregisterAll.mockClear();
    fechar?.mock.calls.find(([event]) => event === 'closed')?.[1]?.();

    expect(globalShortcut.unregisterAll).toHaveBeenCalled();
  });
});

describe('falha real de disco vira resposta, não crash', () => {
  beforeEach(async () => {
    await openTestVault();
  });

  it('library:reset conta a falha em vez de anunciar limpeza', () => {
    invoke('library:reset');
    saveLibrary([makeWork()]);
    // O shred não conseguiu abrir o arquivo: sobrou resíduo no disco.
    falhaEm('lstatSync', 'EACCES');

    expect(invoke('library:reset')).toEqual({ ok: false, shredded: 0, failed: 1 });
  });

  it('library:reset propaga erro que não é do cofre, em vez de virar contagem', () => {
    falhaEm('mkdirSync', 'ENOSPC');

    expect(() => invoke('library:reset')).toThrow('ENOSPC');
  });

  it('settings:set com o cofre fechado recusa com a mensagem localizada', () => {
    destroyVault();

    expect(() => invoke('settings:set', AJUSTES_NOVOS)).toThrow(
      currentMessages().vault.errors.vaultLocked,
    );
  });

  it('settings:set propaga erro que não é do cofre', () => {
    falhaEm('mkdirSync', 'ENOSPC');
    expect(() => invoke('settings:set', AJUSTES_NOVOS)).toThrow('ENOSPC');
  });

  it('drive:purge sem conta conectada recusa com contagem zerada, sem tocar na nuvem', async () => {
    invoke('drive:disconnect');

    const resultado = await invokeAsync<PurgeResult>('drive:purge');

    expect(resultado).toEqual({
      ok: false,
      deleted: 0,
      failed: 0,
      error: currentMessages().driveErrors.connectFirst('Dropbox'),
    });
  });

  it('falha inesperada ao criar o cofre vira vaultTampered e vai para o log', async () => {
    destroyVault();
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    falhaEm('mkdirSync', 'ENOSPC');

    const resultado = await invokeAsync<VaultResult>('vault:create', VAULT_INPUT);

    expect(resultado).toEqual({ ok: false, code: 'vaultTampered', retryInMs: 0 });
    expect(erro).toHaveBeenCalled();
  });

  it('vault:destroy apaga cofre e capas, e o acervo restante fica ilegível', () => {
    saveLibrary([makeWork()]);
    writeCoverFile('capa.png', Buffer.from('capa', 'utf-8'));

    const resultado = invoke('vault:destroy') as VaultResult;

    expect(resultado).toEqual({
      ok: true,
      status: {
        exists: false,
        unlocked: false,
        attempts: 0,
        lockUntil: 0,
        lockRemainingMs: 0,
        hasRecovery: false,
      },
    });
    expect(fs.existsSync(path.join(coversDir(), 'capa.png.enc'))).toBe(false);
    // O acervo local continua no disco, mas sem chave ficou ilegível: some da
    // tela por falta de chave, não por `[]` fingido.
    expect(fs.existsSync(path.join(dataDir(), 'library.enc'))).toBe(true);
    expect(() => invoke('library:get')).toThrow();
    // Destruir o cofre local não é o mesmo que apagar o backup na nuvem:
    // quem apaga o backup é `drive:purge`, operação separada e explícita.
    expect(invoke('vault:status')).toMatchObject({ exists: false, unlocked: false });
  });
});
