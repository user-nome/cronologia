import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { PIN_LENGTH, isMasterPasswordFormat, isPinFormat, strengthFor } from '@zero/shared';
import { RECOVERY_MIN_WORDS, countWords } from '@zero/shared';
import { useMessages } from '@zero/renderer/i18n';
import StrengthMeter from '@zero/renderer/components/StrengthMeter';
import { VaultActions, VaultShell, VaultSubmit } from '@zero/renderer/components/VaultShell';
import { ErrorBanner, LockBanner, submitOnEnter } from '@zero/renderer/components/VaultBanners';

/**
 * Abertura do cofre e recuperação do PIN esquecido.
 *
 * O campo aceita **um** valor e o app decide o que ele é pelo comprimento: 24
 * caracteres só podem ser a senha mestra, e 8 dígitos só podem ser o PIN. Não
 * há aba para escolher porque a escolha seria trabalho da pessoa e informação
 * que o app já tem.
 *
 * A frase de recuperação **não** é forma de login: ela nunca abre o cofre, só
 * reembrulha a chave com um PIN novo. Por isso a tela mostra o PIN atual
 * funcionando até o fim, e não como algo a ser substituído antes.
 */

interface VaultUnlockStepsProps {
  closable: boolean;
  onClose: () => void;
  /** O cofre ficou aberto (abertura normal ou redefinição do PIN). */
  onUnlocked: () => void;
}

export function VaultUnlockSteps({
  closable,
  onClose,
  onUnlocked,
}: VaultUnlockStepsProps): JSX.Element {
  const m = useMessages();
  const [step, setStep] = useState<'unlock' | 'reset'>('unlock');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  /** A senha mestra só vira caminho depois de 3 PINs errados (ver efeito). */
  const [masterAvailable, setMasterAvailable] = useState(false);

  const [credential, setCredential] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');

  const locked = remaining > 0;
  const failCount = useRef(0);

  /**
   * A senha mestra vira caminho depois de 3 PINs errados. Antes disso ela nem é
   * oferecida: quem esqueceu o PIN e não conhece a senha mestra é caso raro, e
   * oferecer a aba desde o começo só convida a tentativas no escuro. A contagem
   * vive em `ref` porque é sinal para o usuário, não estado que a tela pinte.
   */
  useEffect(() => {
    if (step === 'reset' || masterAvailable || credential === '') return;
    if (credential.length >= PIN_LENGTH || isMasterPasswordFormat(credential)) {
      failCount.current += 1;
      if (failCount.current >= 3) setMasterAvailable(true);
    }
  }, [credential, masterAvailable, step]);

  useEffect(() => {
    if (!locked) return;
    const timer = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [locked]);

  const unlock = async (): Promise<void> => {
    setError(null);
    if (credential === '' || locked) return;
    const kind = isMasterPasswordFormat(credential) ? 'master' : 'pin';
    setBusy(true);
    try {
      const result = await window.api.vault.unlock({ credential, kind });
      if (!result.ok) {
        // O PIN errado sai do campo: quem errou não deve reenviar o mesmo valor
        // sem perceber, e a trava que vem logo abaixo já avisa da espera.
        setCredential('');
        setError(m.vault.errors[result.code]);
        if (result.retryInMs > 0) setRemaining(Math.ceil(result.retryInMs / 1000));
        return;
      }
      setCredential('');
      onUnlocked();
    } finally {
      setBusy(false);
    }
  };

  const reset = async (): Promise<void> => {
    setError(null);
    const words = countWords(credential);
    if (words < RECOVERY_MIN_WORDS) {
      setError(m.auth.recoveryTooShort(RECOVERY_MIN_WORDS, words));
      return;
    }
    if (!isPinFormat(newPin)) {
      setError(m.vault.errors.vaultInvalidPin);
      return;
    }
    if (strengthFor('pin').evaluate(newPin).blocked) {
      setError(m.vault.errors.vaultWeakPin);
      return;
    }
    if (newPin !== newPinConfirm) {
      setError(m.auth.pinMismatch);
      return;
    }
    setBusy(true);
    try {
      const result = await window.api.vault.resetPin({ phrase: credential, newPin });
      if (!result.ok) {
        setError(m.vault.errors[result.code]);
        if (result.retryInMs > 0) setRemaining(Math.ceil(result.retryInMs / 1000));
        return;
      }
      setCredential('');
      setNewPin('');
      setNewPinConfirm('');
      onUnlocked();
    } finally {
      setBusy(false);
    }
  };

  if (step === 'reset') {
    return (
      <VaultShell
        title={m.auth.resetTitle}
        subtitle={m.auth.resetSubtitle}
        closable={closable}
        busy={busy}
        onClose={onClose}
      >
        <div className="field">
          <label htmlFor="vault-reset-phrase">{m.auth.recoveryLabel}</label>
          <textarea
            id="vault-reset-phrase"
            value={credential}
            disabled={busy}
            onChange={(event) => {
              setCredential(event.target.value);
              setError(null);
            }}
            placeholder={m.auth.recoveryPlaceholder}
            rows={3}
          />
        </div>
        <span className="help">{m.auth.recoveryHint}</span>
        <div className="field">
          <label htmlFor="vault-new-pin">{m.auth.newPinLabel}</label>
          <input
            id="vault-new-pin"
            type="password"
            inputMode="numeric"
            value={newPin}
            disabled={busy || locked}
            onChange={(event) => {
              setNewPin(event.target.value);
              setError(null);
            }}
            placeholder={m.auth.pinPlaceholder}
            onKeyDown={(event) =>
              submitOnEnter(event, () => {
                void reset();
              })
            }
          />
        </div>
        {newPin !== '' ? (
          <StrengthMeter result={strengthFor('pin').evaluate(newPin)} hint={m.strength.hintPin} />
        ) : null}
        <div className="field">
          <label htmlFor="vault-new-pin-confirm">{m.auth.newPinConfirmLabel}</label>
          <input
            id="vault-new-pin-confirm"
            type="password"
            inputMode="numeric"
            value={newPinConfirm}
            disabled={busy || locked}
            onChange={(event) => {
              setNewPinConfirm(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) =>
              submitOnEnter(event, () => {
                void reset();
              })
            }
          />
        </div>
        <ErrorBanner error={error} />
        <LockBanner remainingSeconds={remaining} />
        <VaultActions onClose={closable ? onClose : null} busy={busy}>
          <button
            className="btn ghost"
            onClick={() => {
              setStep('unlock');
              setCredential('');
              setError(null);
            }}
            disabled={busy}
          >
            <i className="fa-solid fa-arrow-left" /> {m.auth.backToPin}
          </button>
          <VaultSubmit
            busy={busy}
            icon="fa-key"
            label={m.auth.resetAction}
            onClick={() => {
              void reset();
            }}
            disabled={locked}
          />
        </VaultActions>
      </VaultShell>
    );
  }

  return (
    <VaultShell
      title={m.auth.unlockTitle}
      subtitle={m.auth.unlockSubtitle}
      closable={closable}
      busy={busy}
      onClose={onClose}
    >
      {masterAvailable ? (
        <div className="banner warning">
          <i className="fa-solid fa-circle-info" /> {m.auth.masterAvailable}
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="vault-credential">
          {masterAvailable ? m.auth.tabMaster : m.auth.pinLabel}
        </label>
        <input
          id="vault-credential"
          type="password"
          inputMode={masterAvailable ? undefined : 'numeric'}
          value={credential}
          disabled={busy || locked}
          onChange={(event) => {
            setCredential(event.target.value);
            setError(null);
          }}
          placeholder={masterAvailable ? m.auth.masterPlaceholder : m.auth.pinPlaceholder}
          onKeyDown={(event) =>
            submitOnEnter(event, () => {
              void unlock();
            })
          }
        />
      </div>
      <ErrorBanner error={error} />
      <LockBanner remainingSeconds={remaining} />
      <button
        type="button"
        className="link"
        onClick={() => {
          setStep('reset');
          setCredential('');
          setError(null);
        }}
        disabled={busy}
      >
        {m.auth.forgotPin}
      </button>
      <VaultActions onClose={closable ? onClose : null} busy={busy}>
        <VaultSubmit
          busy={busy}
          icon={masterAvailable ? 'fa-key' : 'fa-unlock'}
          label={m.auth.unlockAction}
          onClick={() => {
            void unlock();
          }}
          disabled={locked || credential === ''}
        />
      </VaultActions>
    </VaultShell>
  );
}
