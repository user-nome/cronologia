import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * O sandbox do `npm run dev` precisa ser **completo**: cofre e dados.
 *
 * O acervo (`library.enc`) e as capas são cifrados com a chave-mestra do
 * cofre. Dev com o cofre de `/var/lib` e a biblioteca de `~/.local/share`
 * casaria; o inverso — cofre novo do dev com o acervo do app instalado — é
 * ilegível, e o app acusa `libraryTampered` sem que ninguém tenha adulterado
 * nada. Foi exatamente o que aconteceu: o dev abria um cofre de sandbox
 * (`.dev-vault`) e lia a biblioteca do app instalado
 * (`~/.local/share/cronologia/library.enc`).
 *
 * Por isso o script precisa apontar as **quatro** variáveis: cofre, dados,
 * configuração e cache. Um teste que só checasse o cofre passaria com o
 * acervo quebrado de novo.
 */

const ROOT = path.join(import.meta.dirname, '../..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'bin/dev.sh'), 'utf-8');

/** Só as linhas de código do script: o comentário explica o porquê. */
const EXPORTS = SCRIPT.split('\n')
  .map((line) => line.trim())
  .filter((line) => line.startsWith('export '));

interface PackageManifest {
  scripts: Record<string, string>;
}

const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'),
) as PackageManifest;

/** Variáveis que o sandbox tem de mover, e o motivo de cada uma. */
const SANDBOX_VARS = [
  'CRONOLOGIA_VAULT_DIR',
  'XDG_DATA_HOME',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
] as const;

describe('sandbox do npm run dev', () => {
  it('move o cofre e as três pastas XDG', () => {
    for (const name of SANDBOX_VARS) {
      expect(EXPORTS.some((line) => line.startsWith(`export ${name}=`))).toBe(true);
    }
  });

  it('aponta o sandbox para dentro do repositório, e não para o home', () => {
    // O acervo, as settings e o cache do app instalado ficam em `~`; o dev
    // escreve nos mesmos lugares se não for redirecionado.
    for (const name of SANDBOX_VARS) {
      const linha = EXPORTS.find((line) => line.startsWith(`export ${name}=`));
      expect(linha).toBeDefined();
      expect(linha).toContain('$ROOT');
    }
  });

  it('não deixa o dev tocar em /var/lib nem pedir senha de administrador', () => {
    // O cofre de sandbox é o que evita o `pkexec`: o dev nunca abre a caixinha
    // de senha do sistema para reparar a pasta do cofre.
    expect(EXPORTS.join('\n')).not.toContain('CRONOLOGIA_VAR_LIB');
    expect(EXPORTS.join('\n')).not.toContain('/var/lib');
  });

  it('é o caminho de todos os scripts de dev', () => {
    // Se alguém voltar a escrever as variáveis inline no `package.json`, o
    // sandbox volta a ser parcial (ou a sumir) sem ninguém notar.
    expect(MANIFEST.scripts.dev).toBe('bin/dev.sh');
    expect(MANIFEST.scripts['dev:inspect']).toBe('bin/dev.sh --inspect 5858');
    expect(MANIFEST.scripts['dev:inspect-brk']).toBe('bin/dev.sh --inspectBrk 5858');
  });

  it('ignora o sandbox do dev no versionamento e no formatação', () => {
    // O acervo do dev é dado do usuário (cifrado, mas dado): não entra no git.
    const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf-8');
    const prettierignore = fs.readFileSync(path.join(ROOT, '.prettierignore'), 'utf-8');
    expect(gitignore).toContain('.dev-home');
    expect(prettierignore).toContain('.dev-home/');
  });
});
