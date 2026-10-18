import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import DangerZone from '@zero/renderer/components/DangerZone';
import { MessagesProvider } from '@zero/renderer/i18n';
import { messages } from '@zero/messages';
import type { LibraryReset } from '@zero/types';
import { createApiMock, installApiMock } from '../../../helpers/api.ts';
import type { ApiMock } from '../../../helpers/api.ts';

/**
 * A zona de risco é a única parte da interface que **apaga dados**, e ela chama
 * o main direto (é o dono do fluxo destrutivo). O teste observa a API
 * mockada, não um callback injetado.
 *
 * O que precisa estar provado é a confirmação em duas etapas: destrutivo sem a
 * segunda etapa é um clique de engano longe demais de ser irreversível. E, no
 * caminho da falha, o que a interface **conta**: um "apagou" em falso é pior do
 * que um erro genérico.
 */

const m = messages('pt-BR');

type Notify = (message: string, kind?: 'info' | 'error') => void;

interface ZoneResult {
  mock: ApiMock;
  notify: Mock<Notify>;
  onLibraryChanged: Mock<() => void>;
  onVaultDestroyed: Mock<() => void>;
  onCloudChanged: Mock<() => void>;
}

function renderZone(connected = true): ZoneResult {
  const mock = createApiMock();
  installApiMock(mock);
  const notify = vi.fn<Notify>();
  const onLibraryChanged = vi.fn<() => void>();
  const onVaultDestroyed = vi.fn<() => void>();
  const onCloudChanged = vi.fn<() => void>();
  render(
    <MessagesProvider language="pt-BR">
      <DangerZone
        connected={connected}
        notify={notify}
        onLibraryChanged={onLibraryChanged}
        onVaultDestroyed={onVaultDestroyed}
        onCloudChanged={onCloudChanged}
      />
    </MessagesProvider>,
  );
  return { mock, notify, onLibraryChanged, onVaultDestroyed, onCloudChanged };
}

/**
 * Abre a confirmação da ação, digita a palavra e confirma. É o caminho
 * completo que a pessoa percorre, então um teste que pula a abertura não
 * estaria provando nada.
 */
async function confirm(action: RegExp, word: string): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: action }));
  await user.type(screen.getByLabelText(new RegExp(`Digite ${word}`)), word);
  await user.click(screen.getByRole('button', { name: /Confirmar/i }));
}

describe('DangerZone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exige a palavra digitada antes de apagar a biblioteca', async () => {
    const { mock } = renderZone();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Apagar biblioteca/i }));
    // Só abrir a confirmação não apaga nada.
    expect(mock.libraryReset).not.toHaveBeenCalled();

    const confirmButton = screen.getByRole('button', { name: /Confirmar/i });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Digite APAGAR/), 'APAGAR');
    expect(confirmButton).toBeEnabled();
  });

  it('apaga a biblioteca só depois da confirmação', async () => {
    const { mock } = renderZone();
    await confirm(/Apagar biblioteca/i, 'APAGAR');
    expect(mock.libraryReset).toHaveBeenCalledTimes(1);
  });

  it('tolera espaço em volta da palavra (copiar e colar não pode falhar)', async () => {
    const { mock } = renderZone();
    await confirm(/Apagar biblioteca/i, 'APAGAR ');
    expect(mock.libraryReset).toHaveBeenCalledTimes(1);
  });

  it('aceita a palavra em minúsculas e o Enter como confirmação', async () => {
    const { mock } = renderZone();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Apagar biblioteca/i }));
    // Maiúsculas não são requisito: quem digita rápido erra a caixa sem querer.
    await user.type(screen.getByLabelText(/Digite APAGAR/), 'apagar{Enter}');

    await waitFor(() => expect(mock.libraryReset).toHaveBeenCalledTimes(1));
  });

  it('Enter com a palavra errada não apaga nada', async () => {
    const { mock } = renderZone();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Apagar biblioteca/i }));
    await user.type(screen.getByLabelText(/Digite APAGAR/), 'APAGAD{Enter}');

    // O teclado não é um atalho que furte a confirmação em duas etapas.
    expect(mock.libraryReset).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Confirmar/i })).toBeDisabled();
  });

  it('destrói o cofre com a palavra própria dele', async () => {
    const { mock } = renderZone();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Destruir cofre/i }));
    // APAGAR não vale para destruir o cofre: são operações distintas.
    const field = screen.getByLabelText(/Digite DESTRUIR/);
    await user.type(field, 'APAGAR');
    expect(screen.getByRole('button', { name: /Confirmar/i })).toBeDisabled();

    await user.clear(field);
    await user.type(field, 'DESTRUIR');
    await user.click(screen.getByRole('button', { name: /Confirmar/i }));

    expect(mock.vaultDestroy).toHaveBeenCalledTimes(1);
    expect(mock.libraryReset).not.toHaveBeenCalled();
  });

  it('cancelar não apaga nada e volta ao estado inicial', async () => {
    const { mock } = renderZone();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Apagar biblioteca/i }));
    await user.type(screen.getByLabelText(/Digite APAGAR/), 'APAGAR');
    await user.click(screen.getByRole('button', { name: /Cancelar/i }));

    expect(mock.libraryReset).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Apagar biblioteca/i })).toBeInTheDocument();
  });

  it('o purge da nuvem fica desabilitado sem conta conectada', () => {
    renderZone(false);
    expect(screen.getByRole('button', { name: /Apagar backup/i })).toBeDisabled();
  });

  it('o purge da nuvem fica disponível com conta conectada', () => {
    renderZone(true);
    expect(screen.getByRole('button', { name: /Apagar backup/i })).toBeEnabled();
  });

  it('o purge da nuvem avisa que não há volta', async () => {
    const { mock } = renderZone();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Apagar backup/i }));
    expect(screen.getByText(/não pode ser recuperado/i)).toBeInTheDocument();
    expect(mock.drivePurge).not.toHaveBeenCalled();
  });

  it('o purge da nuvem usa a palavra APAGAR, não DESTRUIR', async () => {
    const { mock } = renderZone();
    await confirm(/Apagar backup/i, 'APAGAR');
    expect(mock.drivePurge).toHaveBeenCalledTimes(1);
  });

  it('o botão de confirmar trava e mostra o progresso enquanto a operação roda', async () => {
    const { mock } = renderZone();
    let release: (result: LibraryReset) => void = () => undefined;
    mock.libraryReset.mockReturnValueOnce(
      new Promise<LibraryReset>((resolve) => {
        release = resolve;
      }),
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Apagar biblioteca/i }));
    await user.type(screen.getByLabelText(/Digite APAGAR/), 'APAGAR');
    await user.click(screen.getByRole('button', { name: /Confirmar/i }));

    // Enquanto sobrescreve e apaga em disco, nada de segunda tentativa nem de
    // Cancelar: o painel inteiro fica ocupado até o main responder.
    const running = await screen.findByRole('button', { name: m.common.loading });
    expect(running).toBeDisabled();
    expect(screen.getByLabelText(/Digite APAGAR/)).toBeDisabled();
    expect(screen.getByRole('button', { name: m.common.cancel })).toBeDisabled();

    release({ ok: true, shredded: 2, failed: 0 });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Apagar biblioteca/i })).toBeInTheDocument(),
    );
  });
});

describe('DangerZone: o que a interface conta quando a operação falha', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a recusa do cofre vira o erro do domínio e não mexe na grade', async () => {
    const { mock, notify, onLibraryChanged } = renderZone();
    // `code` presente = o cofre recusou antes de tocar no acervo.
    mock.libraryReset.mockResolvedValueOnce({
      ok: false,
      shredded: 0,
      failed: 0,
      code: 'vaultLocked',
    });

    await confirm(/Apagar biblioteca/i, 'APAGAR');

    await waitFor(() => expect(notify).toHaveBeenCalledWith(m.vault.errors.vaultLocked, 'error'));
    // Nada foi apagado, então a grade não recarrega (e o acervo continua na tela).
    expect(onLibraryChanged).not.toHaveBeenCalled();
    // O aviso é o do domínio do cofre (diz o que fazer: abrir o cofre), e é o
    // único: nada de "biblioteca apagada" junto com a falha.
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify).toHaveBeenLastCalledWith(m.vault.errors.vaultLocked, 'error');
  });

  it('a falha parcial do apagamento conta o que sobrou no disco', async () => {
    const { mock, notify, onLibraryChanged } = renderZone();
    // Sem `code`: parte foi sobrescrita e apagada, parte não pôde.
    mock.libraryReset.mockResolvedValueOnce({ ok: false, shredded: 4, failed: 1 });

    await confirm(/Apagar biblioteca/i, 'APAGAR');

    await waitFor(() => expect(notify).toHaveBeenCalledWith(m.danger.resetPartial(4, 1), 'error'));
    // A grade recarrega: o que foi apagado sumiu de verdade da lista.
    expect(onLibraryChanged).toHaveBeenCalledTimes(1);
  });

  it('a destruição recusada pelo cofre não joga a pessoa para a tela inicial', async () => {
    const { mock, notify, onVaultDestroyed } = renderZone();
    mock.vaultDestroy.mockResolvedValueOnce({
      ok: false,
      code: 'vaultDestroyed',
      retryInMs: 0,
    });

    await confirm(/Destruir cofre/i, 'DESTRUIR');

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(m.vault.errors.vaultDestroyed, 'error'),
    );
    expect(onVaultDestroyed).not.toHaveBeenCalled();
  });

  it('purge sem erro do backend avisa a falha genérica e relê o status', async () => {
    const { mock, notify, onCloudChanged } = renderZone();
    mock.drivePurge.mockResolvedValueOnce({ ok: false, deleted: 0, failed: 0 });

    await confirm(/Apagar backup/i, 'APAGAR');

    await waitFor(() => expect(notify).toHaveBeenCalledWith(m.settings.toastPurgeFailed, 'error'));
    // A conta pode ter ficado com arquivo pendente: o status é relido.
    expect(onCloudChanged).toHaveBeenCalledTimes(1);
  });

  it('purge mostra o texto de erro que veio do backend', async () => {
    const { mock, notify } = renderZone();
    mock.drivePurge.mockResolvedValueOnce({
      ok: false,
      deleted: 1,
      failed: 2,
      error: 'Falha na API do Dropbox',
    });

    await confirm(/Apagar backup/i, 'APAGAR');

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Falha na API do Dropbox', 'error'));
  });
});
