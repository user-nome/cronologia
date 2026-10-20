import fs from 'fs';
import path from 'path';
import { isVaultError } from '@zero/main/vault/errors';
import type { VaultContainer } from '@zero/main/vault/container';
import { decodeContainer, encodeContainer } from '@zero/main/vault/container';
import { VaultError } from '@zero/main/vault/errors';
import { DIR_MODE_PRIVATE, FILE_MODE_PRIVATE } from '@zero/main/permissions';

/**
 * Arquivo do cofre: onde ele mora, como é lido e como é gravado.
 *
 * Fica separado de `vault.ts` por um motivo concreto: a cadeia de desbloqueio
 * (`unlock.ts`) precisa **persistir** a contagem de tentativas, e `vault.ts` é
 * quem chama a cadeia. Se os dois importassem a mesma função de arquivo, o
 * grafo viraria um ciclo. Aqui o I/O é dono do módulo que ninguém chama de
 * volta.
 *
 * A pasta fica em `/var/lib/.cronologia/.vault` (fora de `~`, para sobreviver
 * à limpeza do home) e é criada no `postinst`; quando o app não tem
 * permissão para criar, quem chama abre a caixinha de senha do sistema.
 */

/**
 * O cofre foi destruído nesta execução. Enquanto for `true`, nenhuma escrita
 * recria o container: é o que separa "o usuário apagou o cofre" de "o app
 * reconstruiu o arquivo e agora acusa adulteração". Só `clearDestroyedFlag`,
 * chamada por `createVault`, limpa a marca.
 */
let destroyed = false;

/** Diretório do cofre (`/var/lib/.cronologia/.vault` por padrão). */
export function vaultDir(): string {
  const override = process.env.CRONOLOGIA_VAULT_DIR;
  if (override !== undefined && override !== '') return override;
  const varLib = process.env.CRONOLOGIA_VAR_LIB;
  const base = varLib !== undefined && varLib !== '' ? varLib : '/var/lib';
  return path.join(base, '.cronologia', '.vault');
}

export function vaultPath(): string {
  return path.join(vaultDir(), 'vault.zkv');
}

export function vaultExists(): boolean {
  return fs.existsSync(vaultPath());
}

/** `true` depois de uma destruição nesta execução (sem leitura em disco). */
export function isDestroyed(): boolean {
  return destroyed;
}

/** Libera a guarda de destruição: só a criação do cofre pode fazer isso. */
export function clearDestroyedFlag(): void {
  destroyed = false;
}

/** Marca a destruição: as escritas seguintes recusam até `clearDestroyedFlag`. */
export function markDestroyed(): void {
  destroyed = true;
}

function errnoCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code: unknown = error.code;
  return typeof code === 'string' ? code : undefined;
}

/** `EACCES`/`EPERM`/`EROFS`: dá para resolver pedindo sudo (pkexec). */
export function isDirUnavailable(error: unknown): boolean {
  if (isVaultError(error)) return error.code === 'vaultDirUnavailable';
  const code = errnoCode(error);
  return code === 'EACCES' || code === 'EPERM' || code === 'EROFS';
}

/**
 * Garante a árvore do cofre com `0700`. Sem permissão de escrita lança
 * `VaultError('vaultDirUnavailable')`, que é o sinal para o chamador abrir a
 * caixinha de senha do sistema (`setupVaultDirectory`) e tentar de novo.
 */
export function ensureStructure(): void {
  const dir = vaultDir();
  try {
    fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE_PRIVATE });
    fs.chmodSync(dir, DIR_MODE_PRIVATE);
  } catch (error) {
    if (isDirUnavailable(error)) throw new VaultError('vaultDirUnavailable');
    throw error;
  }
}

/**
 * Lê o container. Ausente devolve `null`; ilegível (magic, versão, flag ou
 * truncamento) também, e o chamador traduz `null` para `vaultTampered`.
 */
export function readContainer(): VaultContainer | null {
  try {
    if (!fs.existsSync(vaultPath())) return null;
    return decodeContainer(fs.readFileSync(vaultPath()));
  } catch {
    return null;
  }
}

export { decodeContainer, encodeContainer } from '@zero/main/vault/container';

/**
 * Grava de forma atômica (`.tmp` + `rename`, `0600`) e recusa depois de uma
 * destruição: um `writeContainer` chamado depois deixaria um container pela
 * metade, sem chave, e o usuário cairia em "adulterado" em vez de "destruído".
 */
export function writeContainer(container: VaultContainer): void {
  if (destroyed) throw new VaultError('vaultDestroyed');
  ensureStructure();
  const file = vaultPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, encodeContainer(container), { mode: FILE_MODE_PRIVATE });
  // `writeFileSync` só aplica o `mode` na criação: um `.tmp` órfão de um crash
  // anterior herdaria a permissão antiga (mesmo cuidado de `jsonfile.ts`).
  try {
    fs.chmodSync(tmp, FILE_MODE_PRIVATE);
  } catch {
    // melhor esforço: gravar com a permissão mais larga é melhor que não gravar
  }
  fs.renameSync(tmp, file);
}
