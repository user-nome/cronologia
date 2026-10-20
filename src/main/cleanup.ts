import fs from 'fs';
import path from 'path';
import type { ShredCounts } from '@zero/types';
import { cacheDir, configDir, dataDir } from '@zero/main/paths';
import { vaultDir } from '@zero/main/vault/store';
import { shredFile } from '@zero/main/shred';

/**
 * Varredura de disco que roda no boot, antes de a interface responder.
 *
 * O que sobra para limpar aqui é o **temporário órfão**: um `.tmp` de escrita
 * interrompida não é coberto por nenhuma limpeza, porque o app só conhece os
 * nomes finais. É a única coisa que ainda cabe aqui.
 *
 * Antes desta versão o módulo também apagava o resíduo de duas gerações
 * anteriores (segredos do Dropbox em claro e biblioteca sem cifrar). Isso saiu
 * junto com a migração do cofre: nenhuma versão publicada usa mais esses
 * formatos, e manter varredura para arquivo que o app não escreve é código que
 * só promete uma proteção que ninguém mais precisa.
 */

/**
 * Temporário mais novo que isto é deixado intacto: pode ser de uma escrita em
 * curso no momento da varredura.
 */
export const STALE_TMP_MS = 60 * 60_000;

/**
 * Sobrescreve `.tmp` órfãos das pastas do app e do cofre. O `.enc` e o
 * `vault.zkv` **não** entram aqui: são apagados pelo próprio domínio, na
 * operação que os substitui.
 */
export function sweepStaleTempFiles(dirs: readonly string[], maxAgeMs = STALE_TMP_MS): ShredCounts {
  const result: ShredCounts = { shredded: 0, failed: 0 };
  const now = Date.now();
  for (const dir of [...dirs, dataDir(), configDir(), cacheDir()]) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.tmp')) continue;
      const full = path.join(dir, path.basename(entry.name));
      try {
        if (now - fs.statSync(full).mtimeMs < maxAgeMs) continue;
      } catch {
        continue;
      }
      count(shredFile(full), result);
    }
  }
  return result;
}

function count(shredded: boolean, result: ShredCounts): void {
  if (shredded) result.shredded += 1;
  else result.failed += 1;
}

/**
 * Roda a varredura e registra o resultado.
 *
 * Fica aqui, e não no boot do `index.ts`, para que o módulo seja dono do seu
 * próprio log e o `initApp` não ganhe um bloco de manutenção de disco. Nunca
 * lança: uma falha aqui só significa que a limpeza não aconteceu agora, e
 * impedir o app de abrir por causa disso seria pior do que o resíduo.
 */
export function runDiskCleanup(): void {
  try {
    const { shredded, failed } = sweepStaleTempFiles([vaultDir()]);
    if (shredded > 0 || failed > 0) {
      // Sem caminho completo no log: ele revelaria a estrutura do home.
      console.warn(`Varredura de disco: ${shredded} arquivo(s) removido(s), ${failed} com falha.`);
    }
  } catch (error) {
    console.warn('Falha na varredura de disco:', error);
  }
}
