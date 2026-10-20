/**
 * Permissões de arquivo e de pasta do app.
 *
 * Tudo que o app grava é do usuário e só dele: `0600` para arquivo e `0700` para
 * pasta. O número mora aqui porque ele aparece em cinco lugares
 * (`store-crypto.ts`, `vault/store.ts`, `jsonfile.ts`, `settings.ts` e o
 * `postinst` do `.deb`), e uma permissão errada em um deles é discreta: o
 * acervo cifrado vaza para o resto da máquina, ou a pasta do cofre abre para
 * quem estiver no mesmo grupo.
 *
 * `0600` é o mínimo do arquivo: o app é o dono e ninguém mais lê. `0700` é o
 * mínimo da pasta: só o dono entra, lista e cria dentro dela.
 */

/** Arquivo legível e gravável só pelo dono (acervo, cofre, settings). */
export const FILE_MODE_PRIVATE = 0o600;

/** Pasta acessível só pelo dono (pasta do cofre, pasta das capas). */
export const DIR_MODE_PRIVATE = 0o700;
