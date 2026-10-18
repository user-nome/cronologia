import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import VaultModal from '@zero/renderer/components/VaultModal';
import { messages } from '@zero/messages';
import { MASTER_PASSWORD_LENGTH } from '@zero/shared';
import type { VaultResult, VaultStatus } from '@zero/types';
import { createApiMock, installApiMock } from '../../../helpers/api.ts';
import type { ApiMock } from '../../../helpers/api.ts';

/**
 * O cofre é a barreira do app: sem ele não há acervo para mostrar. O teste olha
 * quatro decisões que a pessoa sente na tela, e não a chamada crua do main: em
 * que passo dá para seguir, o que a trava mostra enquanto espera, quando a
 * senha mestra vira caminho alternativo e quando a frase recupera o PIN.
 */

const m = messages('pt-BR');

/** Credenciais válidas: os formatos do app são conferidos de verdade. */
const MASTER = 'Tz7#mQ2!vZ9@pL4$xR8!nW3&';
const PIN = '49201733';
const PHRASE =
  'cavalo cenoura feira inverno bibliografia zettelkasten kalamita peixoto velleda aurora jubileu silhueta';
/** Outra frase igualmente válida, para exercitar a divergência de confirmação. */
const OUTRA_FRASE =
  'martelo ribeira outono violeta estrondo bengala ciclone telhado giz pontaria alvorada';

const ABERTO: VaultStatus = {
  exists: true,
  unlocked: true,
  attempts: 0,
  lockUntil: 0,
  lockRemainingMs: 0,
  hasRecovery: true,
};

/** PIN que o dublê recusa (8 dígitos, formato válido, valor errado). */
const WRONG_PIN = '00000000';

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

/** Preenche a primeira etapa de criação e avança para a da frase. */
async function fillCredentials(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText(m.auth.masterLabel), MASTER);
  await user.type(screen.getByLabelText(m.auth.masterConfirmLabel), MASTER);
  await user.type(screen.getByLabelText(m.auth.pinLabel), PIN);
  await user.type(screen.getByLabelText(m.auth.newPinConfirmLabel), PIN);
}

async function toRecoveryStep(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await fillCredentials(user);
  await user.click(screen.getByRole('button', { name: m.common.next }));
}

function pinField(): HTMLElement {
  return screen.getByLabelText(m.auth.pinLabel);
}

/**
 * Preenche um campo de uma vez só. `user.type` é certo para credenciais curtas,
 * porque simula o que a pessoa digita; para a frase de recuperação (centenas de
 * caracteres) ele só mede o relógio, porque a régua de força roda a cada toque.
 */
function preencher(campo: HTMLElement, valor: string): void {
  fireEvent.change(campo, { target: { value: valor } });
}

describe('VaultModal: criação, etapa das credenciais', () => {
  it('recusa senha mestra fora dos 24 caracteres sem chamar o backend', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(m.auth.masterLabel), 'curta');
    await user.click(screen.getByRole('button', { name: m.common.next }));

    expect(
      await screen.findByText(m.auth.masterLength(MASTER_PASSWORD_LENGTH, 5)),
    ).toBeInTheDocument();
    expect(mock.vaultCreate).not.toHaveBeenCalled();
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it('recusa senha mestra previsível de 24 caracteres', async () => {
    const { mock, onClose, onUnlocked } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(m.auth.masterLabel), 'a'.repeat(24));
    await user.type(screen.getByLabelText(m.auth.masterConfirmLabel), 'a'.repeat(24));
    await user.click(screen.getByRole('button', { name: m.common.next }));

    expect(await screen.findByText(m.vault.errors.vaultWeakMaster)).toBeInTheDocument();
    expect(mock.vaultCreate).not.toHaveBeenCalled();
  });

  it('recusa confirmações divergentes de senha e de PIN', async () => {
    const { mock, onClose, onUnlocked } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(m.auth.masterLabel), MASTER);
    await user.type(screen.getByLabelText(m.auth.masterConfirmLabel), `${MASTER}x`);
    await user.click(screen.getByRole('button', { name: m.common.next }));
    expect(await screen.findByText(m.auth.masterMismatch)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(m.auth.masterConfirmLabel));
    await user.type(screen.getByLabelText(m.auth.masterConfirmLabel), MASTER);
    await user.type(screen.getByLabelText(m.auth.pinLabel), PIN);
    await user.type(screen.getByLabelText(m.auth.newPinConfirmLabel), '00000000');
    await user.click(screen.getByRole('button', { name: m.common.next }));

    expect(await screen.findByText(m.auth.pinMismatch)).toBeInTheDocument();
    expect(mock.vaultCreate).not.toHaveBeenCalled();
  });

  it('recusa PIN fora dos 8 dígitos e PIN degenerado', async () => {
    const { onClose, onUnlocked } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(m.auth.masterLabel), MASTER);
    await user.type(screen.getByLabelText(m.auth.masterConfirmLabel), MASTER);
    await user.type(screen.getByLabelText(m.auth.pinLabel), '123');
    await user.click(screen.getByRole('button', { name: m.common.next }));
    expect(await screen.findByText(m.vault.errors.vaultInvalidPin)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(m.auth.pinLabel));
    await user.type(screen.getByLabelText(m.auth.pinLabel), '11111111');
    await user.click(screen.getByRole('button', { name: m.common.next }));
    expect(await screen.findByText(m.vault.errors.vaultWeakPin)).toBeInTheDocument();
  });

  it('Enter na confirmação do PIN também avança, e a frase curta é barrada depois', async () => {
    const { onClose, onUnlocked } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(m.auth.masterLabel), MASTER);
    await user.type(screen.getByLabelText(m.auth.masterConfirmLabel), MASTER);
    await user.type(screen.getByLabelText(m.auth.pinLabel), PIN);
    await user.type(screen.getByLabelText(m.auth.newPinConfirmLabel), `${PIN}{Enter}`);

    // A etapa da frase abriu, e é ela que barra a frase curta: cada passo tem a
    // sua régua, e nenhuma deixa a seguinte passar sem ser conferida.
    expect(await screen.findByRole('heading', { name: m.auth.recoveryTitle })).toBeInTheDocument();
    preencher(screen.getByLabelText(m.auth.recoveryLabel), 'curta');
    await user.click(screen.getByRole('button', { name: m.auth.createAction }));
    expect(await screen.findByText(m.auth.recoveryTooShort(12, 1))).toBeInTheDocument();
  });

  it('mostra o medidor de força da senha mestra digitada', async () => {
    const { onClose, onUnlocked } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(m.auth.masterLabel), 'a'.repeat(24));
    expect(await screen.findByText(m.strength.levels.veryWeak)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(m.auth.masterLabel));
    await user.type(screen.getByLabelText(m.auth.masterLabel), MASTER);
    expect(await screen.findByText(m.strength.levels.veryStrong)).toBeInTheDocument();
  });

  it('avança para a etapa da frase com as duas credenciais válidas', async () => {
    const { mock, onClose, onUnlocked } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await toRecoveryStep(user);

    expect(await screen.findByRole('heading', { name: m.auth.recoveryTitle })).toBeInTheDocument();
    expect(screen.getByLabelText(m.auth.recoveryLabel)).toBeInTheDocument();
    // Ainda nada foi gravado: o cofre só existe depois da frase.
    expect(mock.vaultCreate).not.toHaveBeenCalled();
  });

  it('Enter na confirmação do PIN também avança', async () => {
    const { onClose, onUnlocked } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(m.auth.masterLabel), MASTER);
    await user.type(screen.getByLabelText(m.auth.masterConfirmLabel), MASTER);
    await user.type(screen.getByLabelText(m.auth.pinLabel), PIN);
    await user.type(screen.getByLabelText(m.auth.newPinConfirmLabel), `${PIN}{Enter}`);

    expect(await screen.findByRole('heading', { name: m.auth.recoveryTitle })).toBeInTheDocument();
  });

  it('Enter sem confirmação não avança e não chega ao cofre', async () => {
    const { mock, onClose, onUnlocked } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(m.auth.masterLabel), `${MASTER}{Enter}`);

    // Atalho de teclado não fura a dupla confirmação: o passo da frase não abre
    // e nada é gravado.
    expect(mock.vaultCreate).not.toHaveBeenCalled();
    expect(onUnlocked).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: m.auth.recoveryTitle })).not.toBeInTheDocument();
  });
});

describe('VaultModal: criação, etapa da frase de recuperação', () => {
  it('recusa frase com menos de 12 palavras', async () => {
    const { mock, onClose, onUnlocked } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);
    const user = userEvent.setup();
    await toRecoveryStep(user);

    await user.type(screen.getByLabelText(m.auth.recoveryLabel), 'poucas palavras');
    await user.click(screen.getByRole('button', { name: m.auth.createAction }));

    expect(await screen.findByText(m.auth.recoveryTooShort(12, 2))).toBeInTheDocument();
    expect(mock.vaultCreate).not.toHaveBeenCalled();
  });

  it('recusa frase previsível: 12+ palavras com quase tudo repetido', async () => {
    const { mock, onClose, onUnlocked } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);
    const user = userEvent.setup();
    await toRecoveryStep(user);

    // Texto longo entra por `change`, não tecla a tecla: a régua roda a cada
    // caractere e um `user.type` de 130 toques não mede nada além do relógio.
    preencher(screen.getByLabelText(m.auth.recoveryLabel), `${'cavalo '.repeat(11)}aurora`);
    preencher(screen.getByLabelText(m.auth.recoveryConfirmLabel), 'qualquer');
    await user.click(screen.getByRole('button', { name: m.auth.createAction }));

    expect(await screen.findByText(m.vault.errors.vaultWeakRecovery)).toBeInTheDocument();
    expect(mock.vaultCreate).not.toHaveBeenCalled();
  });

  it('recusa confirmação divergente, mesmo com duas frases igualmente válidas', async () => {
    const { mock, onClose, onUnlocked } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);
    const user = userEvent.setup();
    await toRecoveryStep(user);

    preencher(screen.getByLabelText(m.auth.recoveryLabel), PHRASE);
    preencher(screen.getByLabelText(m.auth.recoveryConfirmLabel), OUTRA_FRASE);
    await user.click(screen.getByRole('button', { name: m.auth.createAction }));

    // A régua de força passa nas duas; o que barra é a divergência.
    expect(await screen.findByText(m.auth.recoveryMismatch)).toBeInTheDocument();
    expect(mock.vaultCreate).not.toHaveBeenCalled();
  });

  it('cria o cofre com as três credenciais e avisa o fluxo pendente', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await toRecoveryStep(user);
    preencher(screen.getByLabelText(m.auth.recoveryLabel), PHRASE);
    preencher(screen.getByLabelText(m.auth.recoveryConfirmLabel), PHRASE);
    await user.click(screen.getByRole('button', { name: m.auth.createAction }));

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
    expect(mock.vaultCreate).toHaveBeenCalledWith({
      masterPassword: MASTER,
      pin: PIN,
      recoveryPhrase: PHRASE,
    });
  });

  it('a confirmação da frase ignora o espaço a mais e a quebra de linha', async () => {
    const { onUnlocked, onClose } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await toRecoveryStep(user);
    preencher(screen.getByLabelText(m.auth.recoveryLabel), PHRASE);
    preencher(screen.getByLabelText(m.auth.recoveryConfirmLabel), `  ${PHRASE}  `);
    await user.click(screen.getByRole('button', { name: m.auth.createAction }));

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
  });

  it('a caixa das palavras conta: confirmar em maiúsculas não é a mesma frase', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await toRecoveryStep(user);
    preencher(screen.getByLabelText(m.auth.recoveryLabel), PHRASE);
    preencher(screen.getByLabelText(m.auth.recoveryConfirmLabel), PHRASE.toUpperCase());
    await user.click(screen.getByRole('button', { name: m.auth.createAction }));

    // A caixa é um bit a mais para quem escreve e para quem ataca: normalizá-la
    // faria a pessoa repetir a frase sem ganhar nada.
    expect(await screen.findByText(m.auth.recoveryMismatch)).toBeInTheDocument();
    expect(mock.vaultCreate).not.toHaveBeenCalled();
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it('recusa do cofre mostra o erro e libera o botão', async () => {
    const { mock, onUnlocked, onClose } = setup();
    const recusa: VaultResult = { ok: false, code: 'vaultExists', retryInMs: 0 };
    mock.vaultCreate.mockResolvedValueOnce(recusa);
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await toRecoveryStep(user);
    preencher(screen.getByLabelText(m.auth.recoveryLabel), PHRASE);
    preencher(screen.getByLabelText(m.auth.recoveryConfirmLabel), PHRASE);
    await user.click(screen.getByRole('button', { name: m.auth.createAction }));

    expect(await screen.findByText(m.vault.errors.vaultExists)).toBeInTheDocument();
    // Recusa sem espera não trava a tentativa: já existir cofre não é motivo
    // para segurar a pessoa numa contagem regressiva.
    expect(screen.queryByText(/Tente novamente em/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: m.auth.createAction })).toBeEnabled();
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it('Voltar traz as credenciais digitadas sem perder o que já foi escrito', async () => {
    const { onClose, onUnlocked } = setup();
    render(<VaultModal mode="create" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await toRecoveryStep(user);
    await user.click(screen.getByRole('button', { name: m.common.back }));

    expect(await screen.findByLabelText(m.auth.masterLabel)).toHaveValue(MASTER);
    expect(screen.getByLabelText(m.auth.pinLabel)).toHaveValue(PIN);
  });
});

describe('VaultModal: desbloqueio', () => {
  it('abre pelo PIN e diz ao main que é PIN', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(pinField(), PIN);
    await user.click(screen.getByRole('button', { name: m.auth.unlockAction }));

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
    expect(mock.vaultUnlock).toHaveBeenCalledWith({ credential: PIN, kind: 'pin' });
  });

  it('o comprimento decide o método: 24 caracteres é a senha mestra', async () => {
    // Sem aba para escolher: quem tem a senha mestra digita e o app sabe o que é.
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(pinField(), MASTER);
    await user.click(screen.getByRole('button', { name: m.auth.unlockAction }));

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
    expect(mock.vaultUnlock).toHaveBeenCalledWith({ credential: MASTER, kind: 'master' });
  });

  it('mostra o erro do backend e a espera quando o PIN está errado', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(pinField(), WRONG_PIN);
    await user.click(screen.getByRole('button', { name: m.auth.unlockAction }));

    expect(await screen.findByText(m.vault.errors.vaultWrongPin)).toBeInTheDocument();
    expect(await screen.findByText(m.auth.lockout('10s'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: m.auth.unlockAction })).toBeDisabled();
    expect(onUnlocked).not.toHaveBeenCalled();
    expect(mock.vaultUnlock).toHaveBeenCalledWith({ credential: WRONG_PIN, kind: 'pin' });
  });

  it('a senha mestra só vira caminho depois de 3 PINs errados', async () => {
    const { mock, onClose, onUnlocked } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    expect(screen.queryByText(m.auth.masterAvailable)).not.toBeInTheDocument();

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await user.clear(pinField());
      await user.type(pinField(), PIN);
      await user.click(screen.getByRole('button', { name: m.auth.unlockAction }));
      // A trava segura a tentativa seguinte: o contador vive no main, e a tela
      // não pode inventar um terceiro erro que ninguém digitou.
      mock.vaultUnlock.mockClear();
      mock.vaultUnlock.mockResolvedValueOnce({
        ok: false,
        code: 'vaultWrongPin',
        retryInMs: 0,
      });
      expect(screen.queryByText(m.auth.masterAvailable)).not.toBeInTheDocument();
    }

    mock.vaultUnlock.mockClear();
    mock.vaultUnlock.mockResolvedValueOnce({ ok: false, code: 'vaultWrongPin', retryInMs: 0 });
    await user.clear(pinField());
    await user.type(pinField(), PIN);
    await user.click(screen.getByRole('button', { name: m.auth.unlockAction }));

    expect(await screen.findByText(m.auth.masterAvailable)).toBeInTheDocument();
  });

  it('a espera da trava desce um segundo por vez e some no fim', async () => {
    const { onClose, onUnlocked } = setup();
    vi.useFakeTimers();
    try {
      render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);
      fireEvent.change(pinField(), { target: { value: '00000000' } });
      // O relógio é falso: o envio é assíncrono e o `waitFor` (que espera por
      // temporizador) não roda aqui, então um flush de microtarefa entrega a
      // resposta do main.
      await act(() => {
        fireEvent.click(screen.getByRole('button', { name: m.auth.unlockAction }));
        return Promise.resolve();
      });
      expect(screen.getByText(m.auth.lockout('10s'))).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText(m.auth.lockout('9s'))).toBeInTheDocument();
      // Contando é informação: a pessoa precisa ver o tempo diminuindo, e o
      // campo fica travado para não perder o PIN que ela digitou.
      expect(pinField()).toBeDisabled();

      act(() => {
        vi.advanceTimersByTime(8000);
      });
      expect(screen.getByText(m.auth.lockout('1s'))).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      // No fim da espera a trava some e a tentativa volta a ficar possível. O
      // campo ficou vazio de propósito: o PIN errado não fica na tela.
      expect(screen.queryByText(/Tente novamente em/)).not.toBeInTheDocument();
      expect(pinField()).toBeEnabled();
      expect(pinField()).toHaveValue('');
      expect(screen.getByRole('button', { name: m.auth.unlockAction })).toBeDisabled();
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
    await user.type(pinField(), PIN);
    await user.click(screen.getByRole('button', { name: m.auth.unlockAction }));

    // Cinco minutos de espera em contagem de segundos seria mentira de quem lê.
    expect(await screen.findByText(m.auth.lockout('5min'))).toBeInTheDocument();
  });

  it('Enter no campo do PIN também tenta abrir', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.type(pinField(), `${PIN}{Enter}`);

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
    expect(mock.vaultUnlock).toHaveBeenCalledWith({ credential: PIN, kind: 'pin' });
  });

  it('campo vazio não chama o main', () => {
    const { mock, onClose, onUnlocked } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    expect(screen.getByRole('button', { name: m.auth.unlockAction })).toBeDisabled();
    expect(mock.vaultUnlock).not.toHaveBeenCalled();
  });
});

describe('VaultModal: recuperação do PIN esquecido', () => {
  it('a frase curta não chega ao main', async () => {
    const { mock, onClose, onUnlocked } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: m.auth.forgotPin }));
    await user.type(screen.getByLabelText(m.auth.recoveryLabel), 'poucas palavras');
    await user.type(screen.getByLabelText(m.auth.newPinLabel), '73851042');
    await user.type(screen.getByLabelText(m.auth.newPinConfirmLabel), '73851042');
    await user.click(screen.getByRole('button', { name: m.auth.resetAction }));

    expect(await screen.findByText(m.auth.recoveryTooShort(12, 2))).toBeInTheDocument();
    expect(mock.vaultResetPin).not.toHaveBeenCalled();
  });

  it('recusa PIN novo malformado e divergente', async () => {
    const { mock, onClose, onUnlocked } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: m.auth.forgotPin }));
    await user.type(screen.getByLabelText(m.auth.recoveryLabel), PHRASE);
    await user.type(screen.getByLabelText(m.auth.newPinLabel), '123');
    await user.click(screen.getByRole('button', { name: m.auth.resetAction }));
    expect(await screen.findByText(m.vault.errors.vaultInvalidPin)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(m.auth.newPinLabel));
    await user.type(screen.getByLabelText(m.auth.newPinLabel), '73851042');
    await user.type(screen.getByLabelText(m.auth.newPinConfirmLabel), '73851043');
    await user.click(screen.getByRole('button', { name: m.auth.resetAction }));
    expect(await screen.findByText(m.auth.pinMismatch)).toBeInTheDocument();

    // PIN novo degenerado tem 8 dígitos e é barrado pela régua, antes da
    // confirmação: a ordem importa, porque confirmar nada custaria ao usuário.
    await user.clear(screen.getByLabelText(m.auth.newPinLabel));
    await user.clear(screen.getByLabelText(m.auth.newPinConfirmLabel));
    await user.type(screen.getByLabelText(m.auth.newPinLabel), '11111111');
    await user.type(screen.getByLabelText(m.auth.newPinConfirmLabel), '11111111');
    await user.click(screen.getByRole('button', { name: m.auth.resetAction }));
    expect(await screen.findByText(m.vault.errors.vaultWeakPin)).toBeInTheDocument();
    expect(mock.vaultResetPin).not.toHaveBeenCalled();
  });

  it('redefine o PIN com a frase e abre o cofre', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: m.auth.forgotPin }));
    await user.type(screen.getByLabelText(m.auth.recoveryLabel), PHRASE);
    await user.type(screen.getByLabelText(m.auth.newPinLabel), '73851042');
    await user.type(screen.getByLabelText(m.auth.newPinConfirmLabel), '73851042');
    await user.click(screen.getByRole('button', { name: m.auth.resetAction }));

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
    expect(mock.vaultResetPin).toHaveBeenCalledWith({ phrase: PHRASE, newPin: '73851042' });
  });

  it('frase errada mostra o erro próprio e mantém a trava visível', async () => {
    const { mock, onClose, onUnlocked } = setup();
    mock.vaultResetPin.mockResolvedValueOnce({
      ok: false,
      code: 'vaultWrongRecovery',
      retryInMs: 30_000,
    });
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: m.auth.forgotPin }));
    await user.type(screen.getByLabelText(m.auth.recoveryLabel), PHRASE);
    await user.type(screen.getByLabelText(m.auth.newPinLabel), '73851042');
    await user.type(screen.getByLabelText(m.auth.newPinConfirmLabel), '73851042');
    await user.click(screen.getByRole('button', { name: m.auth.resetAction }));

    expect(await screen.findByText(m.vault.errors.vaultWrongRecovery)).toBeInTheDocument();
    expect(screen.getByText(m.auth.lockout('30s'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: m.auth.resetAction })).toBeDisabled();
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it('Enter no PIN novo também confirma, e a divergência ainda barra', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: m.auth.forgotPin }));
    await user.type(screen.getByLabelText(m.auth.recoveryLabel), PHRASE);
    await user.type(screen.getByLabelText(m.auth.newPinLabel), '73851042');
    await user.type(screen.getByLabelText(m.auth.newPinConfirmLabel), '73851043{Enter}');

    // O atalho de teclado não fura a dupla confirmação: o mesmo caminho do botão.
    expect(await screen.findByText(m.auth.pinMismatch)).toBeInTheDocument();
    expect(mock.vaultResetPin).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(m.auth.newPinConfirmLabel));
    await user.clear(screen.getByLabelText(m.auth.newPinLabel));
    await user.type(screen.getByLabelText(m.auth.newPinLabel), '11111111{Enter}');
    expect(await screen.findByText(m.vault.errors.vaultWeakPin)).toBeInTheDocument();
    expect(mock.vaultResetPin).not.toHaveBeenCalled();
  });

  it('Enter na confirmação do PIN novo também redefine', async () => {
    const { mock, onUnlocked, onClose } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: m.auth.forgotPin }));
    await user.type(screen.getByLabelText(m.auth.recoveryLabel), PHRASE);
    await user.type(screen.getByLabelText(m.auth.newPinLabel), '73851042');
    await user.type(screen.getByLabelText(m.auth.newPinConfirmLabel), '73851042{Enter}');

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
    expect(mock.vaultResetPin).toHaveBeenCalledWith({ phrase: PHRASE, newPin: '73851042' });
  });

  it('voltar do reset leva de volta à tela do PIN, sem o que foi digitado', async () => {
    const { onClose, onUnlocked } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: m.auth.forgotPin }));
    await user.type(screen.getByLabelText(m.auth.recoveryLabel), PHRASE);
    await user.click(screen.getByRole('button', { name: m.auth.backToPin }));

    expect(await screen.findByRole('heading', { name: m.auth.unlockTitle })).toBeInTheDocument();
    expect(pinField()).toHaveValue('');
  });
});

describe('VaultModal: sair do cofre', () => {
  it('o clique fora do cartão fecha quando o cofre é dispensável', () => {
    const { onClose, onUnlocked } = setup();
    render(<VaultModal mode="unlock" onClose={onClose} onUnlocked={onUnlocked} />);

    const card = screen
      .getByRole('heading', { name: m.auth.unlockTitle })
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
    // Só "esqueci o PIN" e a barra de ação ficam: quem precisa da credencial não
    // tem como escapar dela, mas ainda tem o caminho da recuperação.
    expect(screen.getByRole('button', { name: m.auth.forgotPin })).toBeInTheDocument();

    const card = screen
      .getByRole('heading', { name: m.auth.unlockTitle })
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
    await toRecoveryStep(user);
    preencher(screen.getByLabelText(m.auth.recoveryLabel), PHRASE);
    preencher(screen.getByLabelText(m.auth.recoveryConfirmLabel), PHRASE);
    await user.click(screen.getByRole('button', { name: m.auth.createAction }));

    const running = await screen.findByRole('button', { name: m.common.loading });
    expect(running).toBeDisabled();
    expect(screen.getByRole('button', { name: m.common.cancel })).toBeDisabled();
    expect(screen.getByLabelText(m.auth.recoveryLabel)).toBeDisabled();

    const card = screen
      .getByRole('heading', { name: m.auth.recoveryTitle })
      .closest<HTMLElement>('.modal');
    if (card === null) throw new Error('Cartão do modal não encontrado.');
    const overlay = card.closest<HTMLElement>('.overlay');
    if (overlay === null) throw new Error('Overlay do modal não encontrado.');
    fireEvent.mouseDown(overlay);

    // Fechar no meio da escrita do cofre deixaria a pessoa sem saber se gravou.
    expect(onClose).not.toHaveBeenCalled();

    release({ ok: true, status: ABERTO });
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
  });
});
