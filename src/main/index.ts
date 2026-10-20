import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import {
  Menu,
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  session,
} from 'electron';
import {
  cacheDir,
  configDir,
  coversDir,
  dataDir,
  deleteWork,
  importCover,
  loadLibrary,
  resetLibrary,
  shredLibrary,
  upsertWork,
} from '@zero/main/library';
import { loadSettings, saveSettings } from '@zero/main/settings';
import {
  authorize,
  backupInfo,
  backupNow,
  disconnect,
  emit,
  getStatus,
  initDrive,
  listProviders,
  loadState,
  onStatus,
  purgeRemote,
  restoreNow,
  switchProvider,
} from '@zero/main/drive';
import {
  changeMasterPassword,
  changePin,
  createVault,
  destroyVault,
  isVaultError,
  lockVault,
  resetPin,
  unlockVault,
  vaultSession,
  vaultStatus,
} from '@zero/main/vault';
import { runDiskCleanup } from '@zero/main/cleanup';
import { currentMessages } from '@zero/main/i18n';
import { openExternalSafe } from '@zero/main/external';
import { appPageUrl, registerAppProtocol, registerCoverProtocol } from '@zero/main/protocols';
import type {
  AppSettings,
  BackupProviderId,
  ChangeMasterInput,
  ChangePinInput,
  CreateVaultInput,
  DriveStatus,
  IpcFrameEvent,
  LibraryReset,
  PurgeResult,
  ResetPinInput,
  UnlockInput,
  Untrusted,
  VaultDestroyResult,
  VaultResult,
  VaultStatus,
  Work,
} from '@zero/types';

app.setPath('userData', cacheDir());

/** Diretórios XDG do app no boot (cada escrita também recria os seus). */
(function ensureAppDirs(): void {
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.mkdirSync(configDir(), { recursive: true });
    coversDir();
  } catch {
    // melhor esforço: settings e library recriam no primeiro uso
  }
})();

let mainWindow: BrowserWindow | null = null;

/**
 * O preload é emitido como `.cjs` (CommonJS) porque o Electron executa preload
 * **sandboxed** como script simples, sem loader ESM; `format: 'cjs'` está fixado
 * em `electron.vite.config.mts`. Resolve o que existir no bundle gerado.
 */
function preloadScript(): string {
  const dir = path.join(__dirname, '../preload');
  const found = ['index.cjs', 'index.mjs', 'index.js']
    .map((name) => path.join(dir, name))
    .find((file) => fs.existsSync(file));
  return found ?? path.join(dir, 'index.cjs');
}

/**
 * Tamanho da janela, em px.
 *
 * O tamanho inicial acompanha uma tela de notebook (1200x800 fica bem em
 * 1366x768 e em 1600x900). Os mínimos são pequenos o bastante para caber em
 * meia/quarta tela, porque o tiling do Cinnamon/Muffin recusa encaixar a janela
 * se o mínimo não couber no retângulo: metade de 1600x900 dá 800x430 e de
 * 1366x768 dá 683x364.
 */
const WINDOW_SIZE = {
  width: 1200,
  height: 800,
  minWidth: 520,
  minHeight: 360,
} as const;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: WINDOW_SIZE.width,
    height: WINDOW_SIZE.height,
    minWidth: WINDOW_SIZE.minWidth,
    minHeight: WINDOW_SIZE.minHeight,
    title: 'Cronologia',
    backgroundColor: '#000000',
    icon: nativeImage.createFromPath(path.join(__dirname, '../../build/icon.png')),
    show: false,
    webPreferences: {
      preload: preloadScript(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // Em produção o DevTools fica de fora: o atalho não expõe o renderer.
      devTools: !app.isPackaged,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });

  // O app é uma SPA local: navegação só vale para a própria página (o reload
  // mantém a mesma URL); qualquer salto para outra URL é recusado.
  // A URL da página vem de `appPageUrl()`: a mesma base que `isAppFrameUrl`
  // confere antes de cada handler IPC. As duas guardas precisam concordar.
  const targetUrl = appPageUrl();
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== targetUrl) event.preventDefault();
  });

  void mainWindow.loadURL(targetUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
    // O atalho global do F11 é registrado no focus e desregistrado no blur.
    // Fechar uma janela **focada** não emite `blur`, então sem esta linha o
    // registro sobrevive no sistema até o `will-quit`, e um `before-quit` que
    // segure o encerramento deixaria o app capturando F11 sem janela na tela.
    globalShortcut.unregisterAll();
  });
}

/**
 * Nega toda permissão web do renderer (mídia, geolocalização, notificações…);
 * só o clipboard passa, usado pelo modal de doação para copiar o link.
 */
function registerPermissionPolicy(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'clipboard-read' || permission === 'clipboard-sanitized-write');
  });
}

/**
 * Só aceita URL da página oficial do app: dev server do Vite em dev, ou o
 * scheme `cronologia://` em produção. Qualquer frame fora desse host (ex.: um
 * `<webview>` injetado) é bloqueado antes do handler de domínio rodar.
 *
 * Compara protocolo/host/porta e **não** o caminho: um frame de dev é
 * `http://localhost:5173/index.html` e um reload pode legitimately levar barra,
 * mas o host tem de ser o mesmo. A base vem de `appPageUrl()`, a mesma função
 * que a `will-navigate` da janela usa, para as duas guardas não divergirem.
 */
function isAppFrameUrl(url: string | undefined): boolean {
  if (url === undefined) return false;
  try {
    const frame = new URL(url);
    const expected = new URL(appPageUrl());
    return (
      frame.protocol === expected.protocol &&
      frame.host === expected.host &&
      frame.port === expected.port
    );
  } catch {
    return false;
  }
}

/**
 * Recusa IPC cujo emissor não é a página oficial do app (scheme `cronologia://`
 * em produção ou dev server do Vite em dev). Requer `event.senderFrame`.
 *
 * O evento entra como `IpcFrameEvent`: o tipo real do Electron é um superconjunto
 * deste, então ele atravessa a função sem `as`. O que fica `unknown` é a URL, e é
 * a decisão certa: ela só vira string depois de `isAppFrameUrl` conferir.
 *
 * A mensagem sai do bundle porque este erro **atravessa o IPC**: chega ao
 * renderer como `Error` rejeitado, igual aos outros, e a pessoa pode estar no
 * idioma escolhido.
 */
function assertAppFrame(event: IpcFrameEvent | null | undefined): void {
  const url = event?.senderFrame?.url;
  if (!isAppFrameUrl(typeof url === 'string' ? url : undefined)) {
    throw new Error(currentMessages().errors.foreignFrame);
  }
}

/**
 * Converte o `VaultError` do domínio no envelope de resposta dos canais de
 * cofre (o main nunca lança no IPC: o renderer localiza `code` no bundle).
 */
function vaultFailure(error: Untrusted): VaultResult {
  if (isVaultError(error)) {
    return { ok: false, code: error.code, retryInMs: error.retryInMs ?? 0 };
  }
  console.error('Erro inesperado no cofre:', error);
  return { ok: false, code: 'vaultTampered', retryInMs: 0 };
}

/**
 * Erro do cofre como o renderer consegue ler.
 *
 * O código do domínio (`libraryTampered`, `vaultLocked`) não sobrevive ao IPC:
 * o renderer recebe só a mensagem, e a mensagem crua
 * (`VaultError: libraryTampered`) não diz nada para quem lê a tela. Nos canais
 * que **lançam** (o acervo e as settings), a mensagem sai no idioma vigente,
 * como o resto do app.
 *
 * Erro que não é do cofre passa intacto, com a pilha dele: aqui só se traduz o
 * que se sabe traduzir.
 */
function localizedError(error: Untrusted): unknown {
  if (isVaultError(error)) {
    return new Error(currentMessages().vault.errors[error.code], { cause: error });
  }
  return error;
}

function registerIpc(): void {
  ipcMain.handle('library:get', (event): Work[] => {
    assertAppFrame(event);
    try {
      return loadLibrary();
    } catch (error) {
      // Acervo ilegível é falha fechada: a mensagem vai localizada para a tela
      // e o acervo continua no disco (nada foi apagado).
      throw localizedError(error);
    }
  });

  ipcMain.handle('library:save', (event, work: Work): Work[] => {
    assertAppFrame(event);
    try {
      return upsertWork(work);
    } catch (error) {
      throw localizedError(error);
    }
  });

  ipcMain.handle('library:delete', (event, id: string): Work[] => {
    assertAppFrame(event);
    try {
      return deleteWork(id);
    } catch (error) {
      throw localizedError(error);
    }
  });

  // Destrutivo: apaga todo o acervo sobrescrevendo. Devolve a contagem real,
  // nunca um "foi" genérico.
  ipcMain.handle('library:reset', (event): LibraryReset => {
    assertAppFrame(event);
    try {
      const { shredded, failed } = resetLibrary();
      // Falha parcial é contada, não enfeitada: sobrou resíduo no disco e a
      // interface precisa poder dizer isso.
      return failed > 0 ? { ok: false, shredded, failed } : { ok: true, shredded, failed };
    } catch (error) {
      if (isVaultError(error)) {
        return { ok: false, shredded: 0, failed: 0, code: error.code };
      }
      throw error;
    }
  });

  ipcMain.handle('cover:pick', async (event): Promise<string | null> => {
    assertAppFrame(event);
    const m = currentMessages();
    const options = {
      title: m.dialogs.pickCover,
      properties: ['openFile' as const],
      filters: [
        {
          name: m.dialogs.imageFilter,
          extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'],
        },
      ],
    };
    const window = BrowserWindow.fromWebContents(event.sender);
    const result =
      window !== null
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
    const first = result.filePaths[0];
    if (result.canceled || first === undefined || first === '') return null;
    return importCover(first);
  });

  ipcMain.handle('settings:get', (event): AppSettings => {
    assertAppFrame(event);
    return loadSettings();
  });

  // Grava idioma no disco e segredos no cofre: exige cofre aberto (a UI abre
  // antes), então a rejeição vira mensagem localizada em vez de erro cru.
  ipcMain.handle('settings:set', (event, settings: AppSettings): AppSettings => {
    assertAppFrame(event);
    try {
      // A janela não tem campo de App key: `''` ali significa "sem campo",
      // não "limpar". Mantém a chave já gravada no cofre (override gravado
      // por fora, de desenvolvimento; ver `docs/dropbox.md` §1).
      const driveClientId =
        settings.driveClientId === '' ? loadSettings().driveClientId : settings.driveClientId;
      return saveSettings({ ...settings, driveClientId });
    } catch (error) {
      throw localizedError(error);
    }
  });

  ipcMain.handle('drive:status', (event): DriveStatus => {
    assertAppFrame(event);
    return getStatus();
  });
  ipcMain.handle('drive:providers', (event) => {
    assertAppFrame(event);
    return listProviders();
  });
  ipcMain.handle('drive:set-provider', (event, id: BackupProviderId) => {
    assertAppFrame(event);
    // O catálogo fecha a lista de ids (`BackupProviderId`), e `switchProvider`
    // normaliza o que não reconhecer de volta ao Dropbox, então um id forjado
    // não consegue apontar o backup para fora do catálogo.
    return switchProvider(id);
  });
  ipcMain.handle('drive:auth', (event) => {
    assertAppFrame(event);
    return authorize();
  });
  ipcMain.handle('drive:backup', (event) => {
    assertAppFrame(event);
    return backupNow();
  });
  ipcMain.handle('drive:restore', (event, passphrase: string) => {
    assertAppFrame(event);
    return restoreNow(passphrase);
  });
  ipcMain.handle('drive:backup-info', (event) => {
    assertAppFrame(event);
    return backupInfo();
  });
  ipcMain.handle('drive:disconnect', (event): DriveStatus => {
    assertAppFrame(event);
    return disconnect();
  });
  ipcMain.handle('drive:purge', async (event): Promise<PurgeResult> => {
    assertAppFrame(event);
    return purgeRemote();
  });

  // Com o cofre criado/desbloqueado o estado do drive é relido: os tokens
  // podem ter migrado para dentro e o renderer recebe o status novo.
  const reloadDriveState = (): void => {
    loadState();
    emit();
  };

  ipcMain.handle('vault:status', (event): VaultStatus => {
    assertAppFrame(event);
    return vaultStatus();
  });

  ipcMain.handle('vault:create', async (event, input: CreateVaultInput): Promise<VaultResult> => {
    assertAppFrame(event);
    try {
      const status = await createVault(input);
      reloadDriveState();
      return { ok: true, status };
    } catch (error) {
      return vaultFailure(error);
    }
  });

  ipcMain.handle('vault:unlock', async (event, input: UnlockInput): Promise<VaultResult> => {
    assertAppFrame(event);
    try {
      const status = await unlockVault(input);
      reloadDriveState();
      return { ok: true, status };
    } catch (error) {
      return vaultFailure(error);
    }
  });

  /**
   * Recuperação do PIN esquecido: prova posse da frase e reembrulha a chave
   * com o PIN novo. O cofre já sai aberto, então o estado do drive é relido
   * igual ao desbloqueio.
   */
  ipcMain.handle('vault:reset-pin', async (event, input: ResetPinInput): Promise<VaultResult> => {
    assertAppFrame(event);
    try {
      const status = await resetPin(input);
      reloadDriveState();
      return { ok: true, status };
    } catch (error) {
      return vaultFailure(error);
    }
  });

  /**
   * Troca de credencial com o cofre aberto. Não recarrega o drive nem a
   * biblioteca: a chave-mestra não muda (ela é aleatória, não derivada da
   * senha), então trocar senha ou PIN só reescreve um embrulho do container.
   */
  ipcMain.handle(
    'vault:change-master',
    async (event, input: ChangeMasterInput): Promise<VaultResult> => {
      assertAppFrame(event);
      try {
        return { ok: true, status: await changeMasterPassword(input) };
      } catch (error) {
        return vaultFailure(error);
      }
    },
  );

  ipcMain.handle('vault:change-pin', async (event, input: ChangePinInput): Promise<VaultResult> => {
    assertAppFrame(event);
    try {
      return { ok: true, status: await changePin(input) };
    } catch (error) {
      return vaultFailure(error);
    }
  });

  ipcMain.handle('vault:lock', (event): VaultStatus => {
    assertAppFrame(event);
    const status = lockVault();
    // Com o cofre fechado a sessão do Dropbox não sobrevive em memória.
    reloadDriveState();
    // O acervo é cifrado com a chave do cofre, então fechar o cofre tem o mesmo
    // efeito na tela que o auto-lock: a biblioteca some e a barreira volta a
    // pedir a senha. Sem este aviso, um bloqueio pedido pelo próprio usuário
    // deixava as obras descifradas na grade, com o disco já sem chave.
    notifyVaultLocked(false);
    return status;
  });

  // Destrutivo: apaga o cofre e o acervo local. O acervo é sobrescrito e apagado
  // na mesma operação, porque a chave-mestra morre junto: sem chave ele já é
  // irrecuperável (Cryptographic Erase), e um `library.enc` sobrevivente seria
  // ilegível para o cofre novo. O backup na nuvem **não** é tocado aqui: é
  // `drive:purge`, operação separada e explícita.
  ipcMain.handle('vault:destroy', (event): VaultDestroyResult => {
    assertAppFrame(event);
    // O acervo sai do disco **antes** do cofre: a chave morre na mesma
    // operação, e a biblioteca que sobrasse seria ilegível para o cofre novo
    // (viraria `libraryTampered` na primeira abertura) — além de continuar no
    // disco, contra o que a tela promete ao usuário.
    const acervo = shredLibrary();
    destroyVault();
    reloadDriveState();
    return {
      ok: acervo.failed === 0,
      shredded: acervo.shredded,
      failed: acervo.failed,
      status: vaultStatus(),
    };
  });

  /**
   * Avisa a janela que a sessão do cofre caiu. `automatic` distingue o auto-lock
   * por ociosidade do bloqueio que o próprio usuário pediu, para a tela não
   * anunciar "fechou sozinho" no segundo caso.
   */
  function notifyVaultLocked(automatic: boolean): void {
    if (mainWindow === null || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('vault:locked', automatic);
  }

  vaultSession.onAutoLock(() => {
    reloadDriveState();
    notifyVaultLocked(true);
  });

  // Atividade da interface alimenta a janela de ociosidade do cofre. O
  // throttling fica na sessão (`touch`): aqui é só repassar o sinal.
  ipcMain.handle('vault:touch', (event): void => {
    assertAppFrame(event);
    vaultSession.touch();
  });

  onStatus((status) => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('drive:status-changed', status);
    }
  });
}

/**
 * Sem barra de menus (sem File/Edit/View): o menu da aplicação é removido por
 * completo em vez de escondido.
 */
function removeApplicationMenu(): void {
  Menu.setApplicationMenu(null);
}

/**
 * F11 alterna a tela cheia sem precisar de barra de menus. O atalho só vale
 * com a janela focada, para não sequestrar a tecla de outros aplicativos.
 */
function toggleFullscreen(): void {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
}

function registerFullscreenShortcut(): void {
  app.on('browser-window-focus', () => {
    globalShortcut.register('F11', toggleFullscreen);
  });
  app.on('browser-window-blur', () => {
    globalShortcut.unregister('F11');
  });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}

/**
 * Apaga a chave-mestra do cofre da memória antes do processo morrer
 * (`before-quit`, antes do `will-quit` do atalho F11; ver `docs/cofre.md`).
 */
function registerVaultShutdown(): void {
  app.on('before-quit', () => {
    vaultSession.dispose();
  });
}

/**
 * Inicialização em passos isolados: o que toca disco ou a nuvem não pode
 * deixar o app sem janela (um EIO/EACCES vira `error` no log e o app segue
 * no modo que conseguir); só a falha na própria janela encerra o processo,
 * com caixa de erro, em vez de ficar um processo sem interface.
 */
function initApp(): void {
  // Manutenção de disco antes de qualquer handler responder. Não pode derrubar
  // o app: `runDiskCleanup` engole a própria falha de propósito.
  runDiskCleanup();

  registerCoverProtocol();
  registerAppProtocol();
  registerIpc();
  try {
    initDrive();
  } catch (error) {
    console.error('Falha ao inicializar o backup em nuvem:', error);
  }
  removeApplicationMenu();
  registerPermissionPolicy();
  registerFullscreenShortcut();
  registerVaultShutdown();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow !== null) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app
    .whenReady()
    .then(initApp)
    .catch((error: unknown) => {
      console.error('Falha ao iniciar o aplicativo:', error);
      dialog.showErrorBox('Cronologia', currentMessages().app.startupFailed(String(error)));
      app.quit();
    });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
