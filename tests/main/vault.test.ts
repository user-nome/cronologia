import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultStatus } from '@zero/types/vault';
import type { VaultContainer } from '@zero/main/vault/container';
import { decodeContainer, encodeContainer } from '@zero/main/vault/container';
import { deriveDataKey, seal } from '@zero/main/vault/crypto';
import { isVaultError } from '@zero/main/vault/errors';
import type { VaultError } from '@zero/main/vault/errors';
import { VaultError as VaultErrorClass } from '@zero/main/vault/errors';
import {
  changeMasterPassword,
  changePin,
  createVault,
  deleteSecret,
  destroyVault,
  ensureStructure,
  getSecret,
  isDestroyed,
  isDirUnavailable,
  lockVault,
  resetPin,
  setSecret,
  unlockVault,
  vaultDir,
  vaultExists,
  vaultPath,
  vaultSession,
  vaultStatus,
} from '@zero/main/vault';
import { MASTER, PHRASE, PIN, VAULT_INPUT } from '../helpers/vault.ts';
import { resetSandbox } from '../helpers/sandbox.ts';

// `createVault` só chega no `pkexec` quando o disco nega escrita; aqui o
// resultado do pedido de administrador é controlado para testar cada desfecho
// sem caixinha de senha de verdade.
const pedidoDeAdmin = vi.hoisted(() => vi.fn<() => 'ok' | 'cancelled' | 'failed'>());

vi.mock('@zero/main/vault/privilege', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zero/main/vault/privilege')>();
  return { ...actual, setupVaultDirectory: pedidoDeAdmin };
});

/** Abre com o PIN do dia a dia: é o caminho que a suíte mais exercita. */
const open = (credential: string = PIN, kind: 'pin' | 'master' = 'pin'): Promise<VaultStatus> =>
  unlockVault({ credential, kind });

/** Outra senha mestra válida (24 caracteres, 4 classes, sem padrão). */
const NOVA_MESTRE = 'Qv3%bN8@wF5&kD1^jH6!zL0*';

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

async function catchError(promise: Promise<unknown>): Promise<VaultError> {
  try {
    await promise;
  } catch (error) {
    if (isVaultError(error)) return error;
    throw error;
  }
  throw new Error('esperava um VaultError');
}

/** Mesma pegada, mas para erro cru (sem `VaultError`). */
async function catchThrown(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('esperava uma rejeição');
}

function catchSync(run: () => unknown): VaultError {
  try {
    run();
  } catch (error) {
    if (isVaultError(error)) return error;
    throw error;
  }
  throw new Error('esperava um VaultError');
}

/** Mesma pegada, mas para erro cru lançado por uma função síncrona. */
function catchSyncThrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('esperava uma exceção');
}

/** Cofre novo com as credenciais da suíte (apelido do `createVault` do teste). */
const criar = (): Promise<VaultStatus> => createVault(VAULT_INPUT);

/** Regrava o container com a mutação dada (simula tempo passando / estado salvo). */
function patchContainer(mutate: (container: VaultContainer) => void): void {
  const container = decodeContainer(fs.readFileSync(vaultPath()));
  if (container === null) throw new Error('container ilegível');
  mutate(container);
  fs.writeFileSync(vaultPath(), encodeContainer(container), { mode: 0o600 });
}

/**
 * Re-sela o payload com a chave da sessão para simular adulteração do
 * **conteúdo** (o cabeçalho continua válido, que é o caso que interessa).
 */
function repayload(plain: string): void {
  const container = decodeContainer(fs.readFileSync(vaultPath()));
  if (container === null) throw new Error('container ilegível');
  const masterKey = vaultSession.key();
  if (masterKey === null) throw new Error('cofre fechado');
  container.payload = seal(
    deriveDataKey(masterKey, container.payloadSalt),
    Buffer.from(plain, 'utf-8'),
  );
  fs.writeFileSync(vaultPath(), encodeContainer(container), { mode: 0o600 });
}

/** Tira a trava do disco sem mexer na contagem (o degrau já foi medido). */
function releaseLock(): void {
  patchContainer((container) => {
    container.lockUntil = 0;
  });
}

/**
 * Cria o cofre com o disco negando a primeira escrita na pasta, que é o sinal
 * para o app pedir a senha de administrador. O desfecho é escolhido pelo teste.
 */
async function createVaultComAdmin(result: 'ok' | 'cancelled' | 'failed'): Promise<VaultStatus> {
  vi.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => {
    throw errno('EACCES');
  });
  pedidoDeAdmin.mockReturnValueOnce(result);
  return criar();
}

/** Status neutro, para os `toEqual` que verificam só o que importa. */
const NEUTRO: VaultStatus = {
  exists: false,
  unlocked: false,
  attempts: 0,
  lockUntil: 0,
  lockRemainingMs: 0,
  hasRecovery: false,
};

beforeEach(() => {
  resetSandbox();
  destroyVault();
  // Sem override o pedido real dispararia `pkexec`; o padrão é não haver como
  // pedir, e cada teste que quiser outro desfecho diz na chamada.
  pedidoDeAdmin.mockReset();
  pedidoDeAdmin.mockReturnValue('failed');
});

describe('vault: ciclo de vida do cofre', () => {
  it('cria o cofre desbloqueado, com arquivo 0600 e diretório 0700', async () => {
    expect(vaultExists()).toBe(false);
    const status = await criar();
    expect(status).toEqual({
      exists: true,
      unlocked: true,
      attempts: 0,
      lockUntil: 0,
      lockRemainingMs: 0,
      hasRecovery: true,
    });
    expect(fs.statSync(vaultPath()).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(vaultPath())).mode & 0o777).toBe(0o700);
  });

  it('recusa senha mestra fora dos 24 caracteres', async () => {
    expect((await catchError(createVault({ ...VAULT_INPUT, masterPassword: 'curta' }))).code).toBe(
      'vaultInvalidMaster',
    );
    // O limite é exato nos dois sentidos: 23 e 25 caracteres falham igual.
    expect(
      (await catchError(createVault({ ...VAULT_INPUT, masterPassword: MASTER.slice(0, 23) }))).code,
    ).toBe('vaultInvalidMaster');
    expect(
      (await catchError(createVault({ ...VAULT_INPUT, masterPassword: `${MASTER}x` }))).code,
    ).toBe('vaultInvalidMaster');
    expect(vaultExists()).toBe(false);
  });

  it('recusa senha mestra previsível mesmo com 24 caracteres', async () => {
    for (const degenerada of ['a'.repeat(24), 'abcdefghijklmnopqrstuvwx', 'ab'.repeat(12)]) {
      expect(
        (await catchError(createVault({ ...VAULT_INPUT, masterPassword: degenerada }))).code,
      ).toBe('vaultWeakMaster');
    }
    expect(vaultExists()).toBe(false);
  });

  it('recusa PIN fora dos 8 dígitos ou degenerado', async () => {
    expect((await catchError(createVault({ ...VAULT_INPUT, pin: '123' }))).code).toBe(
      'vaultInvalidPin',
    );
    expect((await catchError(createVault({ ...VAULT_INPUT, pin: '1234567a' }))).code).toBe(
      'vaultInvalidPin',
    );
    // 8 dígitos iguais, em sequência ou com cara de data.
    for (const degenerado of ['11111111', '12345678', '01012020']) {
      expect((await catchError(createVault({ ...VAULT_INPUT, pin: degenerado }))).code).toBe(
        'vaultWeakPin',
      );
    }
    expect(vaultExists()).toBe(false);
  });

  it('recusa frase de recuperação curta ou com poucas palavras distintas', async () => {
    expect(
      (await catchError(createVault({ ...VAULT_INPUT, recoveryPhrase: 'poucas palavras aqui' })))
        .code,
    ).toBe('vaultInvalidRecovery');
    expect((await catchError(createVault({ ...VAULT_INPUT, recoveryPhrase: '' }))).code).toBe(
      'vaultInvalidRecovery',
    );
    // 12+ palavras, mas quase todas repetidas: a entropia real é de 4.
    const repetida = `${'cavalo '.repeat(11)}aurora`;
    expect((await catchError(createVault({ ...VAULT_INPUT, recoveryPhrase: repetida }))).code).toBe(
      'vaultWeakRecovery',
    );
    expect(vaultExists()).toBe(false);
  });

  it('recusa criar um segundo cofre', async () => {
    await criar();
    expect((await catchError(criar())).code).toBe('vaultExists');
  });

  it('guarda, lê e apaga segredos; bloqueio derruba o acesso', async () => {
    await criar();
    setSecret('dropbox.tokens', 'tok-123');
    setSecret('settings.drivePassphrase', 'frase-de-backup');

    expect(getSecret('dropbox.tokens')).toBe('tok-123');
    expect(getSecret('settings.drivePassphrase')).toBe('frase-de-backup');
    expect(getSecret('inexistente')).toBeNull();

    // Nenhum segredo em claro no disco.
    const raw = fs.readFileSync(vaultPath(), 'utf-8');
    expect(raw).not.toContain('tok-123');
    expect(raw).not.toContain('frase-de-backup');

    expect(lockVault().unlocked).toBe(false);
    expect(catchSync(() => getSecret('dropbox.tokens')).code).toBe('vaultLocked');
    expect(catchSync(() => setSecret('a', 'b')).code).toBe('vaultLocked');
    expect(catchSync(() => deleteSecret('a')).code).toBe('vaultLocked');

    await open();
    expect(getSecret('dropbox.tokens')).toBe('tok-123');

    deleteSecret('dropbox.tokens');
    expect(getSecret('dropbox.tokens')).toBeNull();
    expect(getSecret('settings.drivePassphrase')).toBe('frase-de-backup');
    expect(() => deleteSecret('inexistente')).not.toThrow();
  });
});

describe('vault: as três credenciais são caminhos para a mesma chave', () => {
  it('abre com o PIN e com a senha mestra, e chega ao mesmo acervo', async () => {
    await criar();
    setSecret('a', 'valor-secreto');
    lockVault();

    await open(PIN, 'pin');
    expect(getSecret('a')).toBe('valor-secreto');
    lockVault();

    await open(MASTER, 'master');
    expect(getSecret('a')).toBe('valor-secreto');
  });

  it('a senha mestra e o PIN recusados dão códigos distintos', async () => {
    await criar();
    lockVault();

    expect((await catchError(open('00000000', 'pin'))).code).toBe('vaultWrongPin');
    releaseLock();
    expect((await catchError(open('T'.repeat(24), 'master'))).code).toBe('vaultWrongMaster');
    // As duas falhas somam na mesma rampa: um contador por credencial daria ao
    // atacante que escolhe o método uma orçamento maior que o app impõe.
    expect(vaultStatus().attempts).toBe(2);
  });

  it('credencial malformada é recusada sem gastar o Argon2id caro', async () => {
    await criar();
    lockVault();

    // O formato é conferido antes da derivação: um PIN de 2 dígitos custaria
    // 256 MiB para ser recusado se a ordem da cadeia estivesse invertida.
    expect((await catchError(open('12', 'pin'))).code).toBe('vaultWrongPin');
    releaseLock();
    expect((await catchError(open('curta', 'master'))).code).toBe('vaultWrongMaster');
    expect(vaultStatus().attempts).toBe(2);
  });

  it('PIN errado conta tentativa e aplica a espera de 10 s; na espera, nem deriva', async () => {
    await criar();
    lockVault();

    const wrong = await catchError(open('00000000', 'pin'));
    expect(wrong.code).toBe('vaultWrongPin');
    expect(wrong.retryInMs).toBeGreaterThan(0);
    expect(wrong.retryInMs).toBeLessThanOrEqual(10_000);

    const status = vaultStatus();
    expect(status.attempts).toBe(1);
    expect(status.lockUntil).toBeGreaterThan(Date.now());
    expect(status.lockRemainingMs).toBeGreaterThan(0);

    // Durante a espera o Argon2id não roda, e o erro é de trava com contagem.
    const lockedOut = await catchError(open());
    expect(lockedOut.code).toBe('vaultLockedOut');
    expect(lockedOut.retryInMs).toBeGreaterThan(0);
    expect(lockedOut.retryInMs).toBeLessThanOrEqual(10_000);
    // Esperar não gasta tentativa nova: a trava não é punição nova.
    expect(vaultStatus().attempts).toBe(1);
  });

  it('o degrau da rampa sobe a cada falha e o acerto zera o contador', async () => {
    await criar();
    lockVault();

    expect((await catchError(open('00000000', 'pin'))).retryInMs).toBeLessThanOrEqual(10_000);
    releaseLock();
    const second = await catchError(open('00000000', 'pin'));
    expect(second.code).toBe('vaultWrongPin');
    expect(second.retryInMs).toBeGreaterThan(20_000);
    expect(vaultStatus().attempts).toBe(2);

    releaseLock();
    await open();
    expect(vaultStatus()).toMatchObject({ unlocked: true, attempts: 0, lockUntil: 0 });
  });

  it('a trava e as tentativas sobrevivem a um bloqueio da sessão', async () => {
    await criar();
    lockVault();
    await catchError(open('00000000', 'pin'));
    lockVault();

    expect(vaultStatus()).toMatchObject({
      exists: true,
      unlocked: false,
      attempts: 1,
    });
    expect(vaultStatus().lockUntil).toBeGreaterThan(Date.now());
  });
});

describe('vault: o conteúdo não é aberto por chave de outro cofre', () => {
  it('payload adulterado derruba o desbloqueio (fail-closed)', async () => {
    await criar();
    lockVault();

    const buffer = fs.readFileSync(vaultPath());
    const last = buffer.length - 1;
    buffer[last] = (buffer[last] ?? 0) ^ 0xff;
    fs.writeFileSync(vaultPath(), buffer, { mode: 0o600 });

    // A senha está certa e o embrulho abriu; o que não abre é o conteúdo.
    expect((await catchError(open(MASTER, 'master'))).code).toBe('vaultTampered');
    expect(vaultStatus().unlocked).toBe(false);
  });

  it('arquivo de lixo no lugar do cofre vira adulterado, não exceção solta', async () => {
    fs.mkdirSync(path.dirname(vaultPath()), { recursive: true, mode: 0o700 });
    fs.writeFileSync(vaultPath(), 'isso não é um cofre', { mode: 0o600 });
    expect((await catchError(open())).code).toBe('vaultTampered');
    expect(vaultStatus()).toMatchObject({ exists: true, unlocked: false, attempts: 0 });
  });

  it('operações sem cofre respondem com o código certo', async () => {
    expect((await catchError(open())).code).toBe('vaultMissing');
    expect(catchSync(() => getSecret('x')).code).toBe('vaultLocked');
    expect(vaultStatus()).toEqual(NEUTRO);
  });

  it('destroyVault apaga o arquivo e bloqueia a sessão', async () => {
    await criar();
    expect(vaultExists()).toBe(true);
    destroyVault();
    expect(vaultExists()).toBe(false);
    expect(vaultStatus().unlocked).toBe(false);
  });
});

describe('onde mora o cofre', () => {
  it('usa o override explícito e cai no prefixo do sistema', () => {
    const prefixo = process.env.CRONOLOGIA_VAR_LIB ?? '';
    const alvo = path.join(prefixo, 'cofre-alternativo');
    try {
      vi.stubEnv('CRONOLOGIA_VAULT_DIR', alvo);
      expect(vaultDir()).toBe(alvo);

      vi.stubEnv('CRONOLOGIA_VAULT_DIR', '');
      vi.stubEnv('CRONOLOGIA_VAR_LIB', '/tmp/var-lib-do-teste');
      expect(vaultDir()).toBe(path.join('/tmp/var-lib-do-teste', '.cronologia', '.vault'));

      vi.stubEnv('CRONOLOGIA_VAR_LIB', '');
      expect(vaultDir()).toBe(path.join('/var/lib', '.cronologia', '.vault'));
    } finally {
      vi.unstubAllEnvs();
    }
    expect(vaultDir()).toBe(path.join(prefixo, '.cronologia', '.vault'));
  });
});

describe('erro de disco do cofre', () => {
  it('reconhece os três códigos de permissão e recusa qualquer outro', () => {
    for (const code of ['EACCES', 'EPERM', 'EROFS']) {
      expect(isDirUnavailable(errno(code))).toBe(true);
    }
    expect(isDirUnavailable(errno('ENOENT'))).toBe(false);
    expect(isDirUnavailable(errno('ENOSPC'))).toBe(false);
  });

  it('trata erro sem código, de outro tipo, como não recuperável por sudo', () => {
    expect(isDirUnavailable(new Error('sem code'))).toBe(false);
    expect(isDirUnavailable(null)).toBe(false);
    expect(isDirUnavailable(undefined)).toBe(false);
    expect(isDirUnavailable('texto')).toBe(false);
    expect(isDirUnavailable({ code: 42 })).toBe(false);
  });

  it('trata VaultError pelo código do domínio, não pelo errno', () => {
    expect(isDirUnavailable(new VaultErrorClass('vaultDirUnavailable'))).toBe(true);
    expect(isDirUnavailable(new VaultErrorClass('vaultLocked'))).toBe(false);
  });

  it('ensureStructure traduz falta de permissão e propaga o resto', () => {
    for (const code of ['EACCES', 'EPERM', 'EROFS']) {
      vi.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => {
        throw errno(code);
      });
      expect(catchSync(() => ensureStructure()).code).toBe('vaultDirUnavailable');
    }

    // Espaço cheio não se resolve com senha de administrador: o erro cru sobe.
    vi.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => {
      throw errno('ENOSPC');
    });
    expect(catchSyncThrown(() => ensureStructure())).toMatchObject({ code: 'ENOSPC' });
  });

  it('pede administrador e refaz a estrutura quando a senha é concedida', async () => {
    const status = await createVaultComAdmin('ok');

    expect(pedidoDeAdmin).toHaveBeenCalledTimes(1);
    expect(status).toMatchObject({ exists: true, unlocked: true });
    // Depois do reparo o cofre é mesmo utilizável, não um diretório pelado.
    setSecret('a', 'b');
    expect(getSecret('a')).toBe('b');
  });

  it('senha de administrador dispensada vira vaultAuthCancelled', async () => {
    await expect(createVaultComAdmin('cancelled')).rejects.toMatchObject({
      code: 'vaultAuthCancelled',
    });
    expect(pedidoDeAdmin).toHaveBeenCalledTimes(1);
  });

  it('sem chance de pedir (sem pkexec) o erro original volta, sem insistir', async () => {
    await expect(createVaultComAdmin('failed')).rejects.toMatchObject({
      code: 'vaultDirUnavailable',
    });
    expect(pedidoDeAdmin).toHaveBeenCalledTimes(1);
  });

  it('falha que não é de permissão nunca abre a caixinha do sistema', async () => {
    vi.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => {
      throw errno('ENOSPC');
    });
    const erro = await catchThrown(criar());

    expect(erro).toMatchObject({ code: 'ENOSPC' });
    expect(pedidoDeAdmin).not.toHaveBeenCalled();
  });

  it('recheca o disco depois de criar a estrutura, antes de escrever por cima', async () => {
    vi.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => {
      throw errno('EACCES');
    });
    pedidoDeAdmin.mockReturnValueOnce('ok');
    // A primeira checagem diz que não há cofre; a segunda, depois da estrutura
    // pronta, diz que há (pasta sem permissão de listagem escondia o arquivo).
    vi.spyOn(fs, 'existsSync').mockReturnValueOnce(false).mockReturnValueOnce(true);

    expect((await catchError(criar())).code).toBe('vaultExists');
    expect(vaultExists()).toBe(false);
  });
});

describe('leitura do container em disco', () => {
  it('arquivo que some entre a checagem e a leitura vira estado neutro', async () => {
    await criar();
    vi.spyOn(fs, 'existsSync').mockReturnValueOnce(true).mockReturnValue(false);

    // Nunca uma exceção solta e nunca um "tentativas" inventado.
    expect(vaultStatus()).toMatchObject({ exists: true, unlocked: true, attempts: 0 });
  });

  it('caminho do cofre ilegível não derruba o status nem o desbloqueio', async () => {
    await criar();
    fs.rmSync(vaultPath());
    fs.mkdirSync(vaultPath(), { mode: 0o700 });

    expect(vaultStatus()).toMatchObject({ exists: true, unlocked: true, attempts: 0 });
    expect((await catchError(open())).code).toBe('vaultTampered');
  });

  it('container ilegível falha fechado em ler, gravar e apagar segredo', async () => {
    await criar();
    setSecret('a', 'b');
    fs.writeFileSync(vaultPath(), 'nao-e-um-container', { mode: 0o600 });

    expect(catchSync(() => getSecret('a')).code).toBe('vaultTampered');
    expect(catchSync(() => setSecret('a', 'b')).code).toBe('vaultTampered');
    expect(catchSync(() => deleteSecret('a')).code).toBe('vaultTampered');
  });

  it('payload ilegível falha fechado em ler, gravar e apagar segredo', async () => {
    await criar();
    repayload('{"version":1,"secrets":{');

    expect(catchSync(() => getSecret('a')).code).toBe('vaultTampered');
    expect(catchSync(() => setSecret('a', 'b')).code).toBe('vaultTampered');
    expect(catchSync(() => deleteSecret('a')).code).toBe('vaultTampered');
  });
});

describe('payload do cofre é sempre no formato conhecido', () => {
  const invalidos: [string, string][] = [
    ['texto que não é objeto', '"apenas-uma-string"'],
    ['nulo', 'null'],
    ['sem version', '{"secrets":{}}'],
    ['sem secrets', '{"version":1}'],
    ['version como texto', '{"version":"1","secrets":{}}'],
    ['secrets nulo', '{"version":1,"secrets":null}'],
    ['secrets como texto', '{"version":1,"secrets":"x"}'],
    ['segredo que não é texto', '{"version":1,"secrets":{"a":1}}'],
    ['JSON inválido', '{"version":1,'],
    ['versão de outro formato', '{"version":2,"secrets":{}}'],
  ];

  it.each(invalidos)('recusa %s como vaultTampered', async (_rotulo, plain) => {
    await criar();
    repayload(plain);
    lockVault();

    expect((await catchError(open(MASTER, 'master'))).code).toBe('vaultTampered');
    expect(vaultStatus().unlocked).toBe(false);
  });
});

describe('destruição não é desfeita sozinha', () => {
  it('depois de destruir, nem senha errada nem acerto regravam o container', async () => {
    await criar();
    const copia = fs.readFileSync(vaultPath());
    destroyVault();
    expect(isDestroyed()).toBe(true);
    // O arquivo voltou por fora (cópia manual, backup antigo): a marca de
    // destruição continua valendo nesta execução.
    fs.writeFileSync(vaultPath(), copia, { mode: 0o600 });

    expect((await catchError(open('00000000', 'pin'))).code).toBe('vaultDestroyed');
    expect(fs.readFileSync(vaultPath()).equals(copia)).toBe(true);
  });

  it('só a criação explícita do usuário ressuscita o cofre', async () => {
    await criar();
    destroyVault();
    expect(isDestroyed()).toBe(true);

    const status = await criar();

    expect(status).toMatchObject({ exists: true, unlocked: true });
    expect(isDestroyed()).toBe(false);
    setSecret('a', 'b');
    expect(getSecret('a')).toBe('b');
  });
});

describe('frase de recuperação é o caminho de volta', () => {
  it('a frase não é login: ela só redefine o PIN, e o cofre abre junto', async () => {
    await criar();
    setSecret('a', 'valor-secreto');
    lockVault();

    // Só o espaço é normalizado: quem anotou num papel e colou com quebra de
    // linha precisa conseguir usar.
    const status = await resetPin({ phrase: `  ${PHRASE}\n`, newPin: '73851042' });

    expect(status.unlocked).toBe(true);
    expect(getSecret('a')).toBe('valor-secreto');
    lockVault();
    await open('73851042', 'pin');
    expect(getSecret('a')).toBe('valor-secreto');
  });

  it('a caixa das palavras é parte da frase: reescrever em maiúsculas não abre', async () => {
    await criar();
    lockVault();

    const erro = await catchError(resetPin({ phrase: PHRASE.toUpperCase(), newPin: '73851042' }));

    expect(erro.code).toBe('vaultWrongRecovery');
    expect(vaultStatus().unlocked).toBe(false);
  });

  it('PIN errado na redefinição é recusado antes de gastar o Argon2id', async () => {
    await criar();
    expect((await catchError(resetPin({ phrase: PHRASE, newPin: '123' }))).code).toBe(
      'vaultInvalidPin',
    );
    expect((await catchError(resetPin({ phrase: PHRASE, newPin: '11111111' }))).code).toBe(
      'vaultWeakPin',
    );
  });

  it('frase curta é recusada antes de qualquer derivação', async () => {
    await criar();
    expect((await catchError(resetPin({ phrase: 'tres palavras', newPin: '73851042' }))).code).toBe(
      'vaultInvalidRecovery',
    );
  });

  it('frase errada conta tentativa e devolve o código próprio', async () => {
    await criar();
    lockVault();

    const erro = await catchError(
      resetPin({
        phrase:
          'outra frase totalmente diferente escrita com muitas palavras para ter folga no minimo',
        newPin: '73851042',
      }),
    );

    expect(erro.code).toBe('vaultWrongRecovery');
    expect(vaultStatus().attempts).toBe(1);
    // A frase errada entra na mesma rampa: é o único caminho de recuperação, e
    // sem rampa ele viraria o atalho para força bruta do acervo.
    expect(erro.retryInMs).toBeGreaterThan(0);
    expect(vaultStatus().unlocked).toBe(false);
  });

  it('trava ativa barra a redefinição antes de derivar a frase', async () => {
    await criar();
    lockVault();
    await catchError(open('00000000', 'pin'));

    expect((await catchError(resetPin({ phrase: PHRASE, newPin: '73851042' }))).code).toBe(
      'vaultLockedOut',
    );
  });

  it('sem frase de recuperação o caminho de volta não existe', async () => {
    await criar();
    patchContainer((container) => {
      delete container.methods.recovery;
    });

    expect(vaultStatus().hasRecovery).toBe(false);
    expect((await catchError(resetPin({ phrase: PHRASE, newPin: '73851042' }))).code).toBe(
      'vaultMissing',
    );
  });

  it('cofre ausente responde vaultMissing em vez de tentar derivar', async () => {
    expect((await catchError(resetPin({ phrase: PHRASE, newPin: '73851042' }))).code).toBe(
      'vaultMissing',
    );
  });
});

describe('trocar credencial com o cofre aberto', () => {
  it('a senha mestra nova abre e a antiga não abre mais', async () => {
    await criar();
    setSecret('a', 'valor-secreto');

    await changeMasterPassword({ currentPassword: MASTER, newPassword: NOVA_MESTRE });

    lockVault();
    await open(NOVA_MESTRE, 'master');
    expect(getSecret('a')).toBe('valor-secreto');
    releaseLock();
    expect((await catchError(open(MASTER, 'master'))).code).toBe('vaultWrongMaster');
  });

  it('o PIN continua válido depois de trocar só a senha mestra', async () => {
    await criar();
    await changeMasterPassword({ currentPassword: MASTER, newPassword: NOVA_MESTRE });

    lockVault();
    await open();
    expect(vaultStatus().unlocked).toBe(true);
  });

  it('a senha atual errada não troca nada', async () => {
    await criar();
    expect(
      (
        await catchError(
          changeMasterPassword({ currentPassword: 'errada', newPassword: NOVA_MESTRE }),
        )
      ).code,
    ).toBe('vaultWrongMaster');

    lockVault();
    await open(MASTER, 'master');
    expect(vaultStatus().unlocked).toBe(true);
  });

  it('a senha mestra nova é conferida no formato e na força', async () => {
    await criar();
    expect(
      (await catchError(changeMasterPassword({ currentPassword: MASTER, newPassword: 'curta' })))
        .code,
    ).toBe('vaultInvalidMaster');
    expect(
      (
        await catchError(
          changeMasterPassword({ currentPassword: MASTER, newPassword: 'z'.repeat(24) }),
        )
      ).code,
    ).toBe('vaultWeakMaster');
  });

  it('troca de PIN reabre pelo novo e barra o antigo', async () => {
    await criar();
    await changePin({ currentPin: PIN, newPin: '73851042' });

    lockVault();
    await open('73851042', 'pin');
    releaseLock();
    expect((await catchError(open(PIN, 'pin'))).code).toBe('vaultWrongPin');
  });

  it('troca de PIN com o PIN atual errado não troca nada', async () => {
    await criar();
    expect((await catchError(changePin({ currentPin: '00000000', newPin: '73851042' }))).code).toBe(
      'vaultWrongPin',
    );
    lockVault();
    await open();
  });

  it('a troca não recifra o acervo: o segredo gravado sobrevive', async () => {
    await criar();
    setSecret('a', 'valor-secreto');
    const antes = fs.statSync(vaultPath()).size;

    await changeMasterPassword({ currentPassword: MASTER, newPassword: NOVA_MESTRE });
    await changePin({ currentPin: PIN, newPin: '73851042' });

    expect(getSecret('a')).toBe('valor-secreto');
    // Só um embrulho foi reescrito: o payload continua byte a byte o mesmo,
    // porque a chave-mestra é aleatória e não derivada da senha.
    expect(fs.statSync(vaultPath()).size).toBe(antes);
  });

  it('cofre fechado barra as trocas: aberto é estado, não prova de posse', async () => {
    await criar();
    lockVault();
    expect(
      (
        await catchError(
          changeMasterPassword({ currentPassword: MASTER, newPassword: NOVA_MESTRE }),
        )
      ).code,
    ).toBe('vaultLocked');
    expect((await catchError(changePin({ currentPin: PIN, newPin: '73851042' }))).code).toBe(
      'vaultLocked',
    );
  });

  it('sem cofre as trocas respondem o código do arquivo, não de credencial', async () => {
    expect(
      (
        await catchError(
          changeMasterPassword({ currentPassword: MASTER, newPassword: NOVA_MESTRE }),
        )
      ).code,
    ).toBe('vaultMissing');
    expect((await catchError(changePin({ currentPin: PIN, newPin: '73851042' }))).code).toBe(
      'vaultMissing',
    );
  });

  it('container sem o embrulho pedido é recusado como danificado', async () => {
    await criar();
    patchContainer((container) => {
      delete container.methods.pin;
    });
    expect((await catchError(changePin({ currentPin: PIN, newPin: '73851042' }))).code).toBe(
      'vaultTampered',
    );

    destroyVault();
    await criar();
    patchContainer((container) => {
      delete container.methods.master;
    });
    expect(
      (
        await catchError(
          changeMasterPassword({ currentPassword: MASTER, newPassword: NOVA_MESTRE }),
        )
      ).code,
    ).toBe('vaultTampered');
  });
});
