import { describe, expect, it } from 'vitest';
import { ipcErrorMessage } from '@zero/renderer/errors';

/**
 * O Electron embrulha a rejeição de `ipcRenderer.invoke` num `Error` com o
 * prefixo `Error invoking remote method 'x': `. O prefixo é ruído para quem lê
 * a tela, e o main já manda a mensagem localizada — então o que resta aqui é
 * tirar o embrulho sem perder a mensagem.
 */
describe('mensagem de erro do IPC', () => {
  it('tira o prefixo do método remoto', () => {
    expect(
      ipcErrorMessage(
        new Error("Error invoking remote method 'library:get': A biblioteca estádanificada."),
      ),
    ).toBe('A biblioteca estádanificada.');
  });

  it('tira também o "Error:" que o Electron coloca depois do prefixo', () => {
    expect(
      ipcErrorMessage(
        new Error("Error invoking remote method 'library:get': Error: O cofre está fechado."),
      ),
    ).toBe('O cofre está fechado.');
  });

  it('mantém a mensagem inteira quando ela tem quebra de linha', () => {
    // O regex tem que ser guloso (`[\s\S]`): uma mensagem de duas linhas
    // truncada na metade é pior que a mensagem com o prefixo.
    expect(
      ipcErrorMessage(
        new Error("Error invoking remote method 'library:get': primeira linha\nsegunda linha"),
      ),
    ).toBe('primeira linha\nsegunda linha');
  });

  it('devolve a mensagem como veio quando não há prefixo', () => {
    expect(ipcErrorMessage(new Error('falha pura'))).toBe('falha pura');
  });

  it('aceita valor que não é Error', () => {
    expect(ipcErrorMessage('texto solto')).toBe('texto solto');
    expect(ipcErrorMessage(undefined)).toBe('undefined');
  });
});
