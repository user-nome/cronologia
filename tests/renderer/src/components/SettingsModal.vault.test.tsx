import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import SettingsModal from '@zero/renderer/components/SettingsModal';
import type { AppSettings } from '@zero/types';
import { createApiMock, installApiMock } from '../../../helpers/api.ts';
import type { ApiMock } from '../../../helpers/api.ts';
import { messages } from '@zero/messages';

/** Bundle pt-BR: os títulos do cofre vivem em `m.auth`, e a suíte cita os dois. */
const m = messages('pt-BR');

const SEM_COFRE = {
  exists: false,
  unlocked: false,
  attempts: 0,
  lockUntil: 0,
  lockRemainingMs: 0,
  hasRecovery: true,
};
const FECHADO = {
  exists: true,
  unlocked: false,
  attempts: 0,
  lockUntil: 0,
  lockRemainingMs: 0,
  hasRecovery: true,
};
const ABERTO = {
  exists: true,
  unlocked: true,
  attempts: 0,
  lockUntil: 0,
  lockRemainingMs: 0,
  hasRecovery: true,
};

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
function vaultModal(titulo: string): HTMLElement {
  const modal = screen.getByRole('heading', { name: titulo }).closest<HTMLElement>('.modal');
  if (modal === null) throw new Error('Modal do cofre ausente.');
  return modal;
}

/** Digita a senha mestra e confirma no modal do cofre. */
async function unlockVault(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const modal = vaultModal(m.auth.unlockTitle);
  await user.type(within(modal).getByLabelText(m.auth.pinLabel), SENHA);
  await user.click(within(modal).getByRole('button', { name: m.auth.unlockAction }));
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

    await userEvent.setup().click(screen.getByRole('button', { name: m.auth.createAction }));
    expect(await screen.findByText(m.auth.createTitle)).toBeInTheDocument();
  });

  it('oferece o desbloqueio quando o cofre está fechado', async () => {
    setup(FECHADO);
    expect(await screen.findByText('Cofre fechado')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: m.auth.unlockAction }));
    expect(await screen.findByText(m.auth.unlockTitle)).toBeInTheDocument();
  });

  it('fecha o cofre aberto e a badge acompanha', async () => {
    const { mock } = setup(ABERTO);
    expect(await screen.findByText('Cofre aberto')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: /Fechar cofre/ }));
    // Fechar o cofre aqui esconde os segredos na hora, sem derrubar a janela.
    await waitFor(() => expect(mock.vaultLock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Cofre fechado')).toBeInTheDocument();
  });

  it('abre modal de troca de senha mestra quando clica no botão', async () => {
    setup(ABERTO);
    await screen.findByText('Cofre aberto');

    await userEvent.setup().click(screen.getByRole('button', { name: m.auth.changeMasterTitle }));
    // O modal abre com o mesmo título, mas usamos o role heading para distinguir
    expect(
      await screen.findByRole('heading', { name: m.auth.changeMasterTitle }),
    ).toBeInTheDocument();
  });

  it('abre modal de troca de PIN quando clica no botão', async () => {
    setup(ABERTO);
    await screen.findByText('Cofre aberto');

    await userEvent.setup().click(screen.getByRole('button', { name: m.auth.changePinTitle }));
    expect(await screen.findByRole('heading', { name: m.auth.changePinTitle })).toBeInTheDocument();
  });
});

describe('SettingsModal: a troca de credencial abre, valida e recarrega o badge', () => {
  /** Preenche os três campos do `CredentialModal` e confirma. */
  async function trocarCredencial(atual: string, nova: string): Promise<void> {
    const user = userEvent.setup();
    const modal = vaultModal(m.auth.changeMasterTitle);
    await user.type(within(modal).getByLabelText(m.auth.changeMasterCurrent), atual);
    await user.type(within(modal).getByLabelText(m.auth.changeMasterNew), nova);
    await user.type(within(modal).getByLabelText(m.auth.changeMasterConfirm), nova);
    await user.click(within(modal).getByRole('button', { name: m.auth.changeAction }));
  }

  const MASTER_VALIDA = 'Zq4#nW8c!Yv2@Tg7&Sh1$Fj5';

  it('fecha o modal e relê o estado do cofre depois de uma troca bem-sucedida', async () => {
    const { mock } = setup(ABERTO);
    await screen.findByText('Cofre aberto');
    const antes = mock.vaultStatus.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: m.auth.changeMasterTitle }));
    await trocarCredencial('Zq4#nW8c!Yv2@Tg7&Sh1$Fj5', 'Vb3&xR9#tK2@pM5*nD7$wC4z');

    expect(mock.vaultChangeMaster).toHaveBeenCalledWith({
      currentPassword: 'Zq4#nW8c!Yv2@Tg7&Sh1$Fj5',
      newPassword: 'Vb3&xR9#tK2@pM5*nD7$wC4z',
    });
    // A badge reflecte o cofre de novo: a troca só reescreve um embrulho, e o
    // app precisa reler o estado para não mostrar "cofre fechado" por engano.
    await waitFor(() => expect(mock.vaultStatus.mock.calls.length).toBeGreaterThan(antes));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: m.auth.changeMasterTitle }),
      ).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('Cofre aberto')).toBeInTheDocument();
  });

  it('a troca do PIN manda o canal de PIN, não o da senha mestra', async () => {
    const { mock } = setup(ABERTO);
    await screen.findByText('Cofre aberto');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: m.auth.changePinTitle }));
    const modal = vaultModal(m.auth.changePinTitle);
    // PIN com dígitos não sequenciais: o sequencial é bloqueado pela régua de
    // força, e o que este teste verifica é o canal, não a validação.
    await user.type(within(modal).getByLabelText(m.auth.changePinCurrent), '90716328');
    await user.type(within(modal).getByLabelText(m.auth.changePinNew), '28471935');
    await user.type(within(modal).getByLabelText(m.auth.changePinConfirm), '28471935');
    await user.click(within(modal).getByRole('button', { name: m.auth.changeAction }));

    expect(mock.vaultChangePin).toHaveBeenCalledWith({
      currentPin: '90716328',
      newPin: '28471935',
    });
    // Trocar PIN não é trocar senha mestra: mandar o canal errado deixaria a
    // credencial que o usuário está usando intacta sem avisar.
    expect(mock.vaultChangeMaster).not.toHaveBeenCalled();
  });

  it('erro do backend fica no modal, que não fecha', async () => {
    const { mock } = setup(ABERTO);
    await screen.findByText('Cofre aberto');
    mock.vaultChangeMaster.mockResolvedValueOnce({
      ok: false,
      code: 'vaultWrongMaster',
      retryInMs: 0,
    });

    await userEvent.click(screen.getByRole('button', { name: m.auth.changeMasterTitle }));
    await trocarCredencial('Zq4#nW8c!Yv2@Tg7&Sh1$Fj5', MASTER_VALIDA);

    expect(await screen.findByText(m.vault.errors.vaultWrongMaster)).toBeInTheDocument();
    // A troca falhou, então o modal continua aberto para o usuário corrigir.
    expect(screen.getByRole('heading', { name: m.auth.changeMasterTitle })).toBeInTheDocument();
  });

  it('confirmar sem preencher não chama o main', async () => {
    const { mock } = setup(ABERTO);
    await screen.findByText('Cofre aberto');

    await userEvent.click(screen.getByRole('button', { name: m.auth.changeMasterTitle }));
    const modal = vaultModal(m.auth.changeMasterTitle);
    // Com os campos vazios o botão está desligado: gastar um Argon2id para
    // recusa de validação seria o pior jeito de errar.
    expect(within(modal).getByRole('button', { name: m.auth.changeAction })).toBeDisabled();
    expect(mock.vaultChangeMaster).not.toHaveBeenCalled();
  });

  it('Cancelar fecha o modal sem tocar no cofre', async () => {
    const { mock } = setup(ABERTO);
    await screen.findByText('Cofre aberto');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: m.auth.changeMasterTitle }));
    await user.click(
      within(vaultModal(m.auth.changeMasterTitle)).getByRole('button', { name: /^Cancelar$/ }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: m.auth.changeMasterTitle }),
      ).not.toBeInTheDocument(),
    );
    expect(mock.vaultChangeMaster).not.toHaveBeenCalled();
    // O cofre segue aberto: cancelar uma troca não tranca nada.
    expect(await screen.findByText('Cofre aberto')).toBeInTheDocument();
  });
});

describe('SettingsModal: ação adiada até o cofre abrir', () => {
  it('roda a ação que ficou pendente depois do desbloqueio', async () => {
    const { mock } = setup(FECHADO);
    await screen.findByText('Cofre fechado');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Salvar$/ }));
    expect(await screen.findByText(m.auth.unlockTitle)).toBeInTheDocument();
    // Nada gravou antes da senha mestra: sem cofre não há segredo em disco.
    expect(mock.settingsSet).not.toHaveBeenCalled();

    await unlockVault(user);

    await waitFor(() => expect(mock.settingsSet).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(m.auth.unlockTitle)).not.toBeInTheDocument());
    expect(await screen.findByText('Cofre aberto')).toBeInTheDocument();
  });

  it('descarta a ação pendente quando o usuário fecha o modal do cofre', async () => {
    const { mock } = setup(FECHADO);
    await screen.findByText('Cofre fechado');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Salvar$/ }));
    expect(await screen.findByText(m.auth.unlockTitle)).toBeInTheDocument();
    await user.click(
      within(vaultModal(m.auth.unlockTitle)).getByRole('button', { name: /^Cancelar$/ }),
    );
    await waitFor(() => expect(screen.queryByText(m.auth.unlockTitle)).not.toBeInTheDocument());

    // Reabre o prompt pela badge, que não rearma nenhuma ação, e desbloqueia: a
    // intenção antiga foi descartada junto com o modal, então nada é gravado por
    // baixo dos panos depois de o cofre abrir.
    await user.click(screen.getByRole('button', { name: m.auth.unlockAction }));
    expect(await screen.findByText(m.auth.unlockTitle)).toBeInTheDocument();
    await unlockVault(user);
    await waitFor(() => expect(screen.queryByText(m.auth.unlockTitle)).not.toBeInTheDocument());
    expect(mock.settingsSet).not.toHaveBeenCalled();
  });
});
