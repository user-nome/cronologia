import { MASTER_KEY_BYTES } from '@zero/main/vault/crypto';
import {
  deriveKey,
  isSameKdf,
  kdfProfileFor,
  newMasterKey,
  newSalt,
  seal,
  unseal,
} from '@zero/main/vault/crypto';
import type { WrappedKey } from '@zero/main/vault/container';
import type { CredentialKind, VaultKdfParams } from '@zero/types/vault';

/**
 * Embrulho/desembrulho da chave-mestra (Strategy por tipo de credencial).
 *
 * A chave é uma só, gerada aleatória, e quem a protege é o **embrulho**: três
 * registros AES-256-GCM, cada um cifrado por uma chave derivada com Argon2id da
 * credencial correspondente e com o custo adequado ao segredo que a protege.
 * Nenhuma das três credenciais guarda a chave; todas a recuperam, e é por isso
 * que abrir o cofre com PIN e abrir com a senha mestra chegam ao mesmo acervo.
 *
 * Consequência de segurança que vale o desenho: como a chave é aleatória e não
 * derivada da senha, trocar senha ou PIN é **reembrulhar** a mesma chave, e não
 * recifrar o acervo inteiro. Por isso o PIN pode existir sem custo extra para o
 * acervo, e por isso a frase de recuperação não é uma quarta chave: ela é o
 * embrulho que regenera o do PIN.
 */

/** Todo método que embrulha a chave, inclusive a frase de recuperação. */
export type { CredentialKind };

/**
 * Embrulhador de uma credencial: a única diferença entre os tipos é o custo do
 * Argon2id (`kdfProfileFor`), então uma hierarquia de classes seria quatro
 * subclasses idênticas sem polimorfismo nenhum.
 */
export interface KeyWrapper {
  readonly kind: CredentialKind;
  /** Custo do Argon2id deste método (lido do container, na prática). */
  readonly kdf: VaultKdfParams;
  /** Embrulha a chave para o container. */
  wrap(vaultKey: Buffer, credential: string): Promise<WrappedKey>;
  /** Chave de trabalho derivada do salt gravado no container. */
  derive(method: WrappedKey, credential: string): Promise<Buffer>;
  /** Desembrulha a chave; credencial errada devolve `null` (falha no GCM). */
  unwrap(method: WrappedKey, derived: Buffer): Buffer | null;
}

class Argon2KeyWrapper implements KeyWrapper {
  public readonly kind: CredentialKind;

  constructor(kind: CredentialKind) {
    this.kind = kind;
  }

  public get kdf(): VaultKdfParams {
    return kdfProfileFor(this.kind);
  }

  public async wrap(vaultKey: Buffer, credential: string): Promise<WrappedKey> {
    const kdfSalt = newSalt();
    const derived = await deriveKey(credential, kdfSalt, this.kdf);
    const payload = seal(derived, vaultKey);
    derived.fill(0);
    return { kdf: this.kdf, kdfSalt, payload };
  }

  public async derive(method: WrappedKey, credential: string): Promise<Buffer> {
    return deriveKey(credential, method.kdfSalt, method.kdf);
  }

  public unwrap(method: WrappedKey, derived: Buffer): Buffer | null {
    const plain = unseal(derived, method.payload);
    // A chave desembrulhada tem 32 bytes; qualquer outra forma é container
    // corrompido. Sem esta conferência, um `Buffer` de tamanho errado seria
    // aceito pela HKDF como se fosse a chave do cofre, e a falha só apareceria
    // como acervo ilegível lá adiante, muito depois do ponto do problema.
    return plain !== null && plain.length === MASTER_KEY_BYTES ? plain : null;
  }
}

/** Todo método de desbloqueio que sabe embrulhar a chave. */
const KINDS: readonly CredentialKind[] = ['master', 'pin', 'recovery'];

/**
 * Registro de embrulhadores por tipo (mesma interface, a régua muda por `kind`).
 * Acrescentar um método de desbloqueio é uma entrada nova em `KINDS`, sem tocar
 * em quem chama (desbloqueio, criação, redefinição e troca de credencial).
 */
const WRAPPERS: ReadonlyMap<CredentialKind, KeyWrapper> = new Map<CredentialKind, KeyWrapper>(
  KINDS.map((kind) => [kind, new Argon2KeyWrapper(kind)]),
);

/**
 * Resolve o embrulho pelo tipo de credencial. Tipo fora da união não existe em
 * tempo de compilação, mas o mapa é lido por nome vindo do container, então a
 * forma é reconferida aqui e um nome desconhecido é erro, nunca um caminho
 * silencioso sem custo de KDF.
 */
export function wrapperFor(kind: CredentialKind): KeyWrapper {
  const found = WRAPPERS.get(kind);
  if (found === undefined) throw new Error(`Método de desbloqueio desconhecido: ${kind}`);
  return found;
}

/** `true` se o custo gravado já é o atual (candidato a reembrulho caso contrário). */
export function isKdfCurrent(kind: CredentialKind, method: WrappedKey): boolean {
  return isSameKdf(method.kdf, kdfProfileFor(kind));
}

/** Chave-mestra nova do cofre (32 bytes aleatórios). */
export function createVaultKey(): Buffer {
  return newMasterKey();
}
