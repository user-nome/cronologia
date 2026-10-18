import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchBundled } from './support/launch.ts';
import type { LaunchedApp } from './support/launch.ts';

/**
 * Fechar a janela **encerra** o app.
 *
 * Este arquivo existe porque essa é a única garantia do app que nenhuma
 * asserção de tela pega: uma bandeja, um `on('close')` com
 * `preventDefault()` ou um `setLoginItemSettings` defiantem o app a continuar
 * rodando com a janela fechada, e o sintoma (memória, CPU, rede consumidos sem
 * ninguém pedir) só aparece no `ps` e no painel do desktop. A suíte de unidade
 * trava a ausência dos mecanismos; esta trava o efeito.
 *
 * Vale para o alvo empacotado (`out/`) porque é onde dá para observar o PID:
 * o `.deb` roda com o fusível de inspeção desligado e o runner não tem o PID do
 * processo principal (ver `launch.ts`).
 *
 * Instância própria, separada da jornada de `bundled.e2e.test.ts`: fechar a
 * janela destrói o app, e a jornada precisa dele vivo até o fim.
 */

/** Folga para o processo sair depois do `quit()`; oElectron leva ~1 s. */
const SAIR_TIMEOUT_MS = 15_000;
const SAIR_POLL_MS = 250;

/** Espera o processo principal sumir; `true` se sumir dentro da folga. */
async function saiuSozinho(app: LaunchedApp): Promise<boolean> {
  const limite = Date.now() + SAIR_TIMEOUT_MS;
  while (Date.now() < limite) {
    if (!app.isRunning()) return true;
    await new Promise((resolve) => setTimeout(resolve, SAIR_POLL_MS));
  }
  return !app.isRunning();
}

describe('Fechar a janela encerra o app', () => {
  let app: LaunchedApp | undefined;

  beforeAll(async () => {
    app = await launchBundled();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    app = undefined;
  });

  it('o processo principal morre junto com a janela', async () => {
    const atual = app;
    if (atual === undefined) throw new Error('O app não foi iniciado.');
    const pid = atual.pid;
    expect(pid).toBeTypeOf('number');
    expect(atual.isRunning()).toBe(true);

    // Fecha pelo próprio X da janela, e não por `app.quit()`: o que se quer
    // provar é que o "X" da pessoa encerra o app.
    await atual.page.close({ runBeforeUnload: true });

    expect(await saiuSozinho(atual)).toBe(true);
    expect(atual.isRunning()).toBe(false);
  });
});
