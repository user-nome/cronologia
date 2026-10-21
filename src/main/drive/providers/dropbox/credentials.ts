/**
 * App key do cliente Dropbox, injetada apenas no bundle main pelo Vite.
 *
 * A App key é pública por definição em um cliente desktop e pode ser extraída
 * do binário; o refresh token do usuário permanece no cofre.
 */
export function dropboxAppKey(): string {
  return (process.env.DROPBOX_APP_KEY ?? '').trim();
}
