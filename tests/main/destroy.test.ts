import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createVault, destroyVault, isDestroyed, unlockVault, vaultPath } from '@zero/main/vault';
import { VaultError, isVaultError } from '@zero/main/vault/errors';
import { setSecret } from '@zero/main/vault/vault';
import {
  coversDir,
  loadLibrary,
  resetLibrary,
  saveLibrary,
  writeCoverFile,
} from '@zero/main/library';
import { runDiskCleanup, sweepStaleTempFiles } from '@zero/main/cleanup';
import { configDir, dataDir } from '@zero/main/paths';
import { MASTER, VAULT_INPUT } from '../helpers/vault.ts';
import { makeWork } from '../helpers/fixtures.ts';
import { resetSandbox } from '../helpers/sandbox.ts';

/**
 * Destruição de dados: o que precisa ser provado é que **não dá para voltar**
 * e que **nada recria** o que foi apagado por acidente.
 *
 * "O arquivo sumiu" é o teste fraco. Os que importam aqui são: o shred
 * realmente sobrescreveu, o container não renasce depois do destroy, e a
 * varredura de legados não toca nos dados vivos.
 */

async function expectVaultError(run: () => unknown, code: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    expect(isVaultError(error) && error.code).toBe(code);
    return;
  }
  throw new Error(`esperava ${code}`);
}

describe('destruição do cofre', () => {
  beforeEach(async () => {
    resetSandbox();
    // `destroyVault` do import anterior não existe ainda na primeira volta:
    // `createVault` limpa a marca de destruição, então a ordem basta.
    destroyVault();
    await createVault(VAULT_INPUT);
  });

  it('apaga o container e o temporário do cofre', () => {
    setSecret('qualquer', 'valor');
    expect(fs.existsSync(vaultPath())).toBe(true);
    expect(fs.existsSync(`${vaultPath()}.tmp`)).toBe(false);

    destroyVault();

    expect(fs.existsSync(vaultPath())).toBe(false);
    expect(fs.existsSync(`${vaultPath()}.tmp`)).toBe(false);
    expect(isDestroyed()).toBe(true);
  });

  it('apaga um temporário órfão que carrega a chave embrulhada', () => {
    const tmp = `${vaultPath()}.tmp`;
    fs.writeFileSync(tmp, Buffer.from('blob-de-chave-embrulhada'), { mode: 0o600 });

    destroyVault();

    expect(fs.existsSync(tmp)).toBe(false);
  });

  it('não recria o container depois da destruição', async () => {
    destroyVault();

    // Nenhum caminho de escrita pode ressuscitar o cofre sem `createVault`.
    await expectVaultError(() => setSecret('qualquer', 'valor'), 'vaultLocked');
    expect(fs.existsSync(vaultPath())).toBe(false);
    expect(isDestroyed()).toBe(true);
  });

  it('só createVault limpa a marca de destruição', async () => {
    destroyVault();
    await createVault(VAULT_INPUT);
    expect(isDestroyed()).toBe(false);

    setSecret('segredo', 'valor');
    expect(fs.existsSync(vaultPath())).toBe(true);
  });

  it('depois de destruído, desbloquear não ressuscita nem recusa como adulterado', async () => {
    destroyVault();
    // Sem arquivo, o desbloqueio é "cofre ausente", não "adulterado": é a
    // diferença entre uma mensagem honesta e uma falha de instalação.
    await expectVaultError(
      () => unlockVault({ credential: MASTER, kind: 'master' }),
      'vaultMissing',
    );
    expect(fs.existsSync(vaultPath())).toBe(false);
  });
});

describe('destruição do acervo', () => {
  beforeEach(async () => {
    resetSandbox();
    destroyVault();
    await createVault(VAULT_INPUT);
  });

  it('apaga biblioteca e capas, deixando as pastas utilizáveis', () => {
    saveLibrary([makeWork({ title: 'obra' })]);
    writeCoverFile('a.png', Buffer.from('capa-a'));
    writeCoverFile('b.png', Buffer.from('capa-b'));

    resetLibrary();

    expect(loadLibrary()).toEqual([]);
    expect(fs.readdirSync(coversDir())).toEqual([]);
    expect(fs.statSync(coversDir()).isDirectory()).toBe(true);
    // Dá para gravar de novo depois do reset.
    expect(saveLibrary([makeWork({ title: 'depois' })])).toHaveLength(1);
  });

  it('sem cofre aberto, o acervo não é tocado', async () => {
    saveLibrary([makeWork({ title: 'preservado' })]);
    const file = path.join(dataDir(), 'library.enc');
    destroyVault();

    await expectVaultError(() => resetLibrary(), 'vaultLocked');
    expect(fs.existsSync(file)).toBe(true);
  });
});

describe('varredura de legados: removida com a migração', () => {
  beforeEach(() => {
    resetSandbox();
  });

  it('não existe mais: nada do app varre arquivo de versão antiga', async () => {
    // Registro da decisão de produto: com a migração do cofre, nenhuma versão
    // publicada escreve mais `dropbox-tokens.json`, `.vault/` em `~/.config` nem
    // acervo sem `.enc`. A varredura que apagava esse resíduo saiu junto, e o
    // app passou a tocar apenas no que ele mesmo escreve.
    destroyVault();
    await createVault(VAULT_INPUT);
    saveLibrary([makeWork()]);

    const config = configDir();
    fs.mkdirSync(path.join(config, '.vault'), { recursive: true });
    fs.writeFileSync(path.join(config, 'dropbox-tokens.json'), '{"accessToken":"abc"}');
    fs.writeFileSync(path.join(dataDir(), 'library.json'), '[{"title":"em claro"}]');

    // Nenhuma função de varredura existe para isso, e a manutenção do boot não
    // as chama: os arquivos antigos ficam intocados, como qualquer outro dado que
    // o app não reconhece.
    runDiskCleanup();

    expect(fs.existsSync(path.join(config, 'dropbox-tokens.json'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir(), 'library.json'))).toBe(true);
    // E o que o app de hoje escreve continua inteiro.
    expect(fs.existsSync(path.join(dataDir(), 'library.enc'))).toBe(true);
    expect(fs.existsSync(vaultPath())).toBe(true);
    expect(loadLibrary()).toHaveLength(1);
  });
});

describe('varredura de temporários órfãos', () => {
  beforeEach(() => {
    resetSandbox();
  });

  it('apaga .tmp mais velho que o limite e preserva o novo', () => {
    const dir = dataDir();
    fs.mkdirSync(dir, { recursive: true });
    const antigo = path.join(dir, 'library.enc.tmp');
    const novo = path.join(dir, 'outro.tmp');
    fs.writeFileSync(antigo, 'velho');
    fs.writeFileSync(novo, 'novo');
    const passado = Date.now() - 10_000_000;
    fs.utimesSync(antigo, passado / 1000, passado / 1000);

    sweepStaleTempFiles([vaultPath()], 60 * 60_000);

    expect(fs.existsSync(antigo)).toBe(false);
    expect(fs.existsSync(novo)).toBe(true);
  });

  it('não apaga arquivo que não é .tmp', () => {
    const dir = dataDir();
    fs.mkdirSync(dir, { recursive: true });
    const library = path.join(dir, 'library.enc');
    fs.writeFileSync(library, 'cifrado');

    sweepStaleTempFiles([vaultPath()], 0);

    expect(fs.existsSync(library)).toBe(true);
  });
});

describe('Erro de domínio', () => {
  it('expõe code e retryInMs', () => {
    const error = new VaultError('vaultLockedOut', 5000);
    expect(error.code).toBe('vaultLockedOut');
    expect(error.retryInMs).toBe(5000);
    expect(new VaultError('vaultLocked').retryInMs).toBeNull();
  });
});
