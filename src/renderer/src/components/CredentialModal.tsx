import { useState } from 'react';
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  MASTER_PASSWORD_LENGTH,
  isMasterPasswordFormat,
  isPinFormat,
  strengthFor,
} from '@zero/shared';
import { richText, useMessages } from '@zero/renderer/i18n';
import StrengthMeter from '@zero/renderer/components/StrengthMeter';

interface CredentialModalProps {
  /** Qual credencial está sendo trocada: define rótulos, formato e canal. */
  kind: 'master' | 'pin';
  onClose: () => void;
  /** Avisa a tela de que a troca deu certo (para recarregar o badge do cofre). */
  onChanged: () => void;
}

/**
 * Troca da senha mestra ou do PIN, com o cofre aberto.
 *
 * A credencial atual é exigida de novo porque cofre aberto é **estado do
 * processo**, não prova de posse: quem chega na mesa de alguém com o app aberto
 * não pode trocar a chave de quem está usando. E como a chave-mestra é
 * aleatória (não derivada da senha), a troca só reescreve um embrulho: o
 * acervo em disco não é recifrado, e por isso leva segundos, não minutos.
 */
export default function CredentialModal({
  kind,
  onClose,
  onChanged,
}: CredentialModalProps): JSX.Element {
  const m = useMessages();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isMaster = kind === 'master';

  const currentLabel = isMaster ? m.auth.changeMasterCurrent : m.auth.changePinCurrent;
  const nextLabel = isMaster ? m.auth.changeMasterNew : m.auth.changePinNew;
  const confirmLabel = isMaster ? m.auth.changeMasterConfirm : m.auth.changePinConfirm;
  const title = isMaster ? m.auth.changeMasterTitle : m.auth.changePinTitle;
  const subtitle = isMaster ? m.auth.changeMasterSubtitle : m.auth.changePinSubtitle;
  const hint = isMaster ? m.strength.hintMaster : m.strength.hintPin;

  /** Enter em qualquer campo da troca confirma: o formulário tem um caminho só. */
  function onEnter(event: ReactKeyboardEvent<HTMLInputElement>, submit: () => void): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submit();
  }

  /** Valida o formato e a força da credencial nova, antes de gastar um Argon2id. */
  const validate = (): string | null => {
    const formatOk = isMaster ? isMasterPasswordFormat(next) : isPinFormat(next);
    if (!formatOk) {
      return isMaster
        ? m.auth.masterLength(MASTER_PASSWORD_LENGTH, next.length)
        : m.vault.errors.vaultInvalidPin;
    }
    if (strengthFor(kind).evaluate(next).blocked) {
      return isMaster ? m.vault.errors.vaultWeakMaster : m.vault.errors.vaultWeakPin;
    }
    if (next !== confirm) return isMaster ? m.auth.masterMismatch : m.auth.pinMismatch;
    return null;
  };

  const submit = async (): Promise<void> => {
    setError(null);
    if (current === '' || next === '') return;
    const problem = validate();
    if (problem !== null) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const result = isMaster
        ? await window.api.vault.changeMaster({ currentPassword: current, newPassword: next })
        : await window.api.vault.changePin({ currentPin: current, newPin: next });
      if (!result.ok) {
        setError(m.vault.errors[result.code]);
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (next: string) => void,
    numeric: boolean,
  ): JSX.Element => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="password"
        inputMode={numeric ? 'numeric' : undefined}
        value={value}
        disabled={busy}
        placeholder={numeric ? m.auth.pinPlaceholder : m.auth.masterPlaceholder}
        onChange={(event) => {
          onChange(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          onEnter(event, () => {
            void submit();
          });
        }}
      />
    </div>
  );

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-header">
          <h2>
            <i className={`fa-solid ${isMaster ? 'fa-key' : 'fa-hashtag'}`} /> {title}
          </h2>
          <button className="modal-close" onClick={onClose} title={m.common.close}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="modal-body">
          <div className="banner info">{richText(subtitle)}</div>
          {field('credential-current', currentLabel, current, setCurrent, !isMaster)}
          {field('credential-new', nextLabel, next, setNext, !isMaster)}
          {next !== '' ? (
            <StrengthMeter result={strengthFor(kind).evaluate(next)} hint={hint} />
          ) : null}
          {field('credential-confirm', confirmLabel, confirm, setConfirm, !isMaster)}
          {error !== null ? (
            <div className="banner error">
              <i className="fa-solid fa-triangle-exclamation" /> {error}
            </div>
          ) : null}
        </div>
        <div className="modal-footer">
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            {m.common.cancel}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              void submit();
            }}
            disabled={busy || current === '' || next === ''}
          >
            {busy ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" /> {m.common.loading}
              </>
            ) : (
              <>
                <i className={`fa-solid ${isMaster ? 'fa-key' : 'fa-hashtag'}`} />{' '}
                {m.auth.changeAction}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
