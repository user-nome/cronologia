import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STALE_TMP_MS, runDiskCleanup, sweepStaleTempFiles } from '@zero/main/cleanup';
import { cacheDir, configDir, dataDir } from '@zero/main/paths';
import { vaultDir } from '@zero/main/vault';
import { resetSandbox, sandboxPath } from '../helpers/sandbox.ts';

/**
 * A varredura de disco cuida de uma coisa só: o `.tmp` que sobrou de uma
 * escrita interrompida. As varreduras de legado (segredos do Dropbox em claro e
 * acervo sem cifrar) saíram junto com a migração do cofre, e o teste abaixo é
 * também o registro dessa decisão: o app não deve mais tocar em nenhum arquivo
 * fora do que ele mesmo escreve.
 */

// A varredura nunca pode falhar por causa de um arquivo: o `shredFile` real
// devolve `false` nesse caso. Este sinalizador reproduz a mesma resposta para
// exercitar a contagem de falha sem depender de permissão do sistema de
// arquivos (o teste pode estar rodando como root).
const avaria = vi.hoisted(() => ({ shredFalha: false }));

vi.mock('@zero/main/shred', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zero/main/shred')>();
  return {
    ...actual,
    shredFile: (file: string, passes?: number): boolean => {
      if (avaria.shredFalha) return false;
      return actual.shredFile(file, passes);
    },
  };
});

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

function write(file: string, content: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}

/** Envelhece o arquivo para o teto padrão da varredura o considerar órfão. */
function envelhecer(file: string, extraMs = 60_000): void {
  const antigo = (Date.now() - STALE_TMP_MS - extraMs) / 1000;
  fs.utimesSync(file, antigo, antigo);
}

beforeEach(() => {
  avaria.shredFalha = false;
  resetSandbox();
});

describe('varredura de temporários órfãos', () => {
  it('apaga só o .tmp velho das pastas do app e do cofre', () => {
    const velhoData = write(path.join(dataDir(), 'library.json.tmp'), 'meio-de-gravacao');
    const velhoVault = write(path.join(vaultDir(), 'vault.zkv.tmp'), 'chave-pendente');
    write(path.join(configDir(), 'settings.json.tmp'), 'temporario-recente');
    write(path.join(cacheDir(), 'thumbs.db.tmp'), 'temporario-recente');
    envelhecer(velhoData);
    envelhecer(velhoVault);

    const result = sweepStaleTempFiles([vaultDir()]);

    expect(result).toEqual({ shredded: 2, failed: 0 });
    expect(fs.existsSync(velhoData)).toBe(false);
    expect(fs.existsSync(velhoVault)).toBe(false);
    // Temporário recente pode ser de uma escrita em curso: fica.
    expect(fs.existsSync(path.join(configDir(), 'settings.json.tmp'))).toBe(true);
    expect(fs.existsSync(path.join(cacheDir(), 'thumbs.db.tmp'))).toBe(true);
  });

  it('ignora diretório, extensão que não é .tmp e o acervo cifrado', () => {
    fs.mkdirSync(path.join(dataDir(), 'pasta.tmp'), { recursive: true });
    write(path.join(dataDir(), 'nota.txt'), 'nao-entra');
    const enc = write(path.join(dataDir(), 'library.json.enc'), 'cifrado');
    const vaultFile = write(path.join(vaultDir(), 'vault.zkv'), 'cifrado');
    envelhecer(enc);
    envelhecer(vaultFile);

    expect(sweepStaleTempFiles([vaultDir()])).toEqual({ shredded: 0, failed: 0 });
    expect(fs.existsSync(path.join(dataDir(), 'pasta.tmp'))).toBe(true);
    expect(fs.existsSync(enc)).toBe(true);
    expect(fs.existsSync(vaultFile)).toBe(true);
  });

  it('idade máxima é do chamador: o mesmo arquivo pode ser novo ou velho', () => {
    const file = write(path.join(cacheDir(), 'cache.tmp'), 'meio-de-gravacao');
    envelhecer(file, -STALE_TMP_MS + 1_000);

    expect(sweepStaleTempFiles([vaultDir()], 10_000)).toEqual({ shredded: 0, failed: 0 });
    expect(sweepStaleTempFiles([vaultDir()], 100)).toEqual({ shredded: 1, failed: 0 });
  });

  it('stat que falha descarta a entrada em vez de apagar às cegas', () => {
    const file = write(path.join(dataDir(), 'library.json.tmp'), 'meio-de-gravacao');
    envelhecer(file);
    vi.spyOn(fs, 'statSync').mockImplementationOnce(() => {
      throw errno('ENOENT');
    });

    expect(sweepStaleTempFiles([vaultDir()])).toEqual({ shredded: 0, failed: 0 });
    expect(fs.existsSync(file)).toBe(true);
  });

  it('pasta que não existe é pulada, não falha', () => {
    expect(fs.existsSync(vaultDir())).toBe(false);
    expect(sweepStaleTempFiles([vaultDir()])).toEqual({ shredded: 0, failed: 0 });
  });

  it('shred que falha entra na contagem de falha da manutenção', () => {
    const file = write(path.join(dataDir(), 'library.json.tmp'), 'meio-de-gravacao');
    envelhecer(file);
    avaria.shredFalha = true;

    expect(sweepStaleTempFiles([vaultDir()])).toEqual({ shredded: 0, failed: 1 });
  });

  it('lê diretório explicitado além das pastas padrão', () => {
    const extra = write(path.join(dataDir(), '..', 'extra', 'x.tmp'), 'meio-de-gravacao');
    envelhecer(extra);

    // Sem listar a pasta, nada fora do padrão é tocado: quem chama diz o que é
    // pasta do app, e a varredura não sai varrendo o home.
    expect(sweepStaleTempFiles([])).toEqual({ shredded: 0, failed: 0 });
    expect(fs.existsSync(extra)).toBe(true);
    expect(sweepStaleTempFiles([path.join(dataDir(), '..', 'extra')])).toEqual({
      shredded: 1,
      failed: 0,
    });
  });
});

describe('a varredura não toca em nada que o app não escreva', () => {
  it('nem arquivo de versão antiga, nem de pasta que não é do app', () => {
    const legadoToken = write(path.join(configDir(), 'dropbox-tokens.json'), '{"t":"antigo"}');
    const legadoBiblioteca = write(path.join(dataDir(), 'library.json'), '{"works":[]}');
    const legadoCapa = write(path.join(dataDir(), '..', 'covers', 'capa.png'), 'imagem');

    runDiskCleanup();

    // Registro da decisão: nenhuma versão publicada escreve mais esses nomes, e
    // varrer arquivo de Stranger é código que promete proteção que ninguém
    // precisa.
    expect(fs.existsSync(legadoToken)).toBe(true);
    expect(fs.existsSync(legadoBiblioteca)).toBe(true);
    expect(fs.existsSync(legadoCapa)).toBe(true);
  });
});

describe('manutenção no boot', () => {
  it('registra só a contagem, sem caminho do home no log', () => {
    write(path.join(dataDir(), 'library.json.tmp'), 'meio-de-gravacao');
    const velho = write(path.join(configDir(), 'settings.json.tmp'), 'temporario-velho');
    envelhecer(velho);
    envelhecer(path.join(dataDir(), 'library.json.tmp'));
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    runDiskCleanup();

    expect(aviso).toHaveBeenCalledTimes(1);
    const registrado = String(aviso.mock.calls[0]?.[0]);
    expect(registrado).toContain('2 arquivo(s) removido(s), 0 com falha.');
    expect(registrado).not.toContain(sandboxPath('XDG_DATA_HOME'));
  });

  it('fica em silêncio quando não há resíduo', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    runDiskCleanup();

    expect(aviso).not.toHaveBeenCalled();
  });

  it('falha de disco na varredura não impede o app de abrir', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // A pasta de dados existe mas não pode ser listada: a varredura engole a
    // falha e o boot segue, porque resíduo no disco é melhor que app fechado.
    vi.spyOn(fs, 'readdirSync').mockImplementation(() => {
      throw errno('EIO');
    });
    vi.spyOn(fs, 'rmdirSync').mockImplementation(() => {
      throw errno('EIO');
    });

    expect(() => runDiskCleanup()).not.toThrow();
    expect(aviso).not.toHaveBeenCalled();
  });
});
