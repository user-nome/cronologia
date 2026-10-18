import type { JSX, ReactNode } from 'react';
import { useMessages } from '@zero/renderer/i18n';

/**
 * Casca dos modais de cofre, compartilhada pelos quatro passos de
 * criação/abertura e pela troca de credencial.
 *
 * Existe como componente próprio porque a `<div className="overlay">` ia ser
 * repetida em cada passo, e a consequência prática de repetir era um passo
 * fechar por engano e outro não. `closable` é prop porque a barreira do app
 * inteiro não tem para onde sair, enquanto a troca nas Configurações tem.
 */

interface VaultShellProps {
  title: string;
  /** Banner de abertura: `richText` devolve nós, não string. */
  subtitle: ReactNode;
  closable: boolean;
  /** `true` enquanto um Argon2id roda: fechar deixaria a pessoa sem saber se gravou. */
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function VaultShell({
  title,
  subtitle,
  closable,
  busy,
  onClose,
  children,
}: VaultShellProps): JSX.Element {
  const m = useMessages();
  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (closable && event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-header">
          <h2>
            <i className="fa-solid fa-vault" /> {title}
          </h2>
          {closable ? (
            <button className="modal-close" onClick={onClose} title={m.common.close}>
              <i className="fa-solid fa-xmark" />
            </button>
          ) : null}
        </div>
        <div className="modal-body">
          <div className="banner info">{subtitle}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Par de ações dentro do corpo do modal: cancela à esquerda, confirma à direita.
 * `onClose = null` é a barreira da tela inteira, que não tem Cancelar porque
 * não há para onde ir.
 */
export function VaultActions({
  onClose,
  busy,
  children,
}: {
  onClose: (() => void) | null;
  busy: boolean;
  children: ReactNode;
}): JSX.Element {
  const m = useMessages();
  return (
    <div className="modal-actions">
      {onClose === null ? (
        <span className="spacer" />
      ) : (
        <button className="btn ghost" onClick={onClose} disabled={busy}>
          {m.common.cancel}
        </button>
      )}
      {children}
    </div>
  );
}

/** Botão de confirmação, com o spinner enquanto o Argon2id roda. */
export function VaultSubmit({
  busy,
  icon,
  label,
  onClick,
  disabled = false,
}: {
  busy: boolean;
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}): JSX.Element {
  const m = useMessages();
  return (
    <button className="btn primary" onClick={onClick} disabled={busy || disabled}>
      {busy ? (
        <>
          <i className="fa-solid fa-spinner fa-spin" /> {m.common.loading}
        </>
      ) : (
        <>
          <i className={`fa-solid ${icon}`} /> {label}
        </>
      )}
    </button>
  );
}
