import { useState } from 'react';
import type { JSX } from 'react';
import {
  MASTER_PASSWORD_LENGTH,
  RECOVERY_MIN_WORDS,
  countWords,
  isMasterPasswordFormat,
  isPinFormat,
  normalizePhrase,
  strengthFor,
} from '@zero/shared';
import { richText, useMessages } from '@zero/renderer/i18n';
import StrengthMeter from '@zero/renderer/components/StrengthMeter';
import { VaultActions, VaultShell, VaultSubmit } from '@zero/renderer/components/VaultShell';
import { ErrorBanner, submitOnEnter } from '@zero/renderer/components/VaultBanners';

/**
 * Criação do cofre em duas etapas: credenciais (senha mestra + PIN) e frase de
 * recuperação.
 *
 * São dois passos, e não um formulário só, porque a frase é um texto longo de
 * escrever duas vezes: enfiar ela no mesmo bloco da senha mestra faz a pessoa
 * perder tudo o que já digitou quando erra o PIN logo abaixo.
 *
 * As três credenciais chegam juntas ao main porque uma chave sem PIN obriga a
 * digitar 24 caracteres todo dia, e uma frase sem valor é campo morto. O `main`
 * reconfere formato e força antes de gravar: esta tela é conveniência, e quem
 * decide o que entra no disco é o processo principal.
 */

interface VaultCreateStepsProps {
  closable: boolean;
  onClose: () => void;
  /** O cofre foi criado e já está aberto. */
  onCreated: () => void;
}

export function VaultCreateSteps({
  closable,
  onClose,
  onCreated,
}: VaultCreateStepsProps): JSX.Element {
  const m = useMessages();
  const [step, setStep] = useState<'credentials' | 'recovery'>('credentials');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [master, setMaster] = useState('');
  const [masterConfirm, setMasterConfirm] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [phrase, setPhrase] = useState('');
  const [phraseConfirm, setPhraseConfirm] = useState('');

  /** Confere senha mestra e PIN antes de liberar a etapa da frase. */
  const toRecovery = (): void => {
    setError(null);
    if (!isMasterPasswordFormat(master)) {
      setError(m.auth.masterLength(MASTER_PASSWORD_LENGTH, master.length));
      return;
    }
    if (strengthFor('master').evaluate(master).blocked) {
      setError(m.vault.errors.vaultWeakMaster);
      return;
    }
    if (master !== masterConfirm) {
      setError(m.auth.masterMismatch);
      return;
    }
    if (!isPinFormat(pin)) {
      setError(m.vault.errors.vaultInvalidPin);
      return;
    }
    if (strengthFor('pin').evaluate(pin).blocked) {
      setError(m.vault.errors.vaultWeakPin);
      return;
    }
    if (pin !== pinConfirm) {
      setError(m.auth.pinMismatch);
      return;
    }
    setStep('recovery');
  };

  const submit = async (): Promise<void> => {
    setError(null);
    const words = countWords(phrase);
    if (words < RECOVERY_MIN_WORDS) {
      setError(m.auth.recoveryTooShort(RECOVERY_MIN_WORDS, words));
      return;
    }
    if (strengthFor('phrase').evaluate(phrase).blocked) {
      setError(m.vault.errors.vaultWeakRecovery);
      return;
    }
    // A comparação é sobre a frase normalizada: a caixa de cada palavra vale
    // (é informação a mais), mas o espaço a mais e a quebra de linha não podem
    // impedir quem anotou no celular de colar a frase aqui.
    if (normalizePhrase(phrase) !== normalizePhrase(phraseConfirm)) {
      setError(m.auth.recoveryMismatch);
      return;
    }
    setBusy(true);
    try {
      const result = await window.api.vault.create({
        masterPassword: master,
        pin,
        recoveryPhrase: phrase,
      });
      if (!result.ok) {
        setError(m.vault.errors[result.code]);
        return;
      }
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  if (step === 'credentials') {
    return (
      <VaultShell
        title={m.auth.createTitle}
        subtitle={richText(m.auth.createSubtitle)}
        closable={closable}
        busy={busy}
        onClose={onClose}
      >
        <div className="field">
          <label htmlFor="vault-master">{m.auth.masterLabel}</label>
          <input
            id="vault-master"
            type="password"
            value={master}
            disabled={busy}
            onChange={(event) => {
              setMaster(event.target.value);
              setError(null);
            }}
            placeholder={m.auth.masterPlaceholder}
            onKeyDown={(event) => submitOnEnter(event, toRecovery)}
          />
        </div>
        {master !== '' ? (
          <StrengthMeter
            result={strengthFor('master').evaluate(master)}
            hint={m.strength.hintMaster}
          />
        ) : null}
        <div className="field">
          <label htmlFor="vault-master-confirm">{m.auth.masterConfirmLabel}</label>
          <input
            id="vault-master-confirm"
            type="password"
            value={masterConfirm}
            disabled={busy}
            onChange={(event) => {
              setMasterConfirm(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => submitOnEnter(event, toRecovery)}
          />
        </div>
        <div className="field">
          <label htmlFor="vault-pin">{m.auth.pinLabel}</label>
          <input
            id="vault-pin"
            type="password"
            inputMode="numeric"
            value={pin}
            disabled={busy}
            onChange={(event) => {
              setPin(event.target.value);
              setError(null);
            }}
            placeholder={m.auth.pinPlaceholder}
            onKeyDown={(event) => submitOnEnter(event, toRecovery)}
          />
        </div>
        {pin !== '' ? (
          <StrengthMeter result={strengthFor('pin').evaluate(pin)} hint={m.strength.hintPin} />
        ) : null}
        <div className="field">
          <label htmlFor="vault-pin-confirm">{m.auth.newPinConfirmLabel}</label>
          <input
            id="vault-pin-confirm"
            type="password"
            inputMode="numeric"
            value={pinConfirm}
            disabled={busy}
            onChange={(event) => {
              setPinConfirm(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => submitOnEnter(event, toRecovery)}
          />
          <span className="help">{m.auth.pinSubtitle}</span>
        </div>
        <ErrorBanner error={error} />
        <VaultActions onClose={closable ? onClose : null} busy={busy}>
          <button className="btn primary" onClick={toRecovery} disabled={busy}>
            <i className="fa-solid fa-arrow-right" /> {m.common.next}
          </button>
        </VaultActions>
      </VaultShell>
    );
  }

  return (
    <VaultShell
      title={m.auth.recoveryTitle}
      subtitle={richText(m.auth.recoverySubtitle)}
      closable={closable}
      busy={busy}
      onClose={onClose}
    >
      <div className="field">
        <label htmlFor="vault-phrase">{m.auth.recoveryLabel}</label>
        <textarea
          id="vault-phrase"
          value={phrase}
          disabled={busy}
          onChange={(event) => {
            setPhrase(event.target.value);
            setError(null);
          }}
          placeholder={m.auth.recoveryPlaceholder}
          rows={3}
        />
      </div>
      {phrase !== '' ? (
        <StrengthMeter
          result={strengthFor('phrase').evaluate(phrase)}
          hint={m.strength.hintPhrase}
        />
      ) : null}
      <div className="field">
        <label htmlFor="vault-phrase-confirm">{m.auth.recoveryConfirmLabel}</label>
        <textarea
          id="vault-phrase-confirm"
          value={phraseConfirm}
          disabled={busy}
          onChange={(event) => {
            setPhraseConfirm(event.target.value);
            setError(null);
          }}
          rows={3}
        />
      </div>
      <span className="help">{m.auth.recoveryHint}</span>
      <ErrorBanner error={error} />
      <VaultActions onClose={closable ? onClose : null} busy={busy}>
        <button
          className="btn ghost"
          onClick={() => {
            setStep('credentials');
            setError(null);
          }}
          disabled={busy}
        >
          <i className="fa-solid fa-arrow-left" /> {m.common.back}
        </button>
        <VaultSubmit
          busy={busy}
          icon="fa-vault"
          label={m.auth.createAction}
          onClick={() => {
            void submit();
          }}
        />
      </VaultActions>
    </VaultShell>
  );
}
