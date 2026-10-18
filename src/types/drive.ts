/** Identificadores fechados dos provedores de backup catalogados no app. */
export type BackupProviderId = 'dropbox' | 'google-drive';

/**
 * Visão de um provedor para a UI. O catálogo vem do processo main
 * (`drive.providers()`), para a interface nunca duplicar o estado real.
 */
export interface BackupProviderInfo {
  id: BackupProviderId;
  label: string;
  /** true quando já é possível conectar e fazer backup neste provedor. */
  operational: boolean;
  /** Motivo da indisponibilidade; null quando o provedor está operante. */
  unavailableReason: string | null;
  /** Destino do backup na conta, em texto pronto para exibição. */
  storageTarget: string;
  /** true quando esse destino é oculto na interface do serviço (ex.: appDataFolder). */
  storageHidden: boolean;
}

/**
 * Um arquivo de backup visto pela nuvem, já normalizado.
 *
 * É o mesmo contrato para os dois provedores: o Dropbox vem de `list_folder`, o
 * Google Drive de `files.list`, e `drive/backup.ts` só conhece esta forma.
 */
export interface RemoteFile {
  /** Id opaco do arquivo na nuvem (o nome local nunca é assumido). */
  id: string;
  /** Nome remoto, que é opaco (HMAC) quando o backup tem manifesto. */
  name: string;
  /** ISO 8601 da última modificação. */
  modifiedTime: string;
  /** Tamanho em bytes, quando o provedor informa. */
  size?: number | undefined;
}

export interface DriveStatus {
  connected: boolean;
  syncing: boolean;
  lastSync: string | null;
  lastError: string | null;
  accountEmail: string | null;
}

export interface BackupSummary {
  id: string;
  name: string;
  modifiedTime: string;
  size: number;
  works: number | null;
}

/* -------------------------------------------------------------------------- */
/* Envelopes de resultado                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Resultado de uma operação de conexão (`authorize`) ou de troca de provedor.
 *
 * O app nunca lança no IPC: o `error` já vem traduzido do bundle de mensagens,
 * pronto para a barra de status. Por isso o envelope é `ok: false` + texto, e
 * não exceção. O mesmo formato é usado pelos dois provedores e por
 * `switchProvider`, que é a operação equivalente entre destinos.
 */
export interface AuthorizeResult {
  ok: boolean;
  error?: string;
}

/** Envelope de `backupNow`: o resumo só vem quando `ok` é verdadeiro. */
export interface BackupResult {
  ok: boolean;
  error?: string;
  summary?: BackupSummary;
}

/** Envelope de `restoreNow`: quantas obras voltaram do backup. */
export interface RestoreResult {
  ok: boolean;
  error?: string;
  works?: number;
}

/* -------------------------------------------------------------------------- */
/* Formas cruas da nuvem (o que o provedor devolve antes de virar `Tokens`)     */
/* -------------------------------------------------------------------------- */

/**
 * Resposta do endpoint de token, no formato cru do provedor.
 *
 * Fica em `snake_case` de propósito: é o JSON da API, não a forma do app. O
 * validador (`isTokenResponse`, em `drive/oauth-flow.ts`) confere o mínimo
 * antes de qualquer leitura, porque quem escreve é a internet.
 */
export interface TokenResponse {
  access_token: string;
  refresh_token?: string | undefined;
  expires_in: number;
  scope?: string | undefined;
}

/**
 * Token já lido da resposta crua, com os campos convertidos para a nomenclatura
 * do app. É o que `Tokens` (`drive/state.ts`) guarda, menos o que depende do
 * provedor.
 */
export interface TokenGrant {
  accessToken: string;
  refreshToken?: string | undefined;
  expiresIn: number;
  grantedScopes?: string | undefined;
}

/** Resposta do `userinfo`: o único campo que interessa é o e-mail. */
export interface AccountEmailResponse {
  email: string;
}

/**
 * Código de autorização devolvido pelo `openBrowser` do fluxo PKCE, mais a URI
 * de redirecionamento que o loopback estava escutando.
 *
 * A URI volta junto porque o provedor compara o `redirect_uri` no
 * `postToken`: sem ela, a troca do código falha com `redirect_uri_mismatch`.
 */
export interface AuthorizationCode {
  code: string;
  redirectUri: string;
}

/* -------------------------------------------------------------------------- */
/* Dropbox: `list_folder` e corpo de erro                                       */
/* -------------------------------------------------------------------------- */

/**
 * Entrada de `list_folder`.
 *
 * Tudo é opcional porque a API discrimina a entrada por `'.tag'` (`.tag: 'file'`
 * ou `.tag: 'folder'`), e uma pasta não tem `server_modified` nem `size`. Ler
 * qualquer campo antes de checar a tag é o que faria um diretório virar arquivo.
 */
export interface DropboxEntry {
  '.tag'?: string | undefined;
  id?: string | undefined;
  name?: string | undefined;
  server_modified?: string | undefined;
  size?: number | undefined;
}

/** Página de `list_folder`: a paginação é por `cursor` com `has_more` como fim. */
export interface DropboxListFolderResponse {
  entries?: DropboxEntry[] | undefined;
  cursor?: string | undefined;
  has_more?: boolean | undefined;
}

/**
 * Corpo de erro do Dropbox. O `error_summary` já vem legível da API
 * (`path/not_found/...`), então ele é repassado como está para a mensagem.
 */
export interface DropboxErrorSummary {
  error_summary: string;
}

/**
 * Nomes resolvidos de uma página do remoto: o mapa nome remoto (HMAC) → nome
 * local vem do manifesto cifrado, e `manifestId` é o arquivo que o produziu
 * (`null` quando a página é só do formato antigo, que não tem manifesto).
 */
export interface ResolvedLocalNames {
  localOf: Map<string, string>;
  manifestId: string | null;
}
