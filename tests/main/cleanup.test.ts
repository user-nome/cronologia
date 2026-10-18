import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STALE_TMP_MS,
  runDiskCleanup,
  sweepLegacySecrets,
  sweepPlaintextLibrary,
  sweepStaleTempFiles,
} from '@zero/main/cleanup';
import { cacheDir, configDir, coversDir, dataDir } from '@zero/main/paths';
import { vaultDir } from '@zero/main/vault';
import { resetSandbox, sandboxPath } from '../helpers/sandbox.ts';

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

function settingsFile(): string {
  return path.join(configDir(), 'settings.json');
}

beforeEach(() => {
  avaria.shredFalha = false;
  resetSandbox();
});

describe('varredura de legado em claro', () => {
  it('sobrescreve os tokens antigos e apaga a pasta do cofre velho', () => {
    const legado = path.join(configDir(), '.vault');
    write(path.join(legado, 'vault.zkv'), 'chave-antiga-em-claro');
    write(path.join(configDir(), 'dropbox-tokens.json'), '{"access_token":"antigo"}');
    write(path.join(configDir(), 'drive-tokens.json'), '{"access_token":"antigo"}');

    const result = sweepLegacySecrets();

    expect(result).toEqual({ shredded: 3, failed: 0 });
    // Pasta vazia some junto: o que não é segredo também não fica sobrando.
    expect(fs.existsSync(legado)).toBe(false);
    expect(fs.existsSync(path.join(configDir(), 'dropbox-tokens.json'))).toBe(false);
    expect(fs.existsSync(path.join(configDir(), 'drive-tokens.json'))).toBe(false);
  });

  it('não segue o que não é arquivo comum dentro do cofre velho', () => {
    const legado = path.join(configDir(), '.vault');
    fs.mkdirSync(path.join(legado, 'subpasta'), { recursive: true });
    write(path.join(legado, 'subpasta', 'entra.txt'), 'aninhado');

    const result = sweepLegacySecrets();

    // Só o arquivo raso é sobrescrito; a subpasta não é arquivo e a pasta fica.
    expect(result).toEqual({ shredded: 0, failed: 0 });
    expect(fs.existsSync(path.join(legado, 'subpasta', 'entra.txt'))).toBe(true);
  });

  it('lstat que falha trata a entrada como não arquivável, sem interromper', () => {
    write(path.join(configDir(), '.vault', 'chave.bin'), 'segredo');
    vi.spyOn(fs, 'lstatSync').mockImplementationOnce(() => {
      throw errno('ENOENT');
    });

    const result = sweepLegacySecrets();

    expect(result).toEqual({ shredded: 0, failed: 0 });
  });

  it('conta como falha o que o shred não conseguiu sobrescrever', () => {
    write(path.join(configDir(), 'dropbox-tokens.json'), '{"access_token":"antigo"}');
    avaria.shredFalha = true;

    expect(sweepLegacySecrets()).toEqual({ shredded: 0, failed: 1 });
    expect(sweepLegacySecrets()).toEqual({ shredded: 0, failed: 1 });
  });

  it('lista ilegível vira falha contada e a varredura segue', () => {
    write(path.join(configDir(), '.vault', 'chave.bin'), 'segredo');
    write(path.join(configDir(), 'dropbox-tokens.json'), '{"access_token":"antigo"}');
    vi.spyOn(fs, 'readdirSync').mockImplementationOnce(() => {
      throw errno('EIO');
    });

    const result = sweepLegacySecrets();

    expect(result).toEqual({ shredded: 1, failed: 1 });
    // A pasta do legado não some, mas o arquivo solto foi limpo.
    expect(fs.existsSync(path.join(configDir(), '.vault'))).toBe(true);
    expect(fs.existsSync(path.join(configDir(), 'dropbox-tokens.json'))).toBe(false);
  });

  it('settings.json só é apagado quando tem o campo legado enc', () => {
    write(settingsFile(), JSON.stringify({ enc: 'chave-em-claro', language: 'pt-BR' }));
    expect(sweepLegacySecrets()).toEqual({ shredded: 1, failed: 0 });
    expect(fs.existsSync(settingsFile())).toBe(false);
  });

  it('settings.json vivo (só idioma) nunca é removido', () => {
    write(settingsFile(), JSON.stringify({ language: 'pt-BR' }));

    expect(sweepLegacySecrets()).toEqual({ shredded: 0, failed: 0 });
    expect(fs.existsSync(settingsFile())).toBe(true);
  });

  it('settings.json ilegível não derruba a varredura', () => {
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw errno('EIO');
    });

    expect(sweepLegacySecrets()).toEqual({ shredded: 0, failed: 0 });
  });

  it('instalação nova não é erro: nada a remover', () => {
    expect(sweepLegacySecrets()).toEqual({ shredded: 0, failed: 0 });
  });
});

describe('varredura de acervo em claro', () => {
  it('sobrescreve o library.json antigo e as capas sem sufixo .enc', () => {
    write(path.join(dataDir(), 'library.json'), '{"works":[{"title":"Solo Leveling"}]}');
    write(path.join(coversDir(), 'capa.png'), 'imagem-em-claro');
    write(path.join(coversDir(), 'capa.png.enc'), 'cifrado-que-nao-toca');

    const result = sweepPlaintextLibrary();

    expect(result).toEqual({ shredded: 2, failed: 0 });
    expect(fs.existsSync(path.join(dataDir(), 'library.json'))).toBe(false);
    expect(fs.existsSync(path.join(coversDir(), 'capa.png'))).toBe(false);
    // O acervo cifrado de hoje é intocado.
    expect(fs.existsSync(path.join(coversDir(), 'capa.png.enc'))).toBe(true);
  });

  it('entrada que não é arquivo comum na pasta de capas é ignorada', () => {
    fs.mkdirSync(path.join(coversDir(), 'pasta.png'), { recursive: true });

    expect(sweepPlaintextLibrary()).toEqual({ shredded: 0, failed: 0 });
  });

  it('pasta de capas ilegível devolve a contagem parcial, sem exceção', () => {
    write(path.join(dataDir(), 'library.json'), '{"works":[]}');
    vi.spyOn(fs, 'readdirSync').mockImplementationOnce(() => {
      throw errno('EACCES');
    });

    expect(sweepPlaintextLibrary()).toEqual({ shredded: 1, failed: 0 });
  });
});

describe('varredura de temporários órfãos', () => {
  it('apaga só o .tmp velho das pastas do app e do cofre', () => {
    const antigo = Date.now() - STALE_TMP_MS - 60_000;
    const velhoData = write(path.join(dataDir(), 'library.json.tmp'), 'meio-de-gravacao');
    const velhoVault = write(path.join(vaultDir(), 'vault.zkv.tmp'), 'chave-pendente');
    write(path.join(configDir(), 'settings.json.tmp'), 'temporario-recente');
    fs.utimesSync(velhoData, antigo / 1000, antigo / 1000);
    fs.utimesSync(velhoVault, antigo / 1000, antigo / 1000);

    const result = sweepStaleTempFiles(vaultDir());

    expect(result).toEqual({ shredded: 2, failed: 0 });
    expect(fs.existsSync(velhoData)).toBe(false);
    expect(fs.existsSync(velhoVault)).toBe(false);
    // Temporário recente pode ser de uma escrita em curso: fica.
    expect(fs.existsSync(path.join(configDir(), 'settings.json.tmp'))).toBe(true);
  });

  it('ignora diretório, extensão que não é .tmp e o acervo cifrado', () => {
    const agora = Date.now();
    fs.mkdirSync(path.join(dataDir(), 'pasta.tmp'), { recursive: true });
    write(path.join(dataDir(), 'nota.txt'), 'nao-entra');
    const enc = write(path.join(dataDir(), 'library.json.enc'), 'cifrado');
    const vaultFile = write(path.join(vaultDir(), 'vault.zkv'), 'cifrado');
    for (const file of [enc, vaultFile]) {
      fs.utimesSync(
        file,
        (agora - STALE_TMP_MS - 60_000) / 1000,
        (agora - STALE_TMP_MS - 60_000) / 1000,
      );
    }

    expect(sweepStaleTempFiles(vaultDir())).toEqual({ shredded: 0, failed: 0 });
    expect(fs.existsSync(path.join(dataDir(), 'pasta.tmp'))).toBe(true);
    expect(fs.existsSync(enc)).toBe(true);
    expect(fs.existsSync(vaultFile)).toBe(true);
  });

  it('idade máxima é do chamador: o mesmo arquivo pode ser novo ou velho', () => {
    const file = write(path.join(cacheDir(), 'cache.tmp'), 'meio-de-gravacao');
    const agora = Date.now() - 1_000;
    fs.utimesSync(file, agora / 1000, agora / 1000);

    expect(sweepStaleTempFiles(vaultDir(), 10_000)).toEqual({ shredded: 0, failed: 0 });
    expect(sweepStaleTempFiles(vaultDir(), 100)).toEqual({ shredded: 1, failed: 0 });
  });

  it('stat que falha descarta a entrada em vez de apagar às cegas', () => {
    const file = write(path.join(dataDir(), 'library.json.tmp'), 'meio-de-gravacao');
    const antigo = Date.now() - STALE_TMP_MS - 60_000;
    fs.utimesSync(file, antigo / 1000, antigo / 1000);
    vi.spyOn(fs, 'statSync').mockImplementationOnce(() => {
      throw errno('ENOENT');
    });

    expect(sweepStaleTempFiles(vaultDir())).toEqual({ shredded: 0, failed: 0 });
    expect(fs.existsSync(file)).toBe(true);
  });

  it('pasta que não existe é pulada, não falha', () => {
    expect(fs.existsSync(vaultDir())).toBe(false);
    expect(sweepStaleTempFiles(vaultDir())).toEqual({ shredded: 0, failed: 0 });
  });

  it('shred que falha entra na contagem de falha da manutenção', () => {
    const antigo = Date.now() - STALE_TMP_MS - 60_000;
    const file = write(path.join(dataDir(), 'library.json.tmp'), 'meio-de-gravacao');
    fs.utimesSync(file, antigo / 1000, antigo / 1000);
    avaria.shredFalha = true;

    expect(sweepStaleTempFiles(vaultDir())).toEqual({ shredded: 0, failed: 1 });
  });
});

describe('manutenção no boot', () => {
  it('registra só a contagem, sem caminho do home no log', () => {
    write(path.join(dataDir(), 'library.json'), '{"works":[]}');
    const antigo = Date.now() - STALE_TMP_MS - 60_000;
    const file = write(path.join(configDir(), 'settings.json.tmp'), 'temporario-velho');
    fs.utimesSync(file, antigo / 1000, antigo / 1000);
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    runDiskCleanup(vaultDir());

    expect(aviso).toHaveBeenCalledTimes(1);
    const registrado = String(aviso.mock.calls[0]?.[0]);
    expect(registrado).toContain('2 arquivo(s) removido(s), 0 com falha.');
    expect(registrado).not.toContain(sandboxPath('XDG_DATA_HOME'));
  });

  it('fica em silêncio quando não há resíduo', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    runDiskCleanup(vaultDir());

    expect(aviso).not.toHaveBeenCalled();
  });

  it('falha de disco na varredura não impede o app de abrir', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(fs, 'existsSync').mockImplementation(() => {
      throw errno('EIO');
    });

    expect(() => runDiskCleanup(vaultDir())).not.toThrow();
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0]?.[0])).toBe('Falha na varredura de disco:');
  });

  it('a contagem de sucesso corresponde ao arquivo que sumiu do disco', () => {
    const legado = write(path.join(configDir(), 'dropbox-tokens.json'), 'segredo-antigo');
    expect(fs.existsSync(legado)).toBe(true);

    expect(sweepLegacySecrets()).toEqual({ shredded: 1, failed: 0 });
    expect(fs.existsSync(legado)).toBe(false);
  });
});
