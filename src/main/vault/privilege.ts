import { spawnSync } from 'node:child_process';
import path from 'node:path';

/**
 * Resultado do pedido de autenticação para criar/reparar `/var/lib`:
 * - `ok`: o helper terminou com exit 0 (pasta pronta);
 * - `cancelled`: o usuário dispensou a caixinha de senha (pkexec 126);
 * - `failed`: não deu para sequer tentar (sem pkexec, timeout, exit 127).
 */
export type VaultSetupResult = 'ok' | 'cancelled' | 'failed';

function hasVaultOverride(): boolean {
  const dir = process.env.CRONOLOGIA_VAULT_DIR;
  if (dir !== undefined && dir !== '') return true;
  const varLib = process.env.CRONOLOGIA_VAR_LIB;
  return varLib !== undefined && varLib !== '';
}

/**
 * Tempo que o helper pode ficar esperando pela senha do sistema.
 *
 * Dois minutos: é o que a caixinha do PolicyKit costuma levar para a pessoa
 * digitar a senha, e o que o app espera antes de desistir e devolver `failed`.
 */
export const PKEXEC_TIMEOUT_MS = 120_000;

/** O `pkexec` saiu com 126: a pessoa dispensou o diálogo de autenticação. */
const PKEXEC_DISMISSED = 126;

/**
 * Pede autenticação de administrador para criar/reparar a estrutura de
 * `/var/lib/.cronologia` via `pkexec`: a caixinha de senha é a do
 * próprio sistema (PolicyKit/Mint) e o app nunca vê a senha. O alvo é o
 * helper `cronologia-setup` do pacote, que só cria diretórios fixos.
 *
 * Com override de teste/dev (`CRONOLOGIA_VAULT_DIR`/`CRONOLOGIA_VAR_LIB`) nunca
 * dispara (e devolve `failed`, para o chamador não insistir em loop).
 */
export function setupVaultDirectory(): VaultSetupResult {
  if (hasVaultOverride()) return 'failed';
  try {
    // Electron define process.resourcesPath; em teste/node pode não existir
    const resources = (process as { resourcesPath?: string }).resourcesPath ?? '';
    const helper = path.join(resources, 'cronologia-setup');
    const result = spawnSync('pkexec', [helper], { timeout: PKEXEC_TIMEOUT_MS });
    if (result.status === 0) return 'ok';
    // 126 = diálogo dispensado; 127 = pkexec recusou/não achou o programa (e
    // qualquer outro status é falha do mesmo jeito).
    return result.status === PKEXEC_DISMISSED ? 'cancelled' : 'failed';
  } catch {
    return 'failed';
  }
}
