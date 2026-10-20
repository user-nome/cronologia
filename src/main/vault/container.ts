import type { CredentialKind, VaultKdfParams } from '@zero/types/vault';
import type { Sealed } from '@zero/main/vault/crypto';
import { IV_BYTES, SALT_BYTES, TAG_BYTES, kdfParamsInRange } from '@zero/main/vault/crypto';

/**
 * Container binário do cofre (`vault.zkv`), escrito e lido só aqui. A chave
 * mestra não é gravada em claro nem derivada de uma senha só: ela é
 * **embrulhada por cada credencial** (senha mestra, PIN e frase de recuperação)
 * e cada embrulho carrega o custo do Argon2id do segredo que o protege. É isso
 * que dá os três caminhos sem três chaves.
 *
 * ```
 * magic(8) | version(4) | createdAt(8) | attempts(4) | lockUntil(8)
 *          | flags(1) | payloadSalt(16)
 *          | [kdf(12) | kdfSalt(16) | blob] por método, na ordem dos flags
 *          | blob do payload (o salt dele é o `payloadSalt` do cabeçalho)
 * ```
 *
 * `blob` = `iv(16) | tag(16) | ctLen(4) | texto cifrado`. Os dois salts são
 * separados e cada um tem um papel: o `kdfSalt` é público e identifica o
 * método (é a entrada do Argon2id), o `payloadSalt` alimenta o HKDF da chave de
 * dados, e o IV é o nonce da operação AES, que nunca se repete.
 *
 * Toda leitura é fail-closed: forma inválida, truncamento, parâmetro KDF fora
 * da faixa, flag desconhecida ou byte a mais no fim devolvem `null`, nunca
 * conteúdo em claro.
 */

export const MAGIC = 'CHRONOS1';
export const VAULT_VERSION = 2;

/** magic(8) + versão(4) + createdAt(8) + attempts(4) + lockUntil(8) + flags(1) + payloadSalt(16). */
export const HEADER_BYTES = 49;

/** kdf(12) por método: memória, iterações e threads do Argon2id. */
const METHOD_KDF_BYTES = 12;

/** `iv(16) + tag(16) + ctLen(4)` antes do texto cifrado. */
const BLOB_HEAD_BYTES = IV_BYTES + TAG_BYTES + 4;

const FLAG_MASTER = 0x01;
const FLAG_PIN = 0x02;
const FLAG_RECOVERY = 0x04;
const FLAGS_ALL = FLAG_MASTER | FLAG_PIN | FLAG_RECOVERY;

/** Ordem de leitura: a mesma ordem em que os flags aparecem no arquivo. */
const METHODS: readonly (readonly [number, CredentialKind])[] = [
  [FLAG_MASTER, 'master'],
  [FLAG_PIN, 'pin'],
  [FLAG_RECOVERY, 'recovery'],
];

/** Teto de tentativas aceito na leitura (container adulterado não é confiável). */
const MAX_ATTEMPTS = 1_000_000;

/**
 * Chave-mestra embrulhada por uma credencial: o custo do Argon2id, o salt do
 * Argon2id e o registro cifrado com a chave derivada daquela credencial.
 */
export interface WrappedKey {
  /** Custo do Argon2id usado só neste método (o PIN é o mais caro). */
  kdf: VaultKdfParams;
  /** Salt do Argon2id (128 bits). */
  kdfSalt: Buffer;
  /** Registro cifrado com a própria chave derivada. */
  payload: Sealed;
}

/**
 * Embrulhos por credencial. Cada entrada é opcional de propósito: um cofre sem
 * PIN ainda abre pela senha mestra, e um cofre criado antes de a frase existir
 * ainda é legível.
 */
export interface VaultWrappings {
  master?: WrappedKey;
  pin?: WrappedKey;
  recovery?: WrappedKey;
}

export interface VaultContainer {
  createdAt: number;
  attempts: number;
  /** Epoch em ms; `0` = sem trava. */
  lockUntil: number;
  /** Salt do HKDF que deriva a chave de dados do payload. */
  payloadSalt: Buffer;
  /** Chave-mestra embrulhada por cada credencial. */
  methods: VaultWrappings;
  /** Segredos do app, cifrados com a chave de dados. */
  payload: Sealed;
}

function assertKdf(params: VaultKdfParams): void {
  if (!kdfParamsInRange(params)) throw new Error('KDF fora da faixa');
}

function methodBlobBytes(method: WrappedKey): number {
  return METHOD_KDF_BYTES + SALT_BYTES + BLOB_HEAD_BYTES + method.payload.data.length;
}

function writeBlob(buffer: Buffer, offset: number, block: Sealed): number {
  block.iv.copy(buffer, offset);
  block.tag.copy(buffer, offset + IV_BYTES);
  buffer.writeUInt32BE(block.data.length, offset + IV_BYTES + TAG_BYTES);
  block.data.copy(buffer, offset + BLOB_HEAD_BYTES);
  return offset + BLOB_HEAD_BYTES + block.data.length;
}

function writeMethod(buffer: Buffer, offset: number, method: WrappedKey): number {
  assertKdf(method.kdf);
  buffer.writeUInt32BE(method.kdf.memoryKiB, offset);
  buffer.writeUInt32BE(method.kdf.iterations, offset + 4);
  buffer.writeUInt32BE(method.kdf.parallelism, offset + 8);
  method.kdfSalt.copy(buffer, offset + METHOD_KDF_BYTES);
  return writeBlob(buffer, offset + METHOD_KDF_BYTES + SALT_BYTES, method.payload);
}

/** Par do leitor de blob: o que leu e onde recomeçar a ler. */
export interface BlobRead {
  block: Sealed;
  next: number;
}

function readBlob(buffer: Buffer, offset: number): BlobRead | null {
  if (offset + BLOB_HEAD_BYTES > buffer.length) return null;
  const iv = buffer.subarray(offset, offset + IV_BYTES);
  const tag = buffer.subarray(offset + IV_BYTES, offset + IV_BYTES + TAG_BYTES);
  const length = buffer.readUInt32BE(offset + IV_BYTES + TAG_BYTES);
  const start = offset + BLOB_HEAD_BYTES;
  if (start + length > buffer.length) return null;
  return { block: { iv, tag, data: buffer.subarray(start, start + length) }, next: start + length };
}

function readKdfAt(buffer: Buffer, offset: number): VaultKdfParams | null {
  if (offset + METHOD_KDF_BYTES > buffer.length) return null;
  const kdf: VaultKdfParams = {
    memoryKiB: buffer.readUInt32BE(offset),
    iterations: buffer.readUInt32BE(offset + 4),
    parallelism: buffer.readUInt32BE(offset + 8),
  };
  return kdfParamsInRange(kdf) ? kdf : null;
}

/**
 * Serializa o container. Forma inversa exata de `decodeContainer`.
 *
 * A lista de métodos presentes é calculada **uma vez** e reaproveitada nas duas
 * passagens (tamanho e escrita): recalcular significaria conferir `undefined`
 * duas vezes para um caso que a lista já excluiu, e esse `if` nunca verdadeiro
 * seria um ramo que nenhum teste consegue matar.
 */
export function encodeContainer(container: VaultContainer): Buffer {
  const presentes: [number, CredentialKind, WrappedKey][] = [];
  let flags = 0;
  let size = HEADER_BYTES + BLOB_HEAD_BYTES + container.payload.data.length;
  for (const [flag, kind] of METHODS) {
    const method = container.methods[kind];
    if (method === undefined) continue;
    flags |= flag;
    presentes.push([flag, kind, method]);
    size += methodBlobBytes(method);
  }

  const buffer = Buffer.alloc(size);
  buffer.write(MAGIC, 0, 'ascii');
  buffer.writeUInt32BE(VAULT_VERSION, 8);
  buffer.writeBigUInt64BE(BigInt(container.createdAt), 12);
  buffer.writeUInt32BE(container.attempts, 20);
  buffer.writeBigInt64BE(BigInt(container.lockUntil), 24);
  buffer.writeUInt8(flags, 32);
  container.payloadSalt.copy(buffer, 33);

  let cursor = HEADER_BYTES;
  for (const [, , method] of presentes) {
    cursor = writeMethod(buffer, cursor, method);
  }
  writeBlob(buffer, cursor, container.payload);
  return buffer;
}

/** Lê o container; qualquer anormalidade devolve `null` (fail-closed). */
export function decodeContainer(buffer: Buffer): VaultContainer | null {
  if (buffer.length < HEADER_BYTES) return null;
  if (buffer.toString('ascii', 0, 8) !== MAGIC) return null;
  if (buffer.readUInt32BE(8) !== VAULT_VERSION) return null;

  const createdAtBig = buffer.readBigUInt64BE(12);
  const lockUntilBig = buffer.readBigInt64BE(24);
  if (createdAtBig > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  if (lockUntilBig < 0n || lockUntilBig > BigInt(Number.MAX_SAFE_INTEGER)) return null;

  const flags = buffer.readUInt8(32);
  // Flag fora do conjunto é arquivo adulterado (ou de outra versão futura).
  if ((flags & ~FLAGS_ALL) !== 0) return null;

  const attempts = buffer.readUInt32BE(20);
  if (attempts > MAX_ATTEMPTS) return null;

  const methods: VaultWrappings = {};
  let cursor = HEADER_BYTES;
  for (const [flag, kind] of METHODS) {
    if ((flags & flag) === 0) continue;
    const kdf = readKdfAt(buffer, cursor);
    if (kdf === null) return null;
    cursor += METHOD_KDF_BYTES;
    if (cursor + SALT_BYTES > buffer.length) return null;
    const kdfSalt = Buffer.from(buffer.subarray(cursor, cursor + SALT_BYTES));
    cursor += SALT_BYTES;
    const read = readBlob(buffer, cursor);
    if (read === null) return null;
    methods[kind] = { kdf, kdfSalt, payload: read.block };
    cursor = read.next;
  }

  const payloadRead = readBlob(buffer, cursor);
  if (payloadRead === null) return null;
  if (payloadRead.next !== buffer.length) return null;
  // Sem o embrulho da senha mestra não há chave para abrir nada: é a única
  // recusa por forma, e não por conteúdo.
  if (methods.master === undefined) return null;

  return {
    createdAt: Number(createdAtBig),
    attempts,
    lockUntil: Number(lockUntilBig),
    payloadSalt: Buffer.from(buffer.subarray(33, 33 + SALT_BYTES)),
    methods,
    payload: payloadRead.block,
  };
}
