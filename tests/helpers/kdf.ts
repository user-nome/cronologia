import { createHash } from 'node:crypto';

/**
 * Argon2id de mentira para a suíte, fora do registro de mocks do Vitest.
 *
 * O cofre de produção deriva com 128 MiB na senha mestra e 256 MiB no PIN
 * (medido nesta máquina: 0,8 s e 2,1 s por operação), e a suíte abre e fecha o
 * cofre dezenas de vezes. Aqui o KDF vira um SHA-256 com o salt e a senha:
 * continua assíncrono, determinístico, sensível ao salt, e devolve exatamente o
 * tamanho pedido — só não custa memória.
 *
 * Vive num helper (e não dentro do `vi.mock`) porque dois lugares precisam
 * dele: o mock global de `tests/mock-kdf.ts` e o mock local de
 * `tests/main/vault-unlock.test.ts`, que precisa fazer a derivação **falhar**.
 */
export function fastArgon2id({
  password,
  salt,
  hashLength,
}: {
  password: string;
  salt: Uint8Array;
  hashLength: number;
}): Promise<string> {
  let hex = createHash('sha256').update(password).update(Buffer.from(salt)).digest('hex');
  // O hash real tem o comprimento pedido, e alguns testes contam bytes do
  // digest: esticar a saída mantém essa propriedade sem custar nada.
  while (hex.length < hashLength * 2) hex += createHash('sha256').update(hex).digest('hex');
  return Promise.resolve(hex.slice(0, hashLength * 2));
}
