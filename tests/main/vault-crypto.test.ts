import { describe, expect, it, vi } from 'vitest';

/**
 * Este arquivo é o **único** que mede o Argon2id de verdade: desfaz o mock
 * global de `tests/mock-kdf.ts` para que o custo real seja exercitado pelo menos
 * uma vez. Se a integração com `hash-wasm` quebrar (nome da opção, tipo do
 * `outputType`, tamanho do digest), é aqui que a suíte percebe.
 *
 * O `argon2id` importado abaixo é a prova de que o desfazimento funcionou: o
 * teste compara a derivação do app com a da biblioteca, e um stand-in de SHA-256
 * jamais devolveria o mesmo valor.
 */
vi.mock('hash-wasm', (importOriginal) => importOriginal());

import { argon2id } from 'hash-wasm';

import {
  KDF_LIMITS,
  KDF_MASTER,
  KDF_PIN,
  MASTER_KEY_BYTES,
  deriveDataKey,
  deriveKey,
  isSameKdf,
  kdfParamsInRange,
  kdfProfileFor,
  newMasterKey,
  newSalt,
  seal,
  unseal,
} from '@zero/main/vault/crypto';

/** Perfil barato para a suíte: o cofre de produção usa `KDF_MASTER`/`KDF_PIN`. */
export const FAST_KDF = { memoryKiB: 16_384, iterations: 1, parallelism: 1 };

describe('vault/crypto: perfis de custo do Argon2id', () => {
  it('o PIN recebe o perfil mais caro que a senha mestra', () => {
    expect(kdfProfileFor('pin')).toEqual(KDF_PIN);
    expect(kdfProfileFor('master')).toEqual(KDF_MASTER);
    expect(kdfProfileFor('recovery')).toEqual(KDF_MASTER);
    // O PIN é 10^8 candidatas offline: é o único segredo do cofre que dá para
    // enumerar, então é o único que recebe o custo máximo.
    expect(KDF_PIN.memoryKiB).toBeGreaterThan(KDF_MASTER.memoryKiB);
  });

  it('os dois perfis ficam dentro da faixa aceita na leitura', () => {
    expect(kdfParamsInRange(KDF_PIN)).toBe(true);
    expect(kdfParamsInRange(KDF_MASTER)).toBe(true);
    expect(KDF_PIN.memoryKiB).toBeLessThanOrEqual(KDF_LIMITS.memoryKiB.max);
  });

  it('isSameKdf compara os três campos, e só eles', () => {
    expect(isSameKdf(KDF_PIN, { ...KDF_PIN })).toBe(true);
    expect(isSameKdf(KDF_PIN, KDF_MASTER)).toBe(false);
    expect(isSameKdf(KDF_PIN, { ...KDF_PIN, iterations: KDF_PIN.iterations + 1 })).toBe(false);
    expect(isSameKdf(KDF_PIN, { ...KDF_PIN, parallelism: KDF_PIN.parallelism + 1 })).toBe(false);
  });
});

describe('vault/crypto: derivação e cifra', () => {
  it('deriveKey é determinística para a mesma credencial, salt e parâmetros', async () => {
    const salt = newSalt();
    const a = await deriveKey('senha longa de teste 123', salt, FAST_KDF);
    const b = await deriveKey('senha longa de teste 123', salt, FAST_KDF);
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBe(MASTER_KEY_BYTES);
  });

  it('deriveKey bate com o Argon2id da biblioteca, opção por opção', async () => {
    // A prova de que o mock global está desfeito neste arquivo: a derivação do
    // app tem de ser exatamente a da biblioteca, com o mesmo `outputType` e o
    // mesmo `hashLength`. Um stand-in de SHA-256 jamais daria este valor.
    const salt = newSalt();
    const esperado = await argon2id({
      password: 'senha longa de teste 123',
      salt,
      parallelism: FAST_KDF.parallelism,
      iterations: FAST_KDF.iterations,
      memorySize: FAST_KDF.memoryKiB,
      hashLength: MASTER_KEY_BYTES,
      outputType: 'hex',
    });
    expect((await deriveKey('senha longa de teste 123', salt, FAST_KDF)).toString('hex')).toBe(
      esperado,
    );
  });

  it('deriveKey muda com a credencial e com o salt', async () => {
    const salt = newSalt();
    const a = await deriveKey('senha longa de teste 123', salt, FAST_KDF);
    const b = await deriveKey('outra senha longa de teste', salt, FAST_KDF);
    const c = await deriveKey('senha longa de teste 123', newSalt(), FAST_KDF);
    expect(a.equals(b)).toBe(false);
    expect(a.equals(c)).toBe(false);
  });

  it('seal/unseal faz roundtrip do texto cifrado', () => {
    const key = newMasterKey();
    const sealed = seal(key, Buffer.from('conteúdo sigiloso', 'utf-8'));
    const opened = unseal(key, sealed);
    expect(opened?.toString('utf-8')).toBe('conteúdo sigiloso');
    expect(sealed.data.toString('utf-8')).not.toContain('sigiloso');
  });

  it('unseal devolve null com o dado adulterado', () => {
    const key = newMasterKey();
    const sealed = seal(key, Buffer.from('conteúdo sigiloso', 'utf-8'));
    sealed.data[0] = (sealed.data[0] ?? 0) ^ 0xff;
    expect(unseal(key, sealed)).toBeNull();
  });

  it('unseal devolve null com a tag adulterada, IV curto ou chave errada', () => {
    const key = newMasterKey();
    const sealed = seal(key, Buffer.from('conteúdo sigiloso', 'utf-8'));
    sealed.tag[0] = (sealed.tag[0] ?? 0) ^ 0xff;
    expect(unseal(key, sealed)).toBeNull();
    expect(unseal(key, { ...sealed, iv: Buffer.alloc(8) })).toBeNull();
    expect(unseal(newMasterKey(), seal(key, Buffer.from('x')))).toBeNull();
  });

  it('deriveDataKey é determinística, distinta da mestra e ligada ao salt', () => {
    const master = newMasterKey();
    const salt = newSalt();
    const dataKey = deriveDataKey(master, salt);
    expect(dataKey.equals(deriveDataKey(master, salt))).toBe(true);
    expect(dataKey.equals(master)).toBe(false);
    // O `payloadSalt` mora no cabeçalho do container, então trocar a senha (que
    // só troca um embrulho) não pode mudar a chave de dados do acervo.
    expect(dataKey.equals(deriveDataKey(master, newSalt()))).toBe(false);
    expect(dataKey.length).toBe(MASTER_KEY_BYTES);
  });

  it('kdfParamsInRange aceita a faixa e recusa fora dela', () => {
    expect(kdfParamsInRange(KDF_MASTER)).toBe(true);
    expect(kdfParamsInRange(FAST_KDF)).toBe(true);
    expect(kdfParamsInRange({ memoryKiB: 8_192, iterations: 1, parallelism: 1 })).toBe(false);
    expect(kdfParamsInRange({ memoryKiB: 2_097_152, iterations: 1, parallelism: 1 })).toBe(false);
    expect(kdfParamsInRange({ memoryKiB: 65_536, iterations: 0, parallelism: 1 })).toBe(false);
    expect(kdfParamsInRange({ memoryKiB: 65_536, iterations: 9, parallelism: 1 })).toBe(false);
    expect(kdfParamsInRange({ memoryKiB: 65_536, iterations: 2, parallelism: 0 })).toBe(false);
    expect(kdfParamsInRange({ memoryKiB: 65_536, iterations: 2, parallelism: 9 })).toBe(false);
  });
});
