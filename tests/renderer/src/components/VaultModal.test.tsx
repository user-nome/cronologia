import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import VaultModal from '@zero/renderer/components/VaultModal';
import { messages } from '@zero/messages';
import type { VaultResult } from '@zero/types';
import { createApiMock, installApiMock } from '../../../helpers/api.ts';
import type { ApiMock } from '../../../helpers/api.ts';

/**
 * O cofre é a barreira do app: sem ele não há acervo para mostrar. O teste
 * olha duas decisões que a pessoa sente na tela, e não a chamada crua do main:
 * quando a senha pode ser enviada e o que a trava mostra enquanto espera.
 */

const m = messages('pt-BR');

interface SetupResult {
  mock: ApiMock;
  onClose: Mock<() => void>;
  onUnlocked: Mock<() => void>;
}

function setup(): SetupResult {
  const mock = createApiMock();
  installApiMock(mock);
  const onClose = vi.fn<() => void>();
  const onUnlocked = vi.fn<() => void>();
  return { mock, onClose, onUnlocked };
}

function passwordField(): HTMLElement {
  return screen.getByLabelText(m.vault.passwordLabel);
}

describe('VaultModal: criação', () => {
  it('recusa confirmação diferente sem chamar o backend', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Senha mestra'), 'segredo-longo-123');
    await user.type(screen.getByLabelText('Confirmar a senha'), 'outra-senha-456');
    await user.click(screen.getByRole('button', { name: /Criar cofre/ }));

    expect(await screen.findByText('As senhas não coincidem.')).toBeInTheDocument();
    expect(mock.vaultCreate).not.toHaveBeenCalled();
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it('mostra o medidor de força da senha digitada', async () => {
    const { onClose, onUnlocked } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Senha mestra'), 'abc123');
    expect(await screen.findByText('Fraca')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Senha mestra'));
    await user.type(screen.getByLabelText('Senha mestra'), 'casa-azul-7x');
    expect(await screen.findByText('Razoável')).toBeInTheDocument();
  });

  it('cria o cofre com senha válida e avisa o fluxo pendente', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Senha mestra'), 'uva-preta-42-estrela');
    await user.type(screen.getByLabelText('Confirmar a senha'), 'uva-preta-42-estrela');
    await user.click(screen.getByRole('button', { name: /Criar cofre/ }));

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
    expect(mock.vaultCreate).toHaveBeenCalledWith('uva-preta-42-estrela');
  });

  it('Enter no campo de confirmação também cria o cofre', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Senha mestra'), 'uva-preta-42-estrela');
    await user.type(screen.getByLabelText('Confirmar a senha'), 'uva-preta-42-estrela{Enter}');

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
    expect(mock.vaultCreate).toHaveBeenCalledWith('uva-preta-42-estrela');
  });

  it('Enter sem a confirmação não chega ao cofre e não acusa divergência', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Senha mestra'), 'uva-preta-42-estrela{Enter}');

    // Atalho de teclado não fura a dupla confirmação, e também não inventa erro.
    expect(mock.vaultCreate).not.toHaveBeenCalled();
    expect(onUnlocked).not.toHaveBeenCalled();
    expect(screen.queryByText(m.vault.mismatch)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: m.vault.createAction })).toBeDisabled();
  });

  it('recusa do cofre que não tem espera mostra o erro e libera o botão', async () => {
    const { mock, onUnlocked, onClose } = setup();
    const recusa: VaultResult = { ok: false, code: 'vaultExists', retryInMs: 0 };
    mock.vaultCreate.mockResolvedValueOnce(recusa);
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Senha mestra'), 'uva-preta-42-estrela');
    await user.type(screen.getByLabelText('Confirmar a senha'), 'uva-preta-42-estrela');
    await user.click(screen.getByRole('button', { name: m.vault.createAction }));

    expect(await screen.findByText(m.vault.errors.vaultExists)).toBeInTheDocument();
    // Recusa sem espera não trava a tentativa: já existir cofre não é motivo
    // para segurar a pessoa numa contagem regressiva.
    expect(screen.queryByText(/Aguarde/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: m.vault.createAction })).toBeEnabled();
    expect(onUnlocked).not.toHaveBeenCalled();
  });
});

describe('VaultModal: desbloqueio', () => {
  it('mostra o erro do backend e a espera quando a senha está errada', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Senha mestra'), 'errada');
    await user.click(screen.getByRole('button', { name: /Desbloquear/ }));

    expect(await screen.findByText('Senha mestra incorreta.')).toBeInTheDocument();
    expect(await screen.findByText(/Aguarde 10 segundos/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Desbloquear/ })).toBeDisabled();
    expect(onUnlocked).not.toHaveBeenCalled();
    expect(mock.vaultUnlock).toHaveBeenCalledWith('errada');
  });

  it('a espera da trava desce um segundo por vez e some no fim', async () => {
    const { onClose, onUnlocked } = setup();
    vi.useFakeTimers();
    try {
      render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);
      fireEvent.change(passwordField(), { target: { value: 'errada' } });
      // O relógio é falso: o envio é assíncrono e o `waitFor` (que espera por
      // temporizador) não roda aqui, então um flush de microtarefa entrega a
      // resposta do main.
      await act(() => {
        fireEvent.click(screen.getByRole('button', { name: m.vault.unlockAction }));
        return Promise.resolve();
      });
      expect(screen.getByText(m.vault.lockout(10))).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText(m.vault.lockout(9))).toBeInTheDocument();
      // Contando é informação: a pessoa precisa ver o tempo diminuindo, e o
      // campo fica travado para não perder a senha que ela digitou.
      expect(passwordField()).toBeDisabled();

      act(() => {
        vi.advanceTimersByTime(8000);
      });
      expect(screen.getByText(m.vault.lockout(1))).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      // No fim da espera a trava some e a tentativa volta a ficar disponível.
      expect(screen.queryByText(/Aguarde/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: m.vault.unlockAction })).toBeEnabled();
      expect(passwordField()).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a espera acima de um minuto vira minutos, não segundos', async () => {
    const { mock, onClose, onUnlocked } = setup();
    mock.vaultUnlock.mockResolvedValueOnce({
      ok: false,
      code: 'vaultLockedOut',
      retryInMs: 300_000,
    });
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(passwordField(), 'errada');
    await user.click(screen.getByRole('button', { name: m.vault.unlockAction }));

    // Cinco minutos de espera em contagem de segundos seria mentira de quem lê.
    expect(await screen.findByText(m.vault.lockout(300))).toBeInTheDocument();
    expect(m.vault.lockout(300)).toContain('5 minuto');
  });

  it('desbloqueia com a senha certa e avisa o fluxo pendente', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Senha mestra'), 'certa-longo-123');
    await user.click(screen.getByRole('button', { name: /Desbloquear/ }));

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
    expect(mock.vaultUnlock).toHaveBeenCalledWith('certa-longo-123');
  });

  it('Enter no campo de senha também tenta desbloquear', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(passwordField(), 'certa-longo-123{Enter}');

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
    expect(mock.vaultUnlock).toHaveBeenCalledWith('certa-longo-123');
  });
});

describe('VaultModal: sair do cofre', () => {
  it('o clique fora do cartão fecha quando o cofre é dispensável', () => {
    const { onClose, onUnlocked } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const card = screen
      .getByRole('heading', { name: m.vault.unlockTitle })
      .closest<HTMLElement>('.modal');
    if (card === null) throw new Error('Cartão do modal não encontrado.');
    const overlay = card.closest<HTMLElement>('.overlay');
    if (overlay === null) throw new Error('Overlay do modal não encontrado.');

    fireEvent.mouseDown(card);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cofre barreira da tela inteira não tem por onde sair', () => {
    const { onClose, onUnlocked } = setup();
    // `closable = false`: sem cofre aberto não há acervo, então fechar deixaria
    // a tela vazia sem explicação.
    render(<VaultModal mode="unlock" closable={false} onClose={onClose} onUnlocked={onUnlocked} />);

    expect(screen.queryByRole('button', { name: m.common.close })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: m.common.cancel })).not.toBeInTheDocument();
    // Só a barra de ação fica: quem precisa da senha não tem como escapar dela.
    expect(screen.getAllByRole('button')).toHaveLength(1);

    const card = screen
      .getByRole('heading', { name: m.vault.unlockTitle })
      .closest<HTMLElement>('.modal');
    if (card === null) throw new Error('Cartão do modal não encontrado.');
    const overlay = card.closest<HTMLElement>('.overlay');
    if (overlay === null) throw new Error('Overlay do modal não encontrado.');
    fireEvent.mouseDown(overlay);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('enquanto o cofre grava, nem Cancelar nem o clique fora fecham', async () => {
    const { mock, onClose, onUnlocked } = setup();
    let release: (result: VaultResult) => void = () => undefined;
    mock.vaultCreate.mockReturnValueOnce(
      new Promise<VaultResult>((resolve) => {
        release = resolve;
      }),
    );
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(m.vault.passwordLabel), 'uva-preta-42-estrela');
    await user.type(screen.getByLabelText(m.vault.confirmLabel), 'uva-preta-42-estrela');
    await user.click(screen.getByRole('button', { name: m.vault.createAction }));

    const running = await screen.findByRole('button', { name: m.common.loading });
    expect(running).toBeDisabled();
    expect(screen.getByRole('button', { name: m.common.cancel })).toBeDisabled();
    expect(passwordField()).toBeDisabled();

    const card = screen
      .getByRole('heading', { name: m.vault.createTitle })
      .closest<HTMLElement>('.modal');
    if (card === null) throw new Error('Cartão do modal não encontrado.');
    const overlay = card.closest<HTMLElement>('.overlay');
    if (overlay === null) throw new Error('Overlay do modal não encontrado.');
    fireEvent.mouseDown(overlay);

    // Fechar no meio da escrita do cofre deixaria a pessoa sem saber se gravou.
    expect(onClose).not.toHaveBeenCalled();

    release({ ok: true, status: { exists: true, unlocked: true, attempts: 0, lockUntil: 0 } });
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
  });
});
