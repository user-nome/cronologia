import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import App from '@zero/renderer/App';
import type { Work } from '@zero/types';
import { createApiMock, installApiMock } from '../../helpers/api.ts';
import type { ApiMock } from '../../helpers/api.ts';
import { makeWork } from '../../helpers/fixtures.ts';

/** Acervo mínimo: um card por status, com a pílula do Drive visível no topo. */
const WORKS: Work[] = [
  makeWork({
    id: 'w-lendo',
    title: 'Solo Leveling',
    status: 'lendo',
    progress: 20,
    updatedAt: '2026-03-01T00:00:00.000Z',
  }),
];

function setup(): { mock: ApiMock } {
  const mock = createApiMock({ works: WORKS });
  installApiMock(mock);
  render(<App />);
  return { mock };
}

/** Abre as Configurações pela pílula do Dropbox e espera o modal carregar. */
async function openSettings(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByTitle('Configurações do backup no Dropbox'));
  await screen.findByText('Desconectado');
}

describe('App: pílula do Dropbox e configurações', () => {
  it('abre e fecha as configurações pela pílula do Dropbox', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText(/1 obra\(s\)/);

    await openSettings(user);
    // O botão de fechar do modal de tela cheia (title) e não o "Fechar" do
    // rodapé: são o mesmo rótulo no modal de Configurações.
    await user.click(screen.getByTitle('Fechar'));
    await waitFor(() => expect(screen.queryByText('Desconectado')).not.toBeInTheDocument());
  });
});

describe('App: páginas de apoio', () => {
  it('fecha a página de atribuições', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText(/1 obra\(s\)/);

    await user.click(screen.getByRole('button', { name: /Atribuições/ }));
    expect(screen.getByRole('dialog', { name: 'Atribuições' })).toBeInTheDocument();

    await user.click(screen.getByTitle('Fechar'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Atribuições' })).not.toBeInTheDocument(),
    );
  });

  it('fecha a página de doações', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText(/1 obra\(s\)/);

    await user.click(screen.getByRole('button', { name: /^Doar$/ }));
    expect(screen.getByRole('dialog', { name: 'Doações' })).toBeInTheDocument();

    await user.click(screen.getByTitle('Fechar'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Doações' })).not.toBeInTheDocument(),
    );
  });
});

describe('App: zona de risco dentro das configurações', () => {
  it('apagar a biblioteca recarrega o acervo na janela', async () => {
    const user = userEvent.setup();
    const { mock } = setup();
    await screen.findByText(/1 obra\(s\)/);
    await openSettings(user);

    await user.click(screen.getByRole('button', { name: /Apagar biblioteca/ }));
    await user.type(screen.getByLabelText(/Digite APAGAR/), 'APAGAR');
    await user.click(screen.getByRole('button', { name: /^Confirmar$/ }));

    expect(await screen.findByText('Biblioteca apagada.')).toBeInTheDocument();
    // Carga inicial + recarga pedida pela zona de risco: a grade tem de refletir
    // o disco, não só o estado local do modal.
    await waitFor(() => expect(mock.libraryGet).toHaveBeenCalledTimes(2));
  });

  it('destruir o cofre fecha as configurações e volta a pedir a senha mestra', async () => {
    const user = userEvent.setup();
    const { mock } = setup();
    await screen.findByText(/1 obra\(s\)/);
    await openSettings(user);

    await user.click(screen.getByRole('button', { name: /Destruir cofre/ }));
    await user.type(screen.getByLabelText(/Digite DESTRUIR/), 'DESTRUIR');
    await user.click(screen.getByRole('button', { name: /^Confirmar$/ }));

    await waitFor(() => expect(mock.vaultDestroy).toHaveBeenCalledTimes(1));
    // Sem cofre não há acervo para exibir: o modal some e a janela pede a senha.
    expect(await screen.findByText('Criar o cofre de segredos')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Configurações/ })).not.toBeInTheDocument();
  });
});

describe('App: auto-lock sem cofre', () => {
  it('pede a criação quando o cofre não existe mais', async () => {
    const mock = createApiMock({ works: WORKS });
    installApiMock(mock);
    render(<App />);
    expect(await screen.findByText('Solo Leveling')).toBeInTheDocument();

    // Destruído de outra janela (ou no meio da sessão): o app não pode oferecer
    // desbloqueio de um cofre que não está mais lá.
    mock.vaultStatus.mockReturnValue(
      Promise.resolve({ exists: false, unlocked: false, attempts: 0, lockUntil: 0 }),
    );
    mock.emitVaultLocked(true);

    expect(await screen.findByText('Criar o cofre de segredos')).toBeInTheDocument();
    expect(screen.queryByText('Solo Leveling')).not.toBeInTheDocument();
  });
});
