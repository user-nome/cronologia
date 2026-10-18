import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import DonateModal from '@zero/renderer/components/DonateModal';
import { DONATION_LABEL, DONATION_URL } from '@zero/renderer/donations';
import { messages } from '@zero/messages';

const m = messages('pt-BR');

/**
 * A página de doações não decide nada, mas tem duas decisões que importam: o
 * que ela promete depois de copiar o link e o que fecha o diálogo. O clipboard
 * é opcional por definição (contexto inseguro, jsdom), então o botão precisa
 * sobreviver à ausência dele.
 */

function setup(): { onClose: Mock<() => void> } {
  const onClose = vi.fn<() => void>();
  render(<DonateModal onClose={onClose} />);
  return { onClose };
}

const originalClipboard = navigator.clipboard;

/** `writeText` ausente é o ambiente sem clipboard, que precisa continuar de pé. */
function setClipboard(writeText?: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: originalClipboard,
    configurable: true,
  });
});

/**
 * Deixa a escrita no clipboard resolver dentro do `act`. Com o relógio falso o
 * `waitFor` (que espera por temporizador) não roda, então o flush de
 * microtarefa é o que entrega a confirmação.
 */
async function flushCopy(): Promise<void> {
  await act(() => Promise.resolve());
}

describe('DonateModal: conteúdo', () => {
  it('mostra o texto e o link de doação com destino externo', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Doações' })).toBeInTheDocument();
    expect(screen.getByText(/comunidade otaku/)).toBeInTheDocument();
    expect(screen.getByText(DONATION_LABEL)).toBeInTheDocument();

    const donate = screen.getByRole('link', { name: /Doar agora/ });
    expect(donate).toHaveAttribute('href', DONATION_URL);
    expect(donate).toHaveAttribute('target', '_blank');
  });

  it('copia o link e mostra confirmação', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    setClipboard(writeText);
    setup();

    await user.click(screen.getByRole('button', { name: /Copiar link/ }));
    expect(writeText).toHaveBeenCalledWith(DONATION_URL);
    expect(await screen.findByText('Copiado!')).toBeInTheDocument();
  });

  it('a confirmação da cópia some sozinha depois de alguns segundos', async () => {
    setClipboard(vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined));
    vi.useFakeTimers();
    try {
      setup();
      fireEvent.click(screen.getByRole('button', { name: m.donate.copyLink }));

      // A escrita no clipboard é assíncrona: um flush de microtarefa entrega o
      // "Copiado!" e arma o temporizador que desfaz a marcação.
      await flushCopy();
      expect(screen.getByRole('button', { name: m.donate.copied })).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByRole('button', { name: m.donate.copied })).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      // Sem o temporizador o botão ficaria jurando que copiou para sempre.
      expect(screen.getByRole('button', { name: m.donate.copyLink })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sem clipboard o botão não quebra nem promete cópia', () => {
    setClipboard();
    setup();

    fireEvent.click(screen.getByRole('button', { name: m.donate.copyLink }));

    // A interface não pode quebrar (nem mentir) num contexto sem clipboard.
    expect(screen.getByRole('button', { name: m.donate.copyLink })).toBeInTheDocument();
    expect(screen.queryByText(m.donate.copied)).not.toBeInTheDocument();
  });

  it('falha na escrita no clipboard não deixa o botão preso em Copiado', async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new Error('clipboard sem permissão'));
    setClipboard(writeText);
    setup();

    fireEvent.click(screen.getByRole('button', { name: m.donate.copyLink }));
    await flushCopy();

    expect(writeText).toHaveBeenCalledWith(DONATION_URL);
    // Recusou: o botão volta ao rótulo de copiar e a pessoa pode tentar de novo.
    expect(screen.getByRole('button', { name: m.donate.copyLink })).toBeInTheDocument();
    expect(screen.queryByText(m.donate.copied)).not.toBeInTheDocument();
  });

  it('fecha com Escape e botão Fechar', async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    // Outra tecla não fecha: a pessoa pode estar rolando a página do texto.
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    const dialog = screen.getByRole('dialog', { name: 'Doações' });
    await user.click(within(dialog).getByText('Fechar'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('o clique fora do diálogo fecha e o clique dentro dele não', () => {
    const { onClose } = setup();
    const dialog = screen.getByRole('dialog', { name: 'Doações' });
    const overlay = dialog.closest('.overlay');
    if (overlay === null) throw new Error('Overlay do modal não encontrado.');

    // Ler a página não pode fechar nada: só o fundo (fora do cartão) fecha.
    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
