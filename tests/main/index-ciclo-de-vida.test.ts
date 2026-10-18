import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
// O import registra os `app.on` do processo main; o `electron` real entra pelo
// alias do `vitest.config.mts`.
import '@zero/main/index';
import { app, BrowserWindow } from '../mocks/electron.ts';

/**
 * Invariantes de "o app não fica rodando depois de fechado".
 *
 * Não são detalhes de implementação: são o contrato que qualquer pessoa espera
 * de um app de desktop no Linux, e cada um já esteve no radar como "melhoria"
 * por alguém. Um app de leitura que fica na bandeja depois de fechar a janela
 * continua consumindo memória, CPU e (com backup ligado) rede, sem ninguém ter
 * pedido. O projeto de referência (Guardinha/Cofre) é explícito nisso, e aqui
 * também é.
 *
 * A divisão com os outros testes é deliberada:
 *
 * - `e2e/quit.e2e.test.ts` trava o **efeito**: fecha a janela e prova que o
 *   processo principal sai;
 * - `tests/main/index.test.ts` trava o `quit()` disparado pelo
 *   `window-all-closed` e a limpeza da chave no `before-quit`;
 * - este arquivo trava a **ausência dos mecanismos** que produziriam o
 *   comportamento, porque nenhum deles aparece em falha de tela: uma bandeja,
 *   um `preventDefault` no `close` ou um registro de sessão só se veem no `ps`,
 *   no painel do desktop ou no consumo de energia.
 *
 * Dois testes olham o texto do fonte em vez de chamar código. É o mesmo
 * recurso do `tests/build/apparmor-profile.test.ts` e vale pelos mesmos
 * motivos: o que se guarda aqui é a **ausência de uma API**, e não há como
 * observar "isto não foi chamado" pela interface pública do módulo.
 */

/** Código de um arquivo do `src/`, sem comentários: `Tray` citado num comentário não conta. */
function codigo(relativo: string): string {
  const fonte = fs.readFileSync(path.join(import.meta.dirname, '../../src/', relativo), 'utf-8');
  return fonte
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

describe('o app não sobrevive ao fechamento da janela', () => {
  it('não cria Tray: sem ícone na área de notificação', () => {
    // `new Tray(...)` é o caminho mais comum para "o app continua vivo", e é
    // exatamente o que a pessoa reconhece como "ficou na bandeja".
    expect(codigo('main/index.ts')).not.toMatch(/\bTray\b/);
  });

  it('não oculta a janela em vez de fechá-la', () => {
    // O outro caminho para o mesmo efeito é `on('close', e => e.preventDefault())`
    // seguido de `hide()`: o "X" some da tela e o processo fica. É bandeja
    // disfarçada, e o `preventDefault` no `close` é o que denuncia.
    expect(codigo('main/index.ts')).not.toMatch(/\.hide\(\)/);
    for (const janela of BrowserWindow.instances) {
      const close = janela.on.mock.calls.find(([event]) => event === 'close');
      expect(close, 'a janela não deve ter listener de "close"').toBeUndefined();
    }
  });

  it('não se registra para abrir junto com a sessão', () => {
    // `setLoginItemSettings` é o outro jeito de o app voltar sozinho, agora ou
    // depois de um "deixei marcado" que ninguém lembra de ter ligado.
    expect(codigo('main/index.ts')).not.toMatch(/setLoginItemSettings/);
  });

  it('encerra quando a última janela fecha', () => {
    // O comportamento (e a exceção do macOS) está em `index.test.ts`; aqui o
    // que importa é que o handler exista e não esteja comentado.
    const registrado = app.on.mock.calls.map(([event]) => event);
    expect(registrado).toContain('window-all-closed');
  });

  it('não mantém temporizador de fundo depois de encerrar', () => {
    // O auto-lock do cofre é um `setTimeout` de disparo único, desmarcado no
    // `wipe()` (que o `before-quit` chama). O que estouraria o orçamento é um
    // `setInterval` continuando a girar com a janela fechada.
    const sessao = codigo('main/vault/session.ts');
    expect(sessao).not.toMatch(/setInterval/);
    expect(sessao).toMatch(/clearTimeout/);
  });

  it('não usa proxy de suspensão de energia', () => {
    // `powerSaveBlocker` existe para vídeo em primeiro plano; num app de
    // leitura ele impede a máquina de dormir com a janela fechada.
    expect(codigo('main/index.ts')).not.toMatch(/powerSaveBlocker/);
  });
});
