import type {
  AuthorizeResult,
  BackupProviderId,
  BackupProviderInfo,
  BackupResult,
  BackupSummary,
  DriveStatus,
  RestoreResult,
} from '@zero/types/drive';
import type { AppSettings } from '@zero/types/settings';
import type {
  ChangeMasterInput,
  ChangePinInput,
  CreateVaultInput,
  ResetPinInput,
  UnlockInput,
  VaultErrorCode,
  VaultResult,
  VaultStatus,
} from '@zero/types/vault';
import type { Work } from '@zero/types/work';

export interface ElectronApi {
  library: {
    get: () => Promise<Work[]>;
    save: (
      work: Omit<Work, 'createdAt' | 'updatedAt'> & Partial<Pick<Work, 'createdAt' | 'updatedAt'>>,
    ) => Promise<Work[]>;
    remove: (id: string) => Promise<Work[]>;
    /** Apaga o acervo inteiro (destrutivo, irreversível). */
    reset: () => Promise<LibraryReset>;
  };
  pickCover: () => Promise<string | null>;
  settings: {
    get: () => Promise<AppSettings>;
    set: (settings: AppSettings) => Promise<AppSettings>;
  };
  drive: {
    status: () => Promise<DriveStatus>;
    providers: () => Promise<BackupProviderInfo[]>;
    /**
     * Troca o destino do backup e carrega a sessão daquele provedor.
     *
     * A escolha vale na hora (e não no "Salvar" do formulário) porque o efeito
     * é visível na hora: o estado do Drive na tela inteira muda de provedor.
     * O erro vem de quem está no cofre; ver `switchProvider` em `drive/state.ts`.
     */
    setProvider: (id: BackupProviderId) => Promise<AuthorizeResult>;
    auth: () => Promise<AuthorizeResult>;
    backup: () => Promise<BackupResult>;
    restore: (passphrase: string) => Promise<RestoreResult>;
    backupInfo: () => Promise<BackupSummary | null>;
    disconnect: () => Promise<DriveStatus>;
    /** Apaga os blobs do usuário na nuvem (destrutivo, irreversível). */
    purge: () => Promise<PurgeResult>;
    onStatus: (cb: (status: DriveStatus) => void) => () => void;
  };
  vault: {
    status: () => Promise<VaultStatus>;
    /**
     * Cria o cofre com os três segredos de uma vez: senha mestra de 24
     * caracteres, PIN de 8 dígitos do dia a dia e frase de recuperação. Vêm
     * juntos porque uma chave sem PIN obriga a digitar 24 caracteres todo dia,
     * e uma frase sem valor é campo morto.
     */
    create: (input: CreateVaultInput) => Promise<VaultResult>;
    /** Abre o cofre: `kind` decide se o valor é lido como senha mestra ou PIN. */
    unlock: (input: UnlockInput) => Promise<VaultResult>;
    /** Redefine o PIN pela frase de recuperação; o cofre já sai aberto. */
    resetPin: (input: ResetPinInput) => Promise<VaultResult>;
    /** Troca a senha mestra com o cofre aberto (exige a senha atual). */
    changeMaster: (input: ChangeMasterInput) => Promise<VaultResult>;
    /** Troca o PIN do dia a dia com o cofre aberto (exige o PIN atual). */
    changePin: (input: ChangePinInput) => Promise<VaultResult>;
    lock: () => Promise<VaultStatus>;
    /** Destrói o cofre e o acervo local (destrutivo, irreversível). */
    destroy: () => Promise<VaultResult>;
    /** Registra atividade do usuário (mantém a janela de ociosidade aberta). */
    touch: () => Promise<void>;
    /**
     * Avisa quando a sessão do cofre cai. O booleano diz **por quê**:
     * `true` é o auto-lock por ociosidade (o usuário não fez nada e precisa
     * entender o que aconteceu) e `false` é o bloqueio que ele mesmo pediu.
     * A tela usa isso para não anunciar "o cofre fechou sozinho" quando foi
     * ele quem mandou fechar.
     */
    onLocked: (cb: (automatic: boolean) => void) => () => void;
  };
}

/**
 * Contagem real do que foi sobrescrito e do que falhou. `ok: false` sem
 * `code` significa **falha parcial**: parte foi apagada, parte sobrou no
 * disco. Com `code` é a recusa do cofre, que não chegou a tocar no acervo.
 */
export interface LibraryReset {
  ok: boolean;
  shredded: number;
  failed: number;
  code?: VaultErrorCode;
}

/**
 * Resultado do apagamento na nuvem. `ok: false` com `deleted > 0` significa
 * **falha parcial**: parte foi apagada, parte ficou. A UI precisa mostrar a
 * contagem, nunca um "apagado" genérico.
 */
export interface PurgeResult {
  ok: boolean;
  deleted: number;
  failed: number;
  error?: string;
}
