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
  createVault,
  deleteSecret,
  destroyVault,
  ensureVaultStructure,
  getSecret,
  isVaultDestroyed,
  isVaultDirUnavailable,
  lockVault,
  setSecret,
  unlockVault,
  vaultDir,
  vaultExists,
  vaultPath,
  vaultSession,
  vaultStatus,
} from '@zero/main/vault';
import { resetSandbox } from '../helpers/sandbox.ts';

// `createVault` só chega no `pkexec` quando o disco nega escrita; aqui o
// resultado do pedido de administrador é controlado para testar cada desfecho
// sem caixinha de senha de verdade.
const pedidoDeAdmin = vi.hoisted(() => vi.fn<() => 'ok' | 'cancelled' | 'failed'>());

vi.mock('@zero/main/vault/privilege', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zero/main/vault/privilege')>();
  return { ...actual, setupVaultDirectory: pedidoDeAdmin };
});

/** Perfil barato para a suíte: o cofre de produção usa `KDF_DEFAULTS`. */
const FAST_KDF = { memoryKiB: 16_384, iterations: 1, parallelism: 1 };
const PASSWORD = 'uva-preta-42-estrela';

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
    deriveDataKey(masterKey, container.wrap.salt),
    Buffer.from(plain, 'utf-8'),
  );
  fs.writeFileSync(vaultPath(), encodeContainer(container), { mode: 0o600 });
}

/**
 * Cria o cofre com o disco negando a primeira escrita na pasta, que é o sinal
 * para o app pedir a senha de administrador. O desfecho do pedido é escolhido
 * pelo teste.
 */
async function createVaultComAdmin(result: 'ok' | 'cancelled' | 'failed'): Promise<VaultStatus> {
  vi.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => {
    throw errno('EACCES');
  });
  pedidoDeAdmin.mockReturnValueOnce(result);
  return createVault(PASSWORD, FAST_KDF);
}

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
    const status = await createVault(PASSWORD, FAST_KDF);
    expect(status).toEqual({ exists: true, unlocked: true, attempts: 0, lockUntil: 0 });
    expect(fs.statSync(vaultPath()).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(vaultPath())).mode & 0o777).toBe(0o700);
  });

  it('recusa senha curta ou previsível na criação', async () => {
    expect((await catchError(createVault('curta12', FAST_KDF))).code).toBe('vaultWeakPassword');
    expect((await catchError(createVault('aaaaaaaaaaaa', FAST_KDF))).code).toBe(
      'vaultWeakPassword',
    );
    expect((await catchError(createVault('abcdefghijkl', FAST_KDF))).code).toBe(
      'vaultWeakPassword',
    );
    expect(vaultExists()).toBe(false);
  });

  it('recusa criar um segundo cofre', async () => {
    await createVault(PASSWORD, FAST_KDF);
    expect((await catchError(createVault(PASSWORD, FAST_KDF))).code).toBe('vaultExists');
  });

  it('guarda, lê e apaga segredos; bloqueio derruba o acesso', async () => {
    await createVault(PASSWORD, FAST_KDF);
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

    await unlockVault(PASSWORD);
    expect(getSecret('dropbox.tokens')).toBe('tok-123');

    deleteSecret('dropbox.tokens');
    expect(getSecret('dropbox.tokens')).toBeNull();
    expect(getSecret('settings.drivePassphrase')).toBe('frase-de-backup');
    expect(() => deleteSecret('inexistente')).not.toThrow();
  });

  it('senha errada conta tentativa e aplica a espera de 10 s', async () => {
    await createVault(PASSWORD, FAST_KDF);
    lockVault();

    const wrong = await catchError(unlockVault('senha-errada-xyz'));
    expect(wrong.code).toBe('vaultWrongPassword');
    expect(wrong.retryInMs).toBe(10_000);

    const status = vaultStatus();
    expect(status.attempts).toBe(1);
    expect(status.lockUntil).toBeGreaterThan(Date.now());

    // Durante a espera nem o Argon2id roda: erro de trava com contagem.
    const lockedOut = await catchError(unlockVault(PASSWORD));
    expect(lockedOut.code).toBe('vaultLockedOut');
    expect(lockedOut.retryInMs).toBeGreaterThan(0);
    expect(lockedOut.retryInMs).toBeLessThanOrEqual(10_000);
  });

  it('segunda falha sobe a espera para 30 s e o acerto zera o contador', async () => {
    await createVault(PASSWORD, FAST_KDF);
    lockVault();

    expect((await catchError(unlockVault('senha-errada-xyz'))).retryInMs).toBe(10_000);
    patchContainer((container) => {
      container.lockUntil = 0;
    });
    const second = await catchError(unlockVault('senha-errada-xyz'));
    expect(second.code).toBe('vaultWrongPassword');
    expect(second.retryInMs).toBe(30_000);
    expect(vaultStatus().attempts).toBe(2);

    patchContainer((container) => {
      container.lockUntil = 0;
    });
    await unlockVault(PASSWORD);
    const status = vaultStatus();
    expect(status.unlocked).toBe(true);
    expect(status.attempts).toBe(0);
    expect(status.lockUntil).toBe(0);
  });

  it('a trava e as tentativas sobrevivem a um bloqueio da sessão', async () => {
    await createVault(PASSWORD, FAST_KDF);
    lockVault();
    await catchError(unlockVault('senha-errada-xyz'));
    lockVault();

    const status = vaultStatus();
    expect(status.exists).toBe(true);
    expect(status.unlocked).toBe(false);
    expect(status.attempts).toBe(1);
    expect(status.lockUntil).toBeGreaterThan(Date.now());
  });

  it('payload adulterado derruba o desbloqueio (fail-closed)', async () => {
    await createVault(PASSWORD, FAST_KDF);
    lockVault();

    const buffer = fs.readFileSync(vaultPath());
    const last = buffer.length - 1;
    buffer[last] = (buffer[last] ?? 0) ^ 0xff;
    fs.writeFileSync(vaultPath(), buffer, { mode: 0o600 });

    expect((await catchError(unlockVault(PASSWORD))).code).toBe('vaultTampered');
    expect(vaultStatus().unlocked).toBe(false);
  });

  it('arquivo de lixo no lugar do cofre vira adulterado, não exceção solta', async () => {
    fs.mkdirSync(path.dirname(vaultPath()), { recursive: true, mode: 0o700 });
    fs.writeFileSync(vaultPath(), 'isso não é um cofre', { mode: 0o600 });
    expect((await catchError(unlockVault(PASSWORD))).code).toBe('vaultTampered');
    expect(vaultStatus()).toEqual({ exists: true, unlocked: false, attempts: 0, lockUntil: 0 });
  });

  it('operações sem cofre respondem com o código certo', async () => {
    expect((await catchError(unlockVault(PASSWORD))).code).toBe('vaultMissing');
    expect(catchSync(() => getSecret('x')).code).toBe('vaultLocked');
    expect(vaultStatus()).toEqual({ exists: false, unlocked: false, attempts: 0, lockUntil: 0 });
  });

  it('destroyVault apaga o arquivo e bloqueia a sessão', async () => {
    await createVault(PASSWORD, FAST_KDF);
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
      expect(isVaultDirUnavailable(errno(code))).toBe(true);
    }
    expect(isVaultDirUnavailable(errno('ENOENT'))).toBe(false);
    expect(isVaultDirUnavailable(errno('ENOSPC'))).toBe(false);
  });

  it('trata erro sem código, de outro tipo, como não recuperável por sudo', () => {
    expect(isVaultDirUnavailable(new Error('sem code'))).toBe(false);
    expect(isVaultDirUnavailable(null)).toBe(false);
    expect(isVaultDirUnavailable(undefined)).toBe(false);
    expect(isVaultDirUnavailable('texto')).toBe(false);
    expect(isVaultDirUnavailable({ code: 42 })).toBe(false);
  });

  it('trata VaultError pelo código do domínio, não pelo errno', () => {
    expect(isVaultDirUnavailable(new VaultErrorClass('vaultDirUnavailable'))).toBe(true);
    expect(isVaultDirUnavailable(new VaultErrorClass('vaultLocked'))).toBe(false);
  });

  it('ensureVaultStructure traduz falta de permissão e propaga o resto', () => {
    for (const code of ['EACCES', 'EPERM', 'EROFS']) {
      vi.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => {
        throw errno(code);
      });
      expect(catchSync(() => ensureVaultStructure()).code).toBe('vaultDirUnavailable');
    }

    // Espaço cheio não se resolve com senha de administrador: o erro cru sobe.
    vi.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => {
      throw errno('ENOSPC');
    });
    expect(catchSyncThrown(() => ensureVaultStructure())).toMatchObject({ code: 'ENOSPC' });
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
    const erro = await catchThrown(createVault(PASSWORD, FAST_KDF));

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

    expect((await catchError(createVault(PASSWORD, FAST_KDF))).code).toBe('vaultExists');
    expect(vaultExists()).toBe(false);
  });
});

describe('leitura do container em disco', () => {
  it('arquivo que some entre a checagem e a leitura vira estado neutro', async () => {
    await createVault(PASSWORD, FAST_KDF);
    vi.spyOn(fs, 'existsSync').mockReturnValueOnce(true).mockReturnValue(false);

    // Nunca uma exceção solta e nunca um "tentativas" inventado.
    expect(vaultStatus()).toEqual({ exists: true, unlocked: true, attempts: 0, lockUntil: 0 });
  });

  it('caminho do cofre ilegível não derruba o status nem o desbloqueio', async () => {
    await createVault(PASSWORD, FAST_KDF);
    fs.rmSync(vaultPath());
    fs.mkdirSync(vaultPath(), { mode: 0o700 });

    expect(vaultStatus()).toEqual({ exists: true, unlocked: true, attempts: 0, lockUntil: 0 });
    expect((await catchError(unlockVault(PASSWORD))).code).toBe('vaultTampered');
  });

  it('container ilegível falha fechado em ler, gravar e apagar segredo', async () => {
    await createVault(PASSWORD, FAST_KDF);
    setSecret('a', 'b');
    fs.writeFileSync(vaultPath(), 'nao-e-um-container', { mode: 0o600 });

    expect(catchSync(() => getSecret('a')).code).toBe('vaultTampered');
    expect(catchSync(() => setSecret('a', 'b')).code).toBe('vaultTampered');
    expect(catchSync(() => deleteSecret('a')).code).toBe('vaultTampered');
  });

  it('payload ilegível falha fechado em ler, gravar e apagar segredo', async () => {
    await createVault(PASSWORD, FAST_KDF);
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
    await createVault(PASSWORD, FAST_KDF);
    repayload(plain);
    lockVault();

    expect((await catchError(unlockVault(PASSWORD))).code).toBe('vaultTampered');
    expect(vaultStatus().unlocked).toBe(false);
  });
});

describe('destruição não é desfeita sozinha', () => {
  it('depois de destruir, nem senha errada nem acerto regravam o container', async () => {
    await createVault(PASSWORD, FAST_KDF);
    const copia = fs.readFileSync(vaultPath());
    destroyVault();
    expect(isVaultDestroyed()).toBe(true);
    // O arquivo voltou por fora (cópia manual, backup antigo): a marca de
    // destruição continua valendo nesta execução.
    fs.writeFileSync(vaultPath(), copia, { mode: 0o600 });

    expect((await catchError(unlockVault('senha-errada-xyz'))).code).toBe('vaultDestroyed');
    expect(fs.readFileSync(vaultPath()).equals(copia)).toBe(true);
  });

  it('só a criação explícita do usuário ressuscita o cofre', async () => {
    await createVault(PASSWORD, FAST_KDF);
    destroyVault();
    expect(isVaultDestroyed()).toBe(true);

    const status = await createVault(PASSWORD, FAST_KDF);

    expect(status).toMatchObject({ exists: true, unlocked: true });
    expect(isVaultDestroyed()).toBe(false);
    setSecret('a', 'b');
    expect(getSecret('a')).toBe('b');
  });
});
