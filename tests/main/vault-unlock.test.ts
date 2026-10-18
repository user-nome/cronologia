import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { KDF_MASTER, deriveKey, seal } from '@zero/main/vault/crypto';
import { isVaultError } from '@zero/main/vault/errors';
import {
  changeMasterPassword,
  createVault,
  destroyVault,
  lockVault,
  readContainer,
  resetPin,
  unlockVault,
  vaultPath,
  writeContainer,
} from '@zero/main/vault';
import { decodeContainer, encodeContainer } from '@zero/main/vault/container';
import { createVaultKey, wrapperFor } from '@zero/main/vault/wrapping';
import { fastArgon2id } from '../helpers/kdf.ts';
import { MASTER, PHRASE, PIN, VAULT_INPUT } from '../helpers/vault.ts';
import { resetSandbox } from '../helpers/sandbox.ts';

/**
 * A cadeia de desbloqueio (`unlock.ts`) tem três saídas que a suíte do cofre
 * comum não alcança: o **reembrulho** de um método gravado com perfil antigo (o
 * custo sobe no desbloqueio de quem tem a credencial, sem recifrar o acervo), um
 * **embrulho com tamanho errado** (container que passa pelo formato mas
 * desembrulha outra coisa) e a **falha dentro do KDF** (o argon2id lança, e a
 * cadeia tem de responder como credencial recusada em vez de estourar pelo IPC).
 */

// A derivação só falha quando o teste pede. O mock é local a este arquivo
// porque o global (`tests/mock-kdf.ts`) é registrado antes e sobrescrever um
// mock de `setupFiles` por arquivo é o que o Vitest resolve por último.
const falhar = vi.hoisted(() => ({ ativo: false }));

vi.mock('hash-wasm', () => ({
  argon2id: async (options: Parameters<typeof fastArgon2id>[0]): Promise<string> => {
    if (falhar.ativo) throw new Error('argon2id: memória insuficiente');
    return fastArgon2id(options);
  },
}));

const KDF_ANTIGO = { memoryKiB: 16_384, iterations: 1, parallelism: 1 };
const NOVA_MESTRE = 'Qv3%bN8@wF5&kD1^jH6!zL0*';
const NOVO_PIN = '73851042';

async function catchError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (isVaultError(error)) return error.code;
    throw error;
  }
  throw new Error('esperava um VaultError');
}

/** Rebaixa o custo do método pedido, simulando um cofre gravado por versão antiga. */
function downgradeCost(kind: 'master' | 'pin' | 'recovery'): void {
  const container = readContainer();
  if (container === null) throw new Error('cofre ausente');
  const method = container.methods[kind];
  if (method === undefined) throw new Error(`cofre sem método ${kind}`);
  container.methods[kind] = { ...method, kdf: { ...KDF_ANTIGO } };
  writeContainer(container);
}

/** Cria o cofre e reabre pelo caminho pedido, deixando o KDF falhar na hora. */
async function unlockWithBrokenKdf(abrir: () => Promise<unknown>): Promise<string> {
  falhar.ativo = true;
  try {
    return await catchError(abrir());
  } finally {
    falhar.ativo = false;
  }
}

beforeEach(() => {
  resetSandbox();
  destroyVault();
  falhar.ativo = false;
});

describe('vault/unlock: o custo do método sobe no próprio desbloqueio', () => {
  it('PIN gravado com perfil antigo é reembrulhado ao abrir', async () => {
    await createVault(VAULT_INPUT);
    downgradeCost('pin');
    lockVault();

    await unlockVault({ credential: PIN, kind: 'pin' });

    // O cofre continua abrindo: o reembrulho acontece **depois** do acerto, e é
    // só reescrever um blob do container (o acervo em disco não é tocado).
    const reaberto = readContainer();
    expect(reaberto?.methods.pin?.kdf.memoryKiB).toBeGreaterThan(KDF_ANTIGO.memoryKiB);
    expect(reaberto?.methods.pin?.kdf).toEqual(wrapperFor('pin').kdf);
  });

  it('a senha mestra gravada com perfil antigo é reembrulhada ao abrir', async () => {
    await createVault(VAULT_INPUT);
    downgradeCost('master');
    lockVault();

    await unlockVault({ credential: MASTER, kind: 'master' });

    expect(readContainer()?.methods.master?.kdf).toEqual(KDF_MASTER);
  });

  it('o perfil atual não é reembrulhado de novo', async () => {
    await createVault(VAULT_INPUT);
    const antes = fs.readFileSync(vaultPath());
    lockVault();

    await unlockVault({ credential: MASTER, kind: 'master' });

    // Byte a byte igual: reembrulhar a cada abertura gastaria um Argon2id sem
    // trocar nada, e o `.tmp` do container ficaria sendo reescrito sem motivo.
    expect(fs.readFileSync(vaultPath()).equals(antes)).toBe(true);
  });

  it('a frase de recuperação também sobe de custo quando o PIN é redefinido', async () => {
    await createVault(VAULT_INPUT);
    downgradeCost('recovery');
    lockVault();

    await resetPin({ phrase: PHRASE, newPin: NOVO_PIN });

    const reaberto = readContainer();
    expect(reaberto?.methods.recovery?.kdf.memoryKiB).toBeGreaterThan(KDF_ANTIGO.memoryKiB);
    // O PIN novo nasce com o perfil vigente: a frase está na mão, e o PIN novo
    // é escrito no mesmo passo.
    expect(reaberto?.methods.pin?.kdf).toEqual(wrapperFor('pin').kdf);
  });

  it('trocar a senha mestra reembrulha com o perfil vigente', async () => {
    await createVault(VAULT_INPUT);
    downgradeCost('master');

    await changeMasterPassword({ currentPassword: MASTER, newPassword: NOVA_MESTRE });

    expect(readContainer()?.methods.master?.kdf).toEqual(KDF_MASTER);
    lockVault();
    await unlockVault({ credential: NOVA_MESTRE, kind: 'master' });
  });
});

describe('vault/unlock: embrulho que não devolve a chave', () => {
  it('texto de tamanho errado é recusado como senha errada, e a tentativa conta', async () => {
    // Um container adulterado que passa pelo formato (o blob é válido) mas
    // desembrulha um texto de outro tamanho não pode virar chave: a HKDF
    // aceitaria o Buffer curto e o acervo só apareceria ilegível lá adiante.
    await createVault(VAULT_INPUT);
    const container = readContainer();
    if (container === null) throw new Error('cofre ausente');

    const metodo = await wrapperFor('pin').wrap(createVaultKey(), PIN);
    const derivada = await wrapperFor('pin').derive(metodo, PIN);
    fs.writeFileSync(
      vaultPath(),
      encodeContainer({
        ...container,
        methods: {
          ...container.methods,
          pin: {
            ...metodo,
            payload: seal(derivada, Buffer.from('curto demais', 'utf-8')),
          },
        },
      }),
      { mode: 0o600 },
    );
    lockVault();

    expect(await catchError(unlockVault({ credential: PIN, kind: 'pin' }))).toBe('vaultWrongPin');
    expect(decodeContainer(fs.readFileSync(vaultPath()))?.attempts).toBe(1);
  });

  it('método ausente é recusado como credencial errada, e a tentativa conta', async () => {
    await createVault(VAULT_INPUT);
    const container = readContainer();
    if (container === null) throw new Error('cofre ausente');
    const master = container.methods.master;
    if (master === undefined) throw new Error('cofre sem master');
    fs.writeFileSync(vaultPath(), encodeContainer({ ...container, methods: { master } }), {
      mode: 0o600,
    });
    lockVault();

    expect(await catchError(unlockVault({ credential: PIN, kind: 'pin' }))).toBe('vaultWrongPin');
    expect(decodeContainer(fs.readFileSync(vaultPath()))?.attempts).toBe(1);
  });
});

describe('vault/unlock: o KDF que falha por dentro', () => {
  it('falha de derivação no desbloqueio vira credencial recusada', async () => {
    // O argon2id é a única chamada externa da cadeia. Se ele lançar (memória
    // insuficiente, biblioteca ausente), o IPC receberia uma exceção sem código
    // e a tela mostraria "erro interno" para o que é credencial recusada.
    await createVault(VAULT_INPUT);
    lockVault();

    expect(
      await unlockWithBrokenKdf(() => unlockVault({ credential: MASTER, kind: 'master' })),
    ).toBe('vaultWrongMaster');
  });

  it('a mesma falha pela frase de recuperação não abre o cofre', async () => {
    await createVault(VAULT_INPUT);
    lockVault();

    expect(await unlockWithBrokenKdf(() => resetPin({ phrase: PHRASE, newPin: NOVO_PIN }))).toBe(
      'vaultWrongRecovery',
    );
  });

  it('e pela troca de credencial não troca nada', async () => {
    await createVault(VAULT_INPUT);

    expect(
      await unlockWithBrokenKdf(() =>
        changeMasterPassword({ currentPassword: MASTER, newPassword: NOVA_MESTRE }),
      ),
    ).toBe('vaultWrongMaster');
    // O PIN continua válido: a troca que falhou não tocou em nenhum embrulho.
    lockVault();
    await unlockVault({ credential: PIN, kind: 'pin' });
  });
});

describe('vault/unlock: a chave liberada é a chave daquele cofre', () => {
  it('o salt do Argon2id separa dois coframes com a mesma senha mestra', async () => {
    await createVault(VAULT_INPUT);
    const masterUm = readContainer()?.methods.master?.kdfSalt;
    destroyVault();
    await createVault({ ...VAULT_INPUT, pin: NOVO_PIN });
    const masterDois = readContainer()?.methods.master?.kdfSalt;

    // Sem o salt, a senha mestra do segundo cofre derivaria a mesma chave de
    // trabalho do primeiro, e as duas bibliotecas cifradas trocariam de lugar.
    expect(masterUm?.equals(masterDois ?? Buffer.alloc(0))).toBe(false);

    const chaveUm = await deriveKey(MASTER, masterUm ?? createVaultKey(), KDF_MASTER);
    const chaveDois = await deriveKey(MASTER, masterDois ?? createVaultKey(), KDF_MASTER);
    expect(chaveUm.equals(chaveDois)).toBe(false);
  });
});
