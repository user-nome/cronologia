/**
 * Fronteira do IPC: o que o app consegue ver do evento que o Electron entrega a
 * cada handler.
 *
 * Vive em `src/types/` porque a checagem é regra de **segurança** e precisa de
 * nome, não de um `as` inline em `main/index.ts`: `assertAppFrame` é o que
 * barra uma página de terceiro de chamar os canais do cofre e da biblioteca, e
 * um tipo escrito na hora é exatamente o tipo que se esquece de atualizar quando
 * a barra muda.
 */

import type { Untrusted } from '@zero/types/errors';

/**
 * O frame que emitiu o pedido.
 *
 * `url` fica `Untrusted` (isto é, `unknown`) de propósito, e é a única coisa
 * neste arquivo que fica: o valor vem do processo do navegador, então a única
 * afirmação segura sobre ele é que não é uma string até `isAppFrameUrl`
 * conferir. `senderFrame` é `null` quando o pedido não veio de um frame (e
 * `undefined` quando a versão do Electron não o traz), e nos dois casos o
 * pedido é recusado.
 */
export interface IpcSenderFrame {
  url?: Untrusted;
}

/**
 * O evento de `ipcMain.handle`, reduzido ao que `assertAppFrame` lê.
 *
 * O tipo é estrutural de propósito: o handler recebe o `IpcMainInvokeEvent`
 * completo do Electron e passa para cá, sem `as` nem cast, porque o
 * `IpcSenderFrame` acima é subconjunto dele.
 */
export interface IpcFrameEvent {
  senderFrame?: IpcSenderFrame | null;
}
