import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type {
  AppSettings,
  BackupProviderInfo,
  BackupSummary,
  ChangeMasterInput,
  ChangePinInput,
  CreateVaultInput,
  DriveStatus,
  ElectronApi,
  LibraryReset,
  PurgeResult,
  ResetPinInput,
  UnlockInput,
  VaultDestroyResult,
  VaultResult,
  VaultStatus,
  Work,
} from '@zero/types';
import { listProviders } from '@zero/main/drive/provider';

type SaveInput = Parameters<ElectronApi['library']['save']>[0];

export interface ApiMockOptions {
  works?: Work[];
  settings?: AppSettings;
  status?: DriveStatus;
  backupInfo?: BackupSummary | null;
  providers?: BackupProviderInfo[];
  vault?: VaultStatus;
}

export interface ApiMock {
  api: ElectronApi;
  libraryGet: Mock<() => Promise<Work[]>>;
  librarySave: Mock<(work: SaveInput) => Promise<Work[]>>;
  libraryRemove: Mock<(id: string) => Promise<Work[]>>;
  libraryReset: Mock<() => Promise<LibraryReset>>;
  pickCover: Mock<() => Promise<string | null>>;
  settingsGet: Mock<() => Promise<AppSettings>>;
  settingsSet: Mock<(settings: AppSettings) => Promise<AppSettings>>;
  driveStatus: Mock<() => Promise<DriveStatus>>;
  driveProviders: Mock<() => Promise<BackupProviderInfo[]>>;
  driveAuth: Mock<() => Promise<{ ok: boolean; error?: string }>>;
  driveBackup: Mock<() => Promise<{ ok: boolean; error?: string; summary?: BackupSummary }>>;
  driveRestore: Mock<() => Promise<{ ok: boolean; error?: string; works?: number }>>;
  driveBackupInfo: Mock<() => Promise<BackupSummary | null>>;
  driveDisconnect: Mock<() => Promise<DriveStatus>>;
  drivePurge: Mock<() => Promise<PurgeResult>>;
  driveOnStatus: Mock<(callback: (status: DriveStatus) => void) => () => void>;
  emitStatus: (status: DriveStatus) => void;
  vaultStatus: Mock<() => Promise<VaultStatus>>;
  vaultCreate: Mock<(input: CreateVaultInput) => Promise<VaultResult>>;
  vaultUnlock: Mock<(input: UnlockInput) => Promise<VaultResult>>;
  vaultResetPin: Mock<(input: ResetPinInput) => Promise<VaultResult>>;
  vaultChangeMaster: Mock<(input: ChangeMasterInput) => Promise<VaultResult>>;
  vaultChangePin: Mock<(input: ChangePinInput) => Promise<VaultResult>>;
  driveSetProvider: Mock<() => Promise<{ ok: boolean; error?: string }>>;
  vaultLock: Mock<() => Promise<VaultStatus>>;
  vaultDestroy: Mock<() => Promise<VaultDestroyResult>>;
  vaultTouch: Mock<() => Promise<void>>;
  vaultOnLocked: Mock<(callback: (automatic: boolean) => void) => () => void>;
  /** `automatic = true` simula o auto-lock por ociosidade; `false`, o bloqueio manual. */
  emitVaultLocked: (automatic?: boolean) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  driveClientId: '',
  drivePassphrase: '',
  language: 'pt-BR',
  backupProvider: 'dropbox',
};

const DEFAULT_STATUS: DriveStatus = {
  connected: false,
  syncing: false,
  lastSync: null,
  lastError: null,
  accountEmail: null,
};

/**
 * Credenciais que o dublê recusa. São valores **nos formatos do app** (24
 * caracteres, 8 dígitos) e não palavras como "errada": o modal decide o método
 * pelo comprimento do que foi digitado, então um valor malformado faria o teste
 * passar por um caminho que o usuário nunca chega a percorrer.
 */
const WRONG_PIN = '00000000';
const WRONG_MASTER = 'Zq4#nW8c!Yv2@Tg7&Sh1$Fj5';

/**
 * Catálogo usado pela UI nos testes: o mesmo do processo main
 * (`drive.providers()`), com o Google Drive catalogado e não operante.
 */
const DEFAULT_PROVIDERS: BackupProviderInfo[] = listProviders().map((provider) =>
  provider.id === 'dropbox'
    ? { ...provider, operational: true, unavailableReason: null }
    : provider,
);

/**
 * Cria uma `window.api` fake com estado interno equivalente ao backend real:
 * `save` e `remove` operam sobre a mesma lista devolvida por `get`.
 */
export function createApiMock(options: ApiMockOptions = {}): ApiMock {
  let works: Work[] = [...(options.works ?? [])];
  const listeners = new Set<(status: DriveStatus) => void>();

  const libraryGet = vi.fn((): Promise<Work[]> => Promise.resolve([...works]));

  const librarySave = vi.fn((work: SaveInput): Promise<Work[]> => {
    const stored = work as Work;
    const index = works.findIndex((item) => item.id === stored.id);
    works =
      index === -1 ? [...works, stored] : works.map((item, i) => (i === index ? stored : item));
    return Promise.resolve([...works]);
  });

  const libraryRemove = vi.fn((id: string): Promise<Work[]> => {
    works = works.filter((item) => item.id !== id);
    return Promise.resolve([...works]);
  });

  const libraryReset = vi.fn((): Promise<LibraryReset> => {
    works = [];
    return Promise.resolve({ ok: true, shredded: 0, failed: 0 });
  });

  const pickCover = vi.fn((): Promise<string | null> => Promise.resolve('capa-escolhida.png'));

  const settingsGet = vi.fn((): Promise<AppSettings> =>
    Promise.resolve({
      ...DEFAULT_SETTINGS,
      ...(options.settings ?? {}),
    }),
  );

  const settingsSet = vi.fn((settings: AppSettings): Promise<AppSettings> =>
    Promise.resolve(settings),
  );

  const driveStatus = vi.fn((): Promise<DriveStatus> =>
    Promise.resolve({ ...DEFAULT_STATUS, ...(options.status ?? {}) }),
  );

  const driveProviders = vi.fn((): Promise<BackupProviderInfo[]> =>
    Promise.resolve(options.providers ?? DEFAULT_PROVIDERS),
  );

  // A troca de provedor é a única ação de Drive que devolve só `ok`: o
  // destino vem no `settings.get`, e o erro do cofre volta como `error`.
  const driveSetProvider = vi.fn((): Promise<{ ok: boolean; error?: string }> =>
    Promise.resolve({ ok: true }),
  );

  const driveAuth = vi.fn((): Promise<{ ok: boolean; error?: string }> =>
    Promise.resolve({ ok: true }),
  );

  const driveBackup = vi.fn((): Promise<{ ok: boolean; error?: string; summary?: BackupSummary }> =>
    Promise.resolve({ ok: true }),
  );

  const driveRestore = vi.fn((): Promise<{ ok: boolean; error?: string; works?: number }> =>
    Promise.resolve({ ok: true, works: 2 }),
  );

  const driveBackupInfo = vi.fn((): Promise<BackupSummary | null> =>
    Promise.resolve(options.backupInfo ?? null),
  );

  const driveDisconnect = vi.fn((): Promise<DriveStatus> =>
    Promise.resolve({
      ...DEFAULT_STATUS,
      connected: false,
    }),
  );

  const drivePurge = vi.fn((): Promise<PurgeResult> =>
    Promise.resolve({ ok: true, deleted: 0, failed: 0 }),
  );

  const driveOnStatus = vi.fn((callback: (status: DriveStatus) => void): (() => void) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  });

  // Padrão sem cofre: o gate do SettingsModal deixa os fluxos passarem.
  // Padrão: cofre criado e aberto (as ações do modal só rodam com cofre aberto).
  const DEFAULT_VAULT: VaultStatus = {
    exists: true,
    unlocked: true,
    attempts: 0,
    lockUntil: 0,
    lockRemainingMs: 0,
    hasRecovery: true,
  };
  let vault: VaultStatus = { ...DEFAULT_VAULT, ...(options.vault ?? {}) };
  const vaultListeners = new Set<(automatic: boolean) => void>();

  const vaultStatus = vi.fn((): Promise<VaultStatus> => Promise.resolve({ ...vault }));

  const vaultResult = (status: VaultStatus): VaultResult => ({ ok: true, status });

  const vaultCreate = vi.fn((input: CreateVaultInput): Promise<VaultResult> => {
    if (input.masterPassword === '' || input.pin === '' || input.recoveryPhrase === '') {
      return Promise.resolve({ ok: false, code: 'vaultWeakMaster', retryInMs: 0 });
    }
    vault = { ...vault, exists: true, unlocked: true, attempts: 0, lockUntil: 0 };
    return Promise.resolve(vaultResult({ ...vault }));
  });

  const vaultUnlock = vi.fn((input: UnlockInput): Promise<VaultResult> => {
    if (input.credential === WRONG_PIN || input.credential === WRONG_MASTER) {
      vault = {
        ...vault,
        attempts: vault.attempts + 1,
        lockUntil: Date.now() + 10_000,
        lockRemainingMs: 10_000,
      };
      const code = input.kind === 'master' ? 'vaultWrongMaster' : 'vaultWrongPin';
      return Promise.resolve({ ok: false, code, retryInMs: 10_000 });
    }
    vault = { ...vault, unlocked: true, attempts: 0, lockUntil: 0, lockRemainingMs: 0 };
    return Promise.resolve(vaultResult({ ...vault }));
  });

  const vaultResetPin = vi.fn((input: ResetPinInput): Promise<VaultResult> => {
    if (input.phrase === 'errada') {
      return Promise.resolve({ ok: false, code: 'vaultWrongRecovery', retryInMs: 10_000 });
    }
    vault = { ...vault, unlocked: true, attempts: 0, lockUntil: 0, lockRemainingMs: 0 };
    return Promise.resolve(vaultResult({ ...vault }));
  });

  const vaultChangeMaster = vi.fn((input: ChangeMasterInput): Promise<VaultResult> => {
    if (input.currentPassword === 'errada') {
      return Promise.resolve({ ok: false, code: 'vaultWrongMaster', retryInMs: 0 });
    }
    return Promise.resolve(vaultResult({ ...vault }));
  });

  const vaultChangePin = vi.fn((input: ChangePinInput): Promise<VaultResult> => {
    if (input.currentPin === 'errada') {
      return Promise.resolve({ ok: false, code: 'vaultWrongPin', retryInMs: 0 });
    }
    return Promise.resolve(vaultResult({ ...vault }));
  });

  const vaultLock = vi.fn((): Promise<VaultStatus> => {
    vault = { ...vault, unlocked: false };
    return Promise.resolve({ ...vault });
  });

  // A destruição apaga o acervo junto com o cofre, e devolve a contagem do
  // que saiu do disco: `ok: false` é falha parcial (sobrou resíduo).
  const vaultDestroy = vi.fn((): Promise<VaultDestroyResult> => {
    vault = {
      exists: false,
      unlocked: false,
      attempts: 0,
      lockUntil: 0,
      lockRemainingMs: 0,
      hasRecovery: false,
    };
    return Promise.resolve({ ok: true, shredded: 1, failed: 0, status: { ...vault } });
  });

  const vaultTouch = vi.fn((): Promise<void> => Promise.resolve());

  const vaultOnLocked = vi.fn((callback: (automatic: boolean) => void): (() => void) => {
    vaultListeners.add(callback);
    return () => vaultListeners.delete(callback);
  });

  const api: ElectronApi = {
    library: {
      get: libraryGet,
      save: librarySave,
      remove: libraryRemove,
      reset: libraryReset,
    },
    pickCover,
    settings: {
      get: settingsGet,
      set: settingsSet,
    },
    drive: {
      status: driveStatus,
      providers: driveProviders,
      setProvider: driveSetProvider,
      auth: driveAuth,
      backup: driveBackup,
      restore: driveRestore,
      backupInfo: driveBackupInfo,
      disconnect: driveDisconnect,
      purge: drivePurge,
      onStatus: driveOnStatus,
    },
    vault: {
      status: vaultStatus,
      create: vaultCreate,
      unlock: vaultUnlock,
      resetPin: vaultResetPin,
      changeMaster: vaultChangeMaster,
      changePin: vaultChangePin,
      lock: vaultLock,
      destroy: vaultDestroy,
      touch: vaultTouch,
      onLocked: vaultOnLocked,
    },
  };

  return {
    api,
    driveSetProvider,
    libraryGet,
    librarySave,
    libraryRemove,
    libraryReset,
    pickCover,
    settingsGet,
    settingsSet,
    driveStatus,
    driveProviders,
    driveAuth,
    driveBackup,
    driveRestore,
    driveBackupInfo,
    driveDisconnect,
    drivePurge,
    driveOnStatus,
    emitStatus: (status: DriveStatus): void => {
      for (const listener of listeners) listener(status);
    },
    vaultStatus,
    vaultCreate,
    vaultUnlock,
    vaultResetPin,
    vaultChangeMaster,
    vaultChangePin,
    vaultLock,
    vaultDestroy,
    vaultTouch,
    vaultOnLocked,
    emitVaultLocked: (automatic = true): void => {
      for (const listener of vaultListeners) listener(automatic);
    },
  };
}

export function installApiMock(mock: ApiMock): void {
  Object.defineProperty(window, 'api', {
    value: mock.api,
    configurable: true,
    writable: true,
  });
}
