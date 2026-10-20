/**
 * Mensagem de erro que chegou do processo main.
 *
 * O Electron embrulha a rejeição de um `ipcRenderer.invoke` em
 * `Error invoking remote method 'x': ...`, e o prefixo é ruído para quem lê a
 * tela. O main já manda a mensagem **localizada** (o código do cofre não
 * sobrevive ao IPC), então o que resta é tirar o embrulho.
 *
 * A função é pura e mora fora do componente porque três telas precisam da
 * mesma coisa: a grade, o modal de obra e o modal de configurações.
 */

/** Prefixo que o Electron coloca na rejeição de `ipcRenderer.invoke`. */
const IPC_PREFIX = /^Error invoking remote method '[^']+': (?:Error: )?([\s\S]*)$/;

/**
 * Texto a exibir para um erro vindo do IPC.
 *
 * Sem `Error` no valor, cai no `String` do próprio: um erro que não é
 * `Error` continua sendo informação, e a tela não pode ficar em branco.
 */
export function ipcErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const wrapped = IPC_PREFIX.exec(raw);
  return wrapped?.[1] ?? raw;
}
