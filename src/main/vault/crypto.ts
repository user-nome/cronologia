import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { argon2id } from 'hash-wasm';
import type { CredentialKind, VaultKdfParams } from '@zero/types/vault';

/**
 * Primitivas do cofre: Argon2id (hash-wasm), AES-256-GCM e HKDF-SHA512.
 * Módulo puro de criptografia: não conhece arquivo, sessão nem UI.
 */

/**
 * Perfil de custo da senha mestra e da frase de recuperação: os dois têm
 * entropia própria (24 caracteres que o usuário pode sortear, 12+ palavras que
 * ele inventa), então um nível abaixo do PIN.
 */
export const KDF_MASTER: VaultKdfParams = { memoryKiB: 131_072, iterations: 3, parallelism: 4 };

/**
 * Perfil do PIN: 10^8 candidatas offline é o segredo mais fraco do cofre, e o
 * Argon2id é memory-hard, então o custo por tentativa é o que segura a conta.
 * Um PIN de 8 dígitos a 256 MiB por tentativa derruba qualquer ataque de
 * dicionário em disco para anos de tempo de CPU, e custa menos de um segundo
 * para quem tem o PIN certo.
 */
export const KDF_PIN: VaultKdfParams = { memoryKiB: 262_144, iterations: 4, parallelism: 4 };

/**
 * Custo do Argon2id por tipo de credencial. Só o PIN recebe o perfil caro: é o
 * único segredo cujo espaço de busca é pequeno o bastante para ser enumerado,
 * e é também o único que se digita todo dia (daí o argumento do custo por
 * tentativa valer mais aqui do que o incômodo de esperar).
 */
export function kdfProfileFor(kind: CredentialKind): VaultKdfParams {
  return kind === 'pin' ? KDF_PIN : KDF_MASTER;
}

/**
 * Faixa aceita na leitura. Existe para um container adulterado não conseguir
 * exigir memória ou CPU ilimitadas (fora da faixa o arquivo é adulterado).
 */
export const KDF_LIMITS = {
  memoryKiB: { min: 16_384, max: 1_048_576 },
  iterations: { min: 1, max: 8 },
  parallelism: { min: 1, max: 8 },
} as const;

export const MASTER_KEY_BYTES = 32;
export const SALT_BYTES = 16;
export const IV_BYTES = 16;
export const TAG_BYTES = 16;

/** Bloco cifrado: IV e tag de autenticação de 128 bits + texto cifrado. */
export interface Sealed {
  iv: Buffer;
  tag: Buffer;
  data: Buffer;
}

/** Contexto de derivação da chave de dados (separação de domínio da mestra). */
const DATA_KEY_INFO = 'cronologia/vault/data';

export function kdfParamsInRange(params: VaultKdfParams): boolean {
  return (
    params.memoryKiB >= KDF_LIMITS.memoryKiB.min &&
    params.memoryKiB <= KDF_LIMITS.memoryKiB.max &&
    params.iterations >= KDF_LIMITS.iterations.min &&
    params.iterations <= KDF_LIMITS.iterations.max &&
    params.parallelism >= KDF_LIMITS.parallelism.min &&
    params.parallelism <= KDF_LIMITS.parallelism.max
  );
}

/**
 * `true` se o custo gravado já é o perfil vigente. Usado na leitura para
 * decidir se o método merece reembrulho quando o usuário o exercita: só quem
 * detém a credencial consegue reembrulhar, então cada método sobe no próprio
 * desbloqueio.
 */
export function isSameKdf(a: VaultKdfParams, b: VaultKdfParams): boolean {
  return (
    a.memoryKiB === b.memoryKiB && a.iterations === b.iterations && a.parallelism === b.parallelism
  );
}

/** Deriva a chave de trabalho (32 bytes) de uma credencial com Argon2id. */
export async function deriveKey(
  credential: string,
  salt: Buffer,
  params: VaultKdfParams,
): Promise<Buffer> {
  const hex = await argon2id({
    password: credential,
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKiB,
    hashLength: MASTER_KEY_BYTES,
    outputType: 'hex',
  });
  return Buffer.from(hex, 'hex');
}

export function newSalt(): Buffer {
  return randomBytes(SALT_BYTES);
}

export function newMasterKey(): Buffer {
  return randomBytes(MASTER_KEY_BYTES);
}

/** Cifra `plaintext` com AES-256-GCM (IV de 128 bits por operação). */
export function seal(key: Buffer, plaintext: Buffer): Sealed {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), data };
}

/**
 * Decifra o bloco. Qualquer falha (chave errada, byte adulterado) devolve
 * `null`: leitura fail-closed, nunca texto com tag inválida.
 */
export function unseal(key: Buffer, sealed: Sealed): Buffer | null {
  if (sealed.iv.length !== IV_BYTES || sealed.tag.length !== TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, sealed.iv);
    decipher.setAuthTag(sealed.tag);
    return Buffer.concat([decipher.update(sealed.data), decipher.final()]);
  } catch {
    return null;
  }
}

/** Chave de dados do payload, derivada da mestra por HKDF-SHA512. */
export function deriveDataKey(masterKey: Buffer, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha512', masterKey, salt, DATA_KEY_INFO, MASTER_KEY_BYTES));
}
