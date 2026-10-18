/**
 * Credenciais do app Google Drive Desktop, injetadas no build.
 *
 * O `electron.vite.config.mts` substitui `process.env.GOOGLE_CLIENT_ID` e
 * `process.env.GOOGLE_CLIENT_SECRET` por literais no bundle do `main` (ver
 * `googleCredentials` lá), lendo o `.env` local e o `process.env` do CI. O
 * repositório público, portanto, nunca guarda credencial: no release elas vêm
 * dos GitHub Secrets e só existem dentro do binário instalado.
 *
 * **O `client secret` não é um segredo**, e o código diz isso em vez de
 * fingir o contrário. Um app desktop distribuído é um *cliente público* na
 * definição da RFC 6749: qualquer um que baixe o pacote pode extrair o par do
 * binário, e o Google trata o valor como não confidencial justamente por isso.
 * O que protege a conta do usuário é o consentimento no navegador e o **PKCE**
 * (`code_verifier` gerado aqui e exigido na troca, ver `oauth-flow.ts`). O
 * controle real é a revisão de escopos no painel do Google, não este valor.
 *
 * Leitura por função, e não no topo do módulo: assim um teste consegue mudar o
 * ambiente antes de perguntar, e o binário recebe o valor já chumbado.
 */

/** `client_id` do app no Google Cloud (`.apps.googleusercontent.com`). */
export function googleClientId(): string {
  return (process.env.GOOGLE_CLIENT_ID ?? '').trim();
}

/** `client_secret` do mesmo app. Não confidencial, como o comentário explica. */
export function googleClientSecret(): string {
  return (process.env.GOOGLE_CLIENT_SECRET ?? '').trim();
}

/**
 * true quando o build traz credencial do Google Drive.
 *
 * É o que separa "provedor catalogado" de "provedor conectável": um build sem
 * as variáveis (dev, `npm ci` limpo) mostra o Google Drive como não operante,
 * com o motivo real em vez de uma falha de OAuth na hora de conectar.
 */
export function hasGoogleCredentials(): boolean {
  return googleClientId() !== '';
}
