import { describe, expect, it } from 'vitest';
import {
  HEADER_BYTES,
  MAGIC,
  VAULT_VERSION,
  decodeContainer,
  encodeContainer,
} from '@zero/main/vault/container';
import type { VaultContainer, WrappedKey } from '@zero/main/vault/container';
import { MASTER_KEY_BYTES, newMasterKey, newSalt, seal } from '@zero/main/vault/crypto';

/** KDF barato e dentro da faixa: a suíte não pode pagar 256 MiB por método. */
const CHEAP_KDF = { memoryKiB: 16_384, iterations: 1, parallelism: 1 };

/** Embrulho plausível (cifrado de verdade) para as formas de container. */
function wrapped(): WrappedKey {
  const derived = newMasterKey();
  return {
    kdf: CHEAP_KDF,
    kdfSalt: newSalt(),
    payload: seal(derived, newMasterKey()),
  };
}

/** Container com os três métodos: o que a criação do cofre produz. */
function fixture(): VaultContainer {
  return {
    createdAt: 1_700_000_000_000,
    attempts: 2,
    lockUntil: 1_700_000_010_000,
    payloadSalt: newSalt(),
    methods: { master: wrapped(), pin: wrapped(), recovery: wrapped() },
    payload: seal(newMasterKey(), Buffer.from('{"version":1,"secrets":{}}', 'utf-8')),
  };
}

describe('vault/container: formato do vault.zkv', () => {
  it('faz roundtrip encode/decode preservando todos os campos', () => {
    const container = fixture();
    const decoded = decodeContainer(encodeContainer(container));
    expect(decoded).toEqual(container);
  });

  it('grava e lê tentativas e trava (campos em claro do cabeçalho)', () => {
    const decoded = decodeContainer(encodeContainer(fixture()));
    expect(decoded?.attempts).toBe(2);
    expect(decoded?.lockUntil).toBe(1_700_000_010_000);
  });

  it('preserva o custo do Argon2id de cada método separadamente', () => {
    // O PIN recebe o perfil caro e a senha mestra o mais leve: se a escrita
    // misturasse os dois, o app estaria pagando 256 MiB onde não precisa (ou,
    // pior, 128 MiB onde precisa), e o teste não veria diferença.
    const container = fixture();
    const pin = container.methods.pin;
    const master = container.methods.master;
    if (pin === undefined || master === undefined) throw new Error('fixture sem métodos');
    pin.kdf = { memoryKiB: 262_144, iterations: 4, parallelism: 4 };
    const decoded = decodeContainer(encodeContainer(container));
    expect(decoded?.methods.pin?.kdf).toEqual({
      memoryKiB: 262_144,
      iterations: 4,
      parallelism: 4,
    });
    expect(decoded?.methods.master?.kdf).toEqual(CHEAP_KDF);
  });

  it('aceita container só com a senha mestra (métodos são opcionais)', () => {
    const container = fixture();
    const master = container.methods.master;
    if (master === undefined) throw new Error('fixture sem master');
    const decoded = decodeContainer(encodeContainer({ ...container, methods: { master } }));
    expect(decoded?.methods.master).toBeDefined();
    expect(decoded?.methods.pin).toBeUndefined();
    expect(decoded?.methods.recovery).toBeUndefined();
  });

  it('recusa container sem o embrulho da senha mestra', () => {
    // Sem `master` não há chave capaz de abrir nada: é a única recusa por forma.
    const container = fixture();
    const pin = container.methods.pin;
    const recovery = container.methods.recovery;
    if (pin === undefined || recovery === undefined) throw new Error('fixture incompleta');
    const decoded = decodeContainer(encodeContainer({ ...container, methods: { pin, recovery } }));
    expect(decoded).toBeNull();
  });

  it('recusa KDF fora da faixa ao gravar (o barato sai, não entra)', () => {
    const container = fixture();
    const master = container.methods.master;
    if (master === undefined) throw new Error('fixture sem master');
    expect(() =>
      encodeContainer({
        ...container,
        methods: {
          ...container.methods,
          master: { ...master, kdf: { memoryKiB: 1, iterations: 1, parallelism: 1 } },
        },
      }),
    ).toThrow();
  });

  it('devolve null para buffer truncado (qualquer ponto do arquivo)', () => {
    const buffer = encodeContainer(fixture());
    for (const cut of [1, 8, 32, HEADER_BYTES, buffer.length - 1]) {
      expect(decodeContainer(buffer.subarray(0, cut))).toBeNull();
    }
  });

  it('devolve null para byte a mais no fim', () => {
    const buffer = encodeContainer(fixture());
    expect(decodeContainer(Buffer.concat([buffer, Buffer.from([0])]))).toBeNull();
  });

  it('devolve null para magic ou versão errados', () => {
    const buffer = encodeContainer(fixture());
    const wrongMagic = Buffer.from(buffer);
    wrongMagic.write('XXXXXXX1', 0, 'ascii');
    expect(decodeContainer(wrongMagic)).toBeNull();

    const wrongVersion = Buffer.from(buffer);
    wrongVersion.writeUInt32BE(99, 8);
    expect(decodeContainer(wrongVersion)).toBeNull();
  });

  it('devolve null para parâmetro de KDF fora da faixa (anti-DoS)', () => {
    const buffer = encodeContainer(fixture());
    // O kdf do primeiro método começa em HEADER_BYTES: memória, iterações e
    // threads ocupam 12 bytes.
    const base = HEADER_BYTES;
    for (const [offset, value] of [
      [base, 4_294_967_295],
      [base + 4, 0],
      [base + 8, 64],
    ] as const) {
      const tampered = Buffer.from(buffer);
      tampered.writeUInt32BE(value, offset);
      expect(decodeContainer(tampered)).toBeNull();
    }
  });

  it('devolve null para flag de método desconhecida', () => {
    const buffer = encodeContainer(fixture());
    const tampered = Buffer.from(buffer);
    tampered.writeUInt8(0b1000_0000, 32);
    expect(decodeContainer(tampered)).toBeNull();
  });

  it('devolve null para tentativas impossíveis', () => {
    const buffer = encodeContainer(fixture());
    const tampered = Buffer.from(buffer);
    tampered.writeUInt32BE(4_294_967_295, 20);
    expect(decodeContainer(tampered)).toBeNull();
  });

  it('devolve null quando um bloco declara tamanho maior que o arquivo', () => {
    const buffer = encodeContainer(fixture());
    const lying = Buffer.from(buffer);
    // Primeiro método: kdf(12) + kdfSalt(16) + head do blob (iv 16 + tag 16 + len 4).
    lying.writeUInt32BE(buffer.length, HEADER_BYTES + 12 + 16 + 32);
    expect(decodeContainer(lying)).toBeNull();
  });

  it('devolve null quando o salt do método cabe mas o IV seguinte não', () => {
    const buffer = encodeContainer(fixture());
    // Cabeçalho + kdf + kdfSalt: o método ainda não tem IV, tag nem
    // comprimento. A leitura precisa recusar sem ler fora do buffer.
    const cut = HEADER_BYTES + 12 + 16;
    const semIv = buffer.subarray(0, cut);
    expect(semIv.length).toBe(cut);
    expect(decodeContainer(semIv)).toBeNull();
  });

  it('devolve null para instante e trava fora do inteiro seguro', () => {
    const buffer = encodeContainer(fixture());
    const grande = BigInt(Number.MAX_SAFE_INTEGER);

    const createdAtGrande = Buffer.from(buffer);
    createdAtGrande.writeBigUInt64BE(grande + 1n, 12);
    expect(decodeContainer(createdAtGrande)).toBeNull();

    const lockUntilGrande = Buffer.from(buffer);
    lockUntilGrande.writeBigInt64BE(grande + 1n, 24);
    expect(decodeContainer(lockUntilGrande)).toBeNull();

    // `lockUntil` é assinado: um bit de sinal virado é arquivo adulterado, e o
    // valor lido como instante negativo viraria espera de mil anos.
    const negativo = Buffer.from(buffer);
    negativo.writeBigInt64BE(-1n, 24);
    expect(decodeContainer(negativo)).toBeNull();

    // O limite exato continua valendo: o corte é "> máximo seguro", não ">=".
    const limite = Buffer.from(buffer);
    limite.writeBigUInt64BE(grande, 12);
    limite.writeBigInt64BE(grande, 24);
    expect(decodeContainer(limite)).toMatchObject({
      createdAt: Number.MAX_SAFE_INTEGER,
      lockUntil: Number.MAX_SAFE_INTEGER,
    });
  });

  it('o formato em disco não carrega a chave-mestra em claro', () => {
    // Nenhum dos campos do cabeçalho é a chave: eles são instante, trava, flags
    // e sal. A chave vive dentro dos blobs AES-256-GCM, um por credencial, e
    // nenhum deles a entrega sem a chave de trabalho do Argon2id.
    const master = newMasterKey();
    const container: VaultContainer = {
      ...fixture(),
      methods: {
        master: {
          kdf: CHEAP_KDF,
          kdfSalt: newSalt(),
          payload: seal(newMasterKey(), Buffer.from(master.toString('hex'), 'utf-8')),
        },
      },
    };
    expect(encodeContainer(container).toString('latin1')).not.toContain(master.toString('hex'));
  });

  it('a chave embrulhada tem o tamanho certo quando reaberta', () => {
    const master = newMasterKey();
    const container: VaultContainer = {
      ...fixture(),
      methods: {
        master: {
          kdf: CHEAP_KDF,
          kdfSalt: newSalt(),
          payload: seal(newMasterKey(), Buffer.from(master.toString('hex'), 'utf-8')),
        },
      },
    };
    const decoded = decodeContainer(encodeContainer(container));
    expect(decoded?.methods.master?.payload.data.length).toBe(MASTER_KEY_BYTES * 2);
  });

  it('a versão gravada é a do módulo, e não uma que veio no container', () => {
    const buffer = encodeContainer(fixture());
    expect(buffer.readUInt32BE(8)).toBe(VAULT_VERSION);
    expect(buffer.toString('ascii', 0, 8)).toBe(MAGIC);
  });
});
