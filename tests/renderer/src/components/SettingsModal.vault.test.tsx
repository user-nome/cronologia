import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import SettingsModal from '@zero/renderer/components/SettingsModal';
import type { AppSettings } from '@zero/types';
import { createApiMock, installApiMock } from '../../../helpers/api.ts';
import type { ApiMock } from '../../../helpers/api.ts';

const SEM_COFRE = { exists: false, unlocked: false, attempts: 0, lockUntil: 0 };
const FECHADO = { exists: true, unlocked: false, attempts: 0, lockUntil: 0 };
const ABERTO = { exists: true, unlocked: true, attempts: 0, lockUntil: 0 };

const SENHA = 'senha-qualquer-123';

interface SetupResult {
  mock: ApiMock;
  onClose: ReturnType<typeof vi.fn>;
}

function setup(vault: typeof SEM_COFRE): SetupResult {
  const mock = createApiMock({ vault });
  installApiMock(mock);
  const onClose = vi.fn();
  render(
    <SettingsModal
      onClose={onClose}
      notify={vi.fn()}
      onLanguageChange={vi.fn<(language: AppSettings['language']) => void>()}
      onLibraryChanged={vi.fn()}
      onVaultDestroyed={vi.fn()}
    />,
  );
  return { mock, onClose };
}

/** Isola o `VaultModal`: a badge do cofre usa o mesmo rótulo do botão do modal. */
function vaultModal(titulo: RegExp): HTMLElement {
  const modal = screen.getByRole('heading', { name: titulo }).closest<HTMLElement>('.modal');
  if (modal === null) throw new Error('Modal do cofre ausente.');
  return modal;
}

/** Digita a senha mestra e confirma no modal do cofre. */
async function unlockVault(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const modal = vaultModal(/Desbloquear o cofre/);
  await user.type(within(modal).getByLabelText('Senha mestra'), SENHA);
  await user.click(within(modal).getByRole('button', { name: /^Desbloquear$/ }));
}

describe('SettingsModal: tecla de fechamento', () => {
  it('fecha com a tecla Escape', async () => {
    const { onClose } = setup(ABERTO);
    await screen.findByText('Cofre aberto');

    // Outra tecla não fecha: só o Escape é o atalho de saída do modal.
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsModal: botões da badge do cofre', () => {
  it('oferece a criação quando não há cofre', async () => {
    setup(SEM_COFRE);
    expect(await screen.findByText('Sem cofre')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: /Criar cofre/ }));
    expect(await screen.findByText('Criar o cofre de segredos')).toBeInTheDocument();
  });

  it('oferece o desbloqueio quando o cofre está fechado', async () => {
    setup(FECHADO);
    expect(await screen.findByText('Cofre fechado')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: /^Desbloquear$/ }));
    expect(await screen.findByText('Desbloquear o cofre')).toBeInTheDocument();
  });

  it('fecha o cofre aberto e a badge acompanha', async () => {
    const { mock } = setup(ABERTO);
    expect(await screen.findByText('Cofre aberto')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: /Fechar cofre/ }));
    // Fechar o cofre aqui esconde os segredos na hora, sem derrubar a janela.
    await waitFor(() => expect(mock.vaultLock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Cofre fechado')).toBeInTheDocument();
  });
});

describe('SettingsModal: ação adiada até o cofre abrir', () => {
  it('roda a ação que ficou pendente depois do desbloqueio', async () => {
    const { mock } = setup(FECHADO);
    await screen.findByText('Cofre fechado');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Salvar$/ }));
    expect(await screen.findByText('Desbloquear o cofre')).toBeInTheDocument();
    // Nada gravou antes da senha mestra: sem cofre não há segredo em disco.
    expect(mock.settingsSet).not.toHaveBeenCalled();

    await unlockVault(user);

    await waitFor(() => expect(mock.settingsSet).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Desbloquear o cofre')).not.toBeInTheDocument());
    expect(await screen.findByText('Cofre aberto')).toBeInTheDocument();
  });

  it('descarta a ação pendente quando o usuário fecha o modal do cofre', async () => {
    const { mock } = setup(FECHADO);
    await screen.findByText('Cofre fechado');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Salvar$/ }));
    expect(await screen.findByText('Desbloquear o cofre')).toBeInTheDocument();
    await user.click(
      within(vaultModal(/Desbloquear o cofre/)).getByRole('button', { name: /^Cancelar$/ }),
    );
    await waitFor(() => expect(screen.queryByText('Desbloquear o cofre')).not.toBeInTheDocument());

    // Reabre o prompt pela badge, que não rearma nenhuma ação, e desbloqueia: a
    // intenção antiga foi descartada junto com o modal, então nada é gravado por
    // baixo dos panos depois de o cofre abrir.
    await user.click(screen.getByRole('button', { name: /^Desbloquear$/ }));
    expect(await screen.findByText('Desbloquear o cofre')).toBeInTheDocument();
    await unlockVault(user);
    await waitFor(() => expect(screen.queryByText('Desbloquear o cofre')).not.toBeInTheDocument());
    expect(mock.settingsSet).not.toHaveBeenCalled();
  });
});
