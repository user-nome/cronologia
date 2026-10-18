import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import RestorePasswordModal from '@zero/renderer/components/RestorePasswordModal';
import { messages } from '@zero/messages';

/**
 * O modal da senha do backup é uma etapa de confirmação, não um formulário:
 * ele entrega a senha digitada para o fluxo de restauração e some. O que ele
 * **não** faz é validar: quem recusa a senha errada é o backup (o contador de
 * tentativas mora no main). Por isso os testes olham o que sai daqui, não o que
 * o main faz com o que saiu.
 */

const m = messages('pt-BR');

interface SetupResult {
  onConfirm: Mock<(passphrase: string) => void>;
  onCancel: Mock<() => void>;
}

/**
 * O provedor entra como rótulo porque o banner diz de qual nuvem vem o backup
 * ("usada ao fazer o backup no Dropbox" / "... no Google Drive"). Com um só
 * destino o texto era fixo; agora o mesmo modal cobre os dois.
 */
function setup(provider = 'Dropbox'): SetupResult {
  const onConfirm = vi.fn<(passphrase: string) => void>();
  const onCancel = vi.fn<() => void>();
  render(<RestorePasswordModal provider={provider} onConfirm={onConfirm} onCancel={onCancel} />);
  return { onConfirm, onCancel };
}

/**
 * O campo é localizado pelo texto de apoio porque o `label` do componente não
 * tem `htmlFor` nem `id` no input (lacuna de associação, a ser corrigida no
 * componente: no `VaultModal` o par `htmlFor`/`id` existe).
 */
function passphraseField(): HTMLElement {
  return screen.getByPlaceholderText(m.restore.passphrasePlaceholder);
}

function overlayOf(node: Element): HTMLElement {
  const overlay = node.closest<HTMLElement>('.overlay');
  if (overlay === null) throw new Error('Overlay do modal não encontrado.');
  return overlay;
}

describe('RestorePasswordModal: o que ele oferece', () => {
  it('foca a senha de criptografia já na abertura', () => {
    setup();
    // A pessoa chega aqui depois de escolher "Restaurar": digitar tem de ser o
    // próximo passo, sem precisar achar o campo.
    expect(passphraseField()).toHaveFocus();
  });

  it('pede a senha do backup em campo escondido e começa vazio', () => {
    setup();
    const field = passphraseField();
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveValue('');
    expect(screen.getByText(m.restore.passphraseLabel)).toBeInTheDocument();
  });

  it('a senha digitada fica no campo e não vaza para a tela', async () => {
    setup();
    const user = userEvent.setup();
    await user.type(passphraseField(), 'cafe-estrela-77');

    // A senha do backup é o mesmo segredo da chave de cifragem: ela não pode
    // aparecer em texto plano na tela.
    expect(passphraseField()).toHaveValue('cafe-estrela-77');
    expect(document.body.textContent).not.toContain('cafe-estrela-77');
  });

  it('destaca no aviso a senha que é a do backup, não a do cofre', () => {
    setup();
    // São duas senhas diferentes na cabeça de quem usa: a do app e a do backup.
    // O negrito do aviso é o que separa as duas antes do erro.
    const destaque = screen.getByText('fazer o backup', { selector: 'strong' });
    expect(destaque.closest('.banner')).not.toBeNull();
    // O destaque vem do marcador `**...**` do bundle, não de um negrito solto.
    expect(m.restore.banner('Dropbox')).toContain(`**${destaque.textContent}**`);
  });
});

describe('RestorePasswordModal: confirmar', () => {
  it('entrega a senha digitada ao fluxo de restauração', async () => {
    const { onConfirm, onCancel } = setup();
    const user = userEvent.setup();

    await user.type(passphraseField(), 'cafe-estrela-77');
    await user.click(screen.getByRole('button', { name: m.restore.action }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('cafe-estrela-77');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Enter confirma sem passar pelo botão', async () => {
    const { onConfirm } = setup();
    const user = userEvent.setup();

    await user.type(passphraseField(), 'cafe-estrela-77{Enter}');

    expect(onConfirm).toHaveBeenCalledWith('cafe-estrela-77');
  });

  it('uma tecla que não é Enter não confirma', async () => {
    const { onConfirm } = setup();
    const user = userEvent.setup();

    await user.type(passphraseField(), 'cafe-estrela-77');

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirma mesmo vazio: quem recusa a senha errada é o backup', () => {
    const { onConfirm } = setup();

    // Este modal não valida a senha (a do cofre tem medidor de força; a do
    // backup não tem regra local). Filtrar aqui esconderia o erro do main e a
    // contagem de tentativas que ele controla.
    fireEvent.click(screen.getByRole('button', { name: m.restore.action }));

    expect(onConfirm).toHaveBeenCalledWith('');
  });
});

describe('RestorePasswordModal: sair sem confirmar', () => {
  it('Cancelar fecha sem entregar senha nenhuma', async () => {
    const { onConfirm, onCancel } = setup();
    const user = userEvent.setup();

    await user.type(passphraseField(), 'cafe-estrela-77');
    await user.click(screen.getByRole('button', { name: m.common.cancel }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('o X e o clique fora do cartão fecham; o clique dentro não', () => {
    const { onConfirm, onCancel } = setup();
    const card = screen.getByRole('heading', { name: m.restore.title }).closest('.modal');
    if (card === null) throw new Error('Cartão do modal não encontrado.');

    fireEvent.click(screen.getByRole('button', { name: m.common.close }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Digitar e clicar no texto do aviso é leitura, não cancelamento.
    fireEvent.mouseDown(card);
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(overlayOf(card));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
