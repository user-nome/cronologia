import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import AttributionsModal from '@zero/renderer/components/AttributionsModal';
import { ATTRIBUTIONS } from '@zero/renderer/attributions';

function setup(): { onClose: Mock<() => void> } {
  const onClose = vi.fn();
  render(<AttributionsModal onClose={onClose} />);
  return { onClose };
}

describe('AttributionsModal: créditos', () => {
  it('lista as dependências com licença em loop duplicado', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Atribuições' })).toBeInTheDocument();
    for (const item of ATTRIBUTIONS) {
      expect(screen.getAllByText(item.name).length).toBeGreaterThanOrEqual(2);
    }
    expect(screen.getAllByText('React')[0]).toBeInTheDocument();
    expect(screen.getAllByText('MIT')[0]).toBeInTheDocument();
  });

  it('pausa e continua a rolagem pelo botão', async () => {
    const user = userEvent.setup();
    setup();
    const track = document.querySelector('.credits-track');
    if (track === null) throw new Error('Trilha de créditos ausente.');
    expect(track.classList.contains('paused')).toBe(false);

    await user.click(screen.getByRole('button', { name: /Pausar/ }));
    expect(track.classList.contains('paused')).toBe(true);

    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(track.classList.contains('paused')).toBe(false);
  });

  it('troca o ícone e o rótulo do botão conforme o estado de pausa', async () => {
    const user = userEvent.setup();
    setup();
    const botao = screen.getByRole('button', { name: /Pausar/ });
    const icone = (): Element | null => botao.querySelector('i');

    // Pausado: o comando mostrado é o de retomar, não o de pausar de novo.
    expect(icone()?.classList.contains('fa-pause')).toBe(true);
    expect(icone()?.classList.contains('fa-play')).toBe(false);

    await user.click(botao);
    const retomado = screen.getByRole('button', { name: /Continuar/ });
    expect(retomado.querySelector('i')?.classList.contains('fa-play')).toBe(true);
    expect(retomado.querySelector('i')?.classList.contains('fa-pause')).toBe(false);
  });

  it('a trilha pausada sai para a cópia acessível e volta ao normal', async () => {
    const user = userEvent.setup();
    setup();
    const trilha = (): Element | null => document.querySelector('.credits-track');

    expect(trilha()?.className).toBe('credits-track');

    await user.click(screen.getByRole('button', { name: /Pausar/ }));
    expect(trilha()?.className).toBe('credits-track paused');

    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(trilha()?.className).toBe('credits-track');
  });

  it('ignora teclas que não sejam Escape', () => {
    const { onClose } = setup();

    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'a' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('fecha com Escape, clique no overlay e botão Fechar', async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    // O overlay só fecha quando o clique nele mesmo (fora do conteúdo do modal):
    // clicar em um botão dentro do dialog não pode derrubar a rolagem de créditos.
    const overlay = document.querySelector<HTMLElement>('.overlay');
    if (overlay === null) throw new Error('Overlay ausente.');
    fireEvent.mouseDown(within(overlay).getByRole('dialog', { name: 'Atribuições' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledTimes(2);

    const dialog = screen.getByRole('dialog', { name: 'Atribuições' });
    await user.click(within(dialog).getByText('Fechar'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
