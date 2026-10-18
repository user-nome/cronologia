import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import CredentialModal from '@zero/renderer/components/CredentialModal';
import { messages } from '@zero/messages';
import { MASTER_PASSWORD_LENGTH } from '@zero/shared';
import type { VaultResult, VaultStatus } from '@zero/types';
import { createApiMock, installApiMock } from '../../../helpers/api.ts';
import type { ApiMock } from '../../../helpers/api.ts';

/**
 * A troca de credencial é o único caminho em que o app reescreve o embrulho da
 * chave. O teste olha o que a pessoa sente: o que é barrado antes de gastar o
 * Argon2id, o que o app conta ao main, e o fato de o cofre continuar aberto
 * (porque trocar senha não fecha nada, já que a chave-mestra não muda).
 */

const m = messages('pt-BR');

const MASTER = 'Tz7#mQ2!vZ9@pL4$xR8!nW3&';
const NOVA = 'Qv3%bN8@wF5&kD1^jH6!zL0*';
const PIN = '49201733';
const NOVO_PIN = '73851042';

const ABERTO: VaultStatus = {
  exists: true,
  unlocked: true,
  attempts: 0,
  lockUntil: 0,
  lockRemainingMs: 0,
  hasRecovery: true,
};

interface SetupResult {
  mock: ApiMock;
  onClose: Mock<() => void>;
  onChanged: Mock<() => void>;
}

function setup(): SetupResult {
  const mock = createApiMock();
  installApiMock(mock);
  const onClose = vi.fn<() => void>();
  const onChanged = vi.fn<() => void>();
  return { mock, onClose, onChanged };
}

/** Campos de uma troca, já filtrados pelo rótulo (mestre e PIN têm nomes distintos). */
function campos(kind: 'master' | 'pin'): {
  atual: HTMLElement;
  novo: HTMLElement;
  confirmacao: HTMLElement;
} {
  const rotulos =
    kind === 'master'
      ? [m.auth.changeMasterCurrent, m.auth.changeMasterNew, m.auth.changeMasterConfirm]
      : [m.auth.changePinCurrent, m.auth.changePinNew, m.auth.changePinConfirm];
  const [atual, novo, confirmacao] = rotulos.map((rotulo) => screen.getByLabelText(rotulo));
  if (atual === undefined || novo === undefined || confirmacao === undefined) {
    throw new Error('Campos da troca não encontrados.');
  }
  return { atual, novo, confirmacao };
}

describe('CredentialModal: trocar a senha mestra', () => {
  it('recusa o novo valor fora dos 24 caracteres antes de chamar o main', async () => {
    const { mock, onClose, onChanged } = setup();
    render(<CredentialModal kind="master" onClose={onClose} onChanged={onChanged} />);

    const user = userEvent.setup();
    const { atual, novo, confirmacao } = campos('master');
    await user.type(atual, MASTER);
    await user.type(novo, 'curta');
    await user.type(confirmacao, 'curta');
    await user.click(screen.getByRole('button', { name: m.auth.changeAction }));

    expect(
      await screen.findByText(m.auth.masterLength(MASTER_PASSWORD_LENGTH, 5)),
    ).toBeInTheDocument();
    expect(mock.vaultChangeMaster).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('recusa senha mestra degenerada e confirmação divergente', async () => {
    const { mock, onClose, onChanged } = setup();
    render(<CredentialModal kind="master" onClose={onClose} onChanged={onChanged} />);

    const user = userEvent.setup();
    const { atual, novo, confirmacao } = campos('master');
    await user.type(atual, MASTER);
    await user.type(novo, 'z'.repeat(MASTER_PASSWORD_LENGTH));
    await user.type(confirmacao, 'z'.repeat(MASTER_PASSWORD_LENGTH));
    await user.click(screen.getByRole('button', { name: m.auth.changeAction }));
    expect(await screen.findByText(m.vault.errors.vaultWeakMaster)).toBeInTheDocument();

    await user.clear(novo);
    await user.clear(confirmacao);
    await user.type(novo, NOVA);
    await user.type(confirmacao, `${NOVA}x`);
    await user.click(screen.getByRole('button', { name: m.auth.changeAction }));
    expect(await screen.findByText(m.auth.masterMismatch)).toBeInTheDocument();
    expect(mock.vaultChangeMaster).not.toHaveBeenCalled();
  });

  it('troca com a senha atual e a nova, e o cofre continua aberto', async () => {
    const { mock, onClose, onChanged } = setup();
    mock.vaultChangeMaster.mockResolvedValueOnce({ ok: true, status: ABERTO });
    render(<CredentialModal kind="master" onClose={onClose} onChanged={onChanged} />);

    const user = userEvent.setup();
    const { atual, novo, confirmacao } = campos('master');
    await user.type(atual, MASTER);
    await user.type(novo, NOVA);
    await user.type(confirmacao, NOVA);
    await user.click(screen.getByRole('button', { name: m.auth.changeAction }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mock.vaultChangeMaster).toHaveBeenCalledWith({
      currentPassword: MASTER,
      newPassword: NOVA,
    });
  });

  it('senha atual errada mostra o erro do main e não fecha', async () => {
    const { mock, onClose, onChanged } = setup();
    mock.vaultChangeMaster.mockResolvedValueOnce({
      ok: false,
      code: 'vaultWrongMaster',
      retryInMs: 0,
    });
    render(<CredentialModal kind="master" onClose={onClose} onChanged={onChanged} />);

    const user = userEvent.setup();
    const { atual, novo, confirmacao } = campos('master');
    await user.type(atual, MASTER);
    await user.type(novo, NOVA);
    await user.type(confirmacao, NOVA);
    await user.click(screen.getByRole('button', { name: m.auth.changeAction }));

    expect(await screen.findByText(m.vault.errors.vaultWrongMaster)).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('Enter em qualquer campo confirma a troca', async () => {
    const { mock, onClose, onChanged } = setup();
    mock.vaultChangePin.mockResolvedValueOnce({ ok: true, status: ABERTO });
    render(<CredentialModal kind="pin" onClose={onClose} onChanged={onChanged} />);

    const user = userEvent.setup();
    const { atual, novo, confirmacao } = campos('pin');
    await user.type(atual, `${PIN}{Enter}`);
    // Campo vazio de credencial: nada é enviado.
    expect(mock.vaultChangePin).not.toHaveBeenCalled();

    await user.type(novo, NOVO_PIN);
    await user.type(confirmacao, `${NOVO_PIN}{Enter}`);

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mock.vaultChangePin).toHaveBeenCalledWith({ currentPin: PIN, newPin: NOVO_PIN });
  });

  it('campo vazio não chama o main, e o clique fora fecha', async () => {
    const { mock, onClose, onChanged } = setup();
    render(<CredentialModal kind="master" onClose={onClose} onChanged={onChanged} />);

    const user = userEvent.setup();
    const enviar = screen.getByRole('button', { name: m.auth.changeAction });
    expect(enviar).toBeDisabled();

    await user.type(campos('master').novo, NOVA);
    await user.type(campos('master').confirmacao, NOVA);
    expect(enviar).toBeDisabled();

    const card = screen
      .getByRole('heading', { name: m.auth.changeMasterTitle })
      .closest<HTMLElement>('.modal');
    if (card === null) throw new Error('Cartão do modal não encontrado.');
    const overlay = card.closest<HTMLElement>('.overlay');
    if (overlay === null) throw new Error('Overlay do modal não encontrado.');
    overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(mock.vaultChangeMaster).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('o botão X e Cancelar fecham sem trocar nada', async () => {
    const { mock, onClose, onChanged } = setup();
    render(<CredentialModal kind="master" onClose={onClose} onChanged={onChanged} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: m.common.cancel }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: m.common.close }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(mock.vaultChangeMaster).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('CredentialModal: trocar o PIN', () => {
  it('recusa PIN malformado, degenerado e confirmação divergente', async () => {
    const { mock, onClose, onChanged } = setup();
    render(<CredentialModal kind="pin" onClose={onClose} onChanged={onChanged} />);

    const user = userEvent.setup();
    const { atual, novo, confirmacao } = campos('pin');
    await user.type(atual, PIN);
    await user.type(novo, '123');
    await user.type(confirmacao, '123');
    await user.click(screen.getByRole('button', { name: m.auth.changeAction }));
    expect(await screen.findByText(m.vault.errors.vaultInvalidPin)).toBeInTheDocument();

    await user.clear(novo);
    await user.clear(confirmacao);
    await user.type(novo, '11111111');
    await user.type(confirmacao, '11111111');
    await user.click(screen.getByRole('button', { name: m.auth.changeAction }));
    expect(await screen.findByText(m.vault.errors.vaultWeakPin)).toBeInTheDocument();

    await user.clear(novo);
    await user.clear(confirmacao);
    await user.type(novo, NOVO_PIN);
    await user.type(confirmacao, '00000000');
    await user.click(screen.getByRole('button', { name: m.auth.changeAction }));
    expect(await screen.findByText(m.auth.pinMismatch)).toBeInTheDocument();
    expect(mock.vaultChangePin).not.toHaveBeenCalled();
  });

  it('troca pelo canal do PIN, e não pelo da senha mestra', async () => {
    const { mock, onClose, onChanged } = setup();
    mock.vaultChangePin.mockResolvedValueOnce({ ok: true, status: ABERTO });
    render(<CredentialModal kind="pin" onClose={onClose} onChanged={onChanged} />);

    const user = userEvent.setup();
    const { atual, novo, confirmacao } = campos('pin');
    await user.type(atual, PIN);
    await user.type(novo, NOVO_PIN);
    await user.type(confirmacao, NOVO_PIN);
    await user.click(screen.getByRole('button', { name: m.auth.changeAction }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mock.vaultChangePin).toHaveBeenCalledWith({ currentPin: PIN, newPin: NOVO_PIN });
    expect(mock.vaultChangeMaster).not.toHaveBeenCalled();
  });

  it('PIN atual errado mostra o erro do main', async () => {
    const { mock, onClose, onChanged } = setup();
    mock.vaultChangePin.mockResolvedValueOnce({
      ok: false,
      code: 'vaultWrongPin',
      retryInMs: 0,
    });
    render(<CredentialModal kind="pin" onClose={onClose} onChanged={onChanged} />);

    const user = userEvent.setup();
    const { atual, novo, confirmacao } = campos('pin');
    await user.type(atual, PIN);
    await user.type(novo, NOVO_PIN);
    await user.type(confirmacao, NOVO_PIN);
    await user.click(screen.getByRole('button', { name: m.auth.changeAction }));

    expect(await screen.findByText(m.vault.errors.vaultWrongPin)).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('o medidor do PIN só aparece com algo digitado, e acompanha a nota', async () => {
    const { onClose, onChanged } = setup();
    render(<CredentialModal kind="pin" onClose={onClose} onChanged={onChanged} />);

    const user = userEvent.setup();
    const { novo } = campos('pin');
    // Campo vazio não tem nota a mostrar: um medidor zerado é ruído.
    expect(screen.queryByText(m.strength.hintPin)).not.toBeInTheDocument();

    await user.type(novo, '11111111');
    expect(await screen.findByText(m.strength.levels.veryWeak)).toBeInTheDocument();
    expect(screen.getByText(m.strength.hintPin)).toBeInTheDocument();
    // O motivo da nota aparece ao lado da dica, sem trocar a dica.
    expect(screen.getByText(m.strength.reasons.allSame)).toBeInTheDocument();
  });

  it('o aviso é o da credencial que está sendo trocada', async () => {
    const { onClose, onChanged } = setup();
    const { rerender } = render(
      <CredentialModal kind="master" onClose={onClose} onChanged={onChanged} />,
    );
    const user = userEvent.setup();
    await user.type(campos('master').novo, NOVA);
    expect(await screen.findByText(m.strength.hintMaster)).toBeInTheDocument();

    rerender(<CredentialModal kind="pin" onClose={onClose} onChanged={onChanged} />);
    await user.type(campos('pin').novo, NOVO_PIN);
    expect(await screen.findByText(m.strength.hintPin)).toBeInTheDocument();
  });
});

describe('CredentialModal: enquanto o Argon2id roda', () => {
  it('o botão vira spinner e nenhum campo aceita digitação', async () => {
    const { mock, onClose, onChanged } = setup();
    let release: (result: VaultResult) => void = () => undefined;
    mock.vaultChangePin.mockReturnValueOnce(
      new Promise<VaultResult>((resolve) => {
        release = resolve;
      }),
    );
    render(<CredentialModal kind="pin" onClose={onClose} onChanged={onChanged} />);

    const user = userEvent.setup();
    const { atual, novo, confirmacao } = campos('pin');
    await user.type(atual, PIN);
    await user.type(novo, NOVO_PIN);
    await user.type(confirmacao, NOVO_PIN);
    await user.click(screen.getByRole('button', { name: m.auth.changeAction }));

    const rodando = await screen.findByRole('button', { name: m.common.loading });
    expect(rodando).toBeDisabled();
    expect(screen.getByRole('button', { name: m.common.cancel })).toBeDisabled();
    expect(novo).toBeDisabled();

    release({ ok: true, status: ABERTO });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });
});
