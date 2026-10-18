import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import SettingsModal from '@zero/renderer/components/SettingsModal';
import type { AppSettings, BackupSummary, DriveStatus } from '@zero/types';
import { createApiMock, installApiMock } from '../../../helpers/api.ts';
import type { ApiMock } from '../../../helpers/api.ts';

const CONNECTED: DriveStatus = {
  connected: true,
  syncing: false,
  lastSync: '2026-02-03T10:00:00.000Z',
  lastError: null,
  accountEmail: 'leitor@exemplo.com',
};

const SUMMARY: BackupSummary = {
  id: 'arquivo-1',
  name: 'library.json',
  modifiedTime: '2026-02-03T10:00:00.000Z',
  size: 2048,
  works: 7,
};

interface SetupResult {
  mock: ApiMock;
  notify: Mock<(message: string, kind?: 'info' | 'error') => void>;
}

function setup(options: Parameters<typeof createApiMock>[0] = {}): SetupResult {
  const mock = createApiMock(options);
  installApiMock(mock);
  const notify = vi.fn<(message: string, kind?: 'info' | 'error') => void>();
  render(
    <SettingsModal
      onClose={vi.fn()}
      notify={notify}
      onLanguageChange={vi.fn<(language: AppSettings['language']) => void>()}
      onLibraryChanged={vi.fn()}
      onVaultDestroyed={vi.fn()}
    />,
  );
  return { mock, notify };
}

/** Promessa pendente com liberação manual, para segurar uma ação em andamento. */
function pending<T>(): { promise: Promise<T>; release: (value: T) => void } {
  let release: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('SettingsModal: rótulo da ação em andamento', () => {
  it('troca "Salvar" por "Salvando…" enquanto grava', async () => {
    const { mock } = setup();
    await screen.findByText('Desconectado');
    const saving = pending<AppSettings>();
    mock.settingsSet.mockReturnValueOnce(saving.promise);

    await userEvent.setup().click(screen.getByRole('button', { name: /^Salvar$/ }));
    // Todo o rodapé trava enquanto há ação em voo: nada de segunda gravação.
    expect(await screen.findByRole('button', { name: /Salvando/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Conectar ao Dropbox/ })).toBeDisabled();

    saving.release({
      driveClientId: '',
      drivePassphrase: '',
      backupProvider: 'dropbox',

      language: 'pt-BR',
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Salvar$/ })).toBeEnabled());
  });

  it('troca "Fazer backup agora" por "Enviando…" durante o envio', async () => {
    const { mock } = setup({ status: CONNECTED, backupInfo: SUMMARY });
    await screen.findByText('Conectado');
    const sending = pending<{ ok: boolean; error?: string }>();
    mock.driveBackup.mockReturnValueOnce(sending.promise);

    await userEvent.setup().click(screen.getByRole('button', { name: /Fazer backup agora/ }));
    expect(await screen.findByRole('button', { name: /Enviando/ })).toBeDisabled();

    sending.release({ ok: true });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Fazer backup agora/ })).toBeEnabled(),
    );
  });

  it('troca "Restaurar" por "Restaurando…" durante a restauração', async () => {
    const { mock } = setup({ status: CONNECTED, backupInfo: SUMMARY });
    await screen.findByText('Conectado');
    const restoring = pending<{ ok: boolean; error?: string; works?: number }>();
    mock.driveRestore.mockReturnValueOnce(restoring.promise);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Restaurar$/ }));
    const dialog = await screen.findByText('Senha do backup');
    const modal = dialog.closest<HTMLElement>('.modal');
    if (modal === null) throw new Error('Modal de senha do backup ausente.');
    await user.type(within(modal).getByPlaceholderText('Senha usada no backup'), 'frase');
    await user.click(within(modal).getByRole('button', { name: /^Restaurar$/ }));

    expect(await screen.findByRole('button', { name: /Restaurando/ })).toBeDisabled();

    restoring.release({ ok: true, works: 3 });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Restaurar$/ })).toBeEnabled());
  });
});

describe('SettingsModal: erro sem detalhe do Dropbox', () => {
  it('usa o texto padrão quando a autorização falha sem mensagem', async () => {
    const { mock, notify } = setup();
    mock.driveAuth.mockResolvedValueOnce({ ok: false });
    await screen.findByText('Desconectado');

    await userEvent.setup().click(screen.getByRole('button', { name: /Conectar ao Dropbox/ }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Falha na autorização.', 'error'));
  });

  it('usa o texto padrão quando o backup falha sem mensagem', async () => {
    const { mock, notify } = setup({ status: CONNECTED });
    mock.driveBackup.mockResolvedValueOnce({ ok: false });
    await screen.findByText('Conectado');

    await userEvent.setup().click(screen.getByRole('button', { name: /Fazer backup agora/ }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Falha no backup.', 'error'));
  });

  it('usa o texto padrão quando a restauração falha sem mensagem', async () => {
    const { mock, notify } = setup({ status: CONNECTED });
    mock.driveRestore.mockResolvedValueOnce({ ok: false });
    await screen.findByText('Conectado');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Restaurar$/ }));
    const dialog = await screen.findByText('Senha do backup');
    const modal = dialog.closest<HTMLElement>('.modal');
    if (modal === null) throw new Error('Modal de senha do backup ausente.');
    await user.type(within(modal).getByPlaceholderText('Senha usada no backup'), 'frase');
    await user.click(within(modal).getByRole('button', { name: /^Restaurar$/ }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Falha ao restaurar.', 'error'));
  });

  it('conta zero obras quando a restauração não devolve o total', async () => {
    const { mock, notify } = setup({ status: CONNECTED });
    mock.driveRestore.mockResolvedValueOnce({ ok: true });
    await screen.findByText('Conectado');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Restaurar$/ }));
    const dialog = await screen.findByText('Senha do backup');
    const modal = dialog.closest<HTMLElement>('.modal');
    if (modal === null) throw new Error('Modal de senha do backup ausente.');
    await user.type(within(modal).getByPlaceholderText('Senha usada no backup'), 'frase');
    await user.click(within(modal).getByRole('button', { name: /^Restaurar$/ }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Backup restaurado com 0 obra(s).'));
  });
});

describe('SettingsModal: falha vira toast de erro', () => {
  it('tira o prefixo do embrulho de IPC da mensagem', async () => {
    const { mock, notify } = setup();
    // O Electron embrulha a rejeição do main; o usuário tem de ver a causa, não
    // o nome do canal.
    mock.driveAuth.mockRejectedValueOnce(
      new Error("Error invoking remote method 'drive:auth': Error: Recusado pela rede."),
    );
    await screen.findByText('Desconectado');

    await userEvent.setup().click(screen.getByRole('button', { name: /Conectar ao Dropbox/ }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Recusado pela rede.', 'error'));
  });

  it('mostra a mensagem crua quando a rejeição não é um Error', async () => {
    const { mock, notify } = setup();
    mock.driveAuth.mockRejectedValueOnce('token revogado');
    await screen.findByText('Desconectado');

    await userEvent.setup().click(screen.getByRole('button', { name: /Conectar ao Dropbox/ }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('token revogado', 'error'));
  });

  it('mostra a mensagem do Error quando ela não parece embrulho de IPC', async () => {
    const { mock, notify } = setup();
    mock.driveAuth.mockRejectedValueOnce(new Error('chave da API ausente'));
    await screen.findByText('Desconectado');

    await userEvent.setup().click(screen.getByRole('button', { name: /Conectar ao Dropbox/ }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('chave da API ausente', 'error'));
  });

  it('libera o rodapé depois da falha para o usuário tentar de novo', async () => {
    const { mock } = setup({ status: CONNECTED });
    mock.driveBackup.mockRejectedValueOnce(new Error('sem rede'));
    await screen.findByText('Conectado');

    await userEvent.setup().click(screen.getByRole('button', { name: /Fazer backup agora/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Fazer backup agora/ })).toBeEnabled(),
    );
  });
});

describe('SettingsModal: pedido da senha do backup', () => {
  it('cancelar o pedido de senha não restaura nada', async () => {
    const { mock, notify } = setup({ status: CONNECTED, backupInfo: SUMMARY });
    await screen.findByText('Conectado');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Restaurar$/ }));
    expect(await screen.findByText('Senha do backup')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Cancelar$/ }));

    // Restaurar substitui o acervo inteiro: desistir não pode virar gravação.
    await waitFor(() => expect(screen.queryByText('Senha do backup')).not.toBeInTheDocument());
    expect(mock.driveRestore).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('SettingsModal: purge da nuvem pela zona de risco', () => {
  it('apagar o backup na nuvem relê o status e o resumo', async () => {
    const { mock, notify } = setup({ status: CONNECTED, backupInfo: SUMMARY });
    await screen.findByText('7 obra(s)');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Apagar backup/ }));
    await user.type(screen.getByLabelText(/Digite APAGAR/), 'APAGAR');
    await user.click(screen.getByRole('button', { name: /^Confirmar$/ }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Backup apagado da nuvem.'));
    expect(mock.drivePurge).toHaveBeenCalledTimes(1);
    // O purge não vem do status corrente: a janela tem de reler a conta e o
    // resumo, senão o modal continua mostrando o backup apagado.
    await waitFor(() => expect(mock.driveStatus).toHaveBeenCalledTimes(2));
    expect(mock.driveBackupInfo).toHaveBeenCalledTimes(2);
  });
});
