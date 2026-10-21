/**
 * Constantes do provedor Google Drive.
 *
 * Endpoints, escopo e o que muda em relação ao Dropbox estão comentados
 * aqui; o desenho completo do provedor está em `docs/backup-providers.md`.
 */

/** Tela de consentimento do Google (OAuth 2.0, endpoint legado estável). */
export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

/** Endpoint de token do Google (trocado de host em 2022; o antigo depreciou). */
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** API do Drive v3. */
export const GOOGLE_DRIVE_ENDPOINT = 'https://www.googleapis.com/drive/v3';

/**
 * Upload simples (media) do Drive v3, que aceita corpo bruto e é o suficiente
 * para os blobs cifrados deste backup.
 */
export const GOOGLE_UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';

/** E-mail da conta conectada, para a barra de status. */
export const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

/**
 * Escopos pedidos, no mínimo do necessário.
 *
 * `drive.appdata` é o único que dá acesso à pasta oculta do app
 * (`appDataFolder`), que é onde o backup mora: ele **não** enxerga o Drive do
 * usuário. `userinfo.email` só serve para mostrar de quem é a conta conectada.
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

/**
 * Versão do escopo pedido; mudança invalida a sessão salva (reconexão
 * obrigatória). É independente da versão do Dropbox: os dois provedores têm
 * as suas próprias versões.
 */
export const GOOGLE_SCOPE_VERSION = 1;

/** Desconto de renovação: o access token se considera velho 60 s antes do fim. */
export const GOOGLE_TOKEN_MARGIN_MS = 60_000;

/**
 * Passo do callback no servidor local.
 *
 * Não há porta fixa aqui, ao contrário do Dropbox: para clientes *Desktop* o
 * Google aceita `http://localhost` em **qualquer** porta, sem cadastrar
 * cada uma no painel. O app sempre sobe em porta efêmera (sobe com `0`).
 */
export const GOOGLE_LOOPBACK_PATH = '/callback';
