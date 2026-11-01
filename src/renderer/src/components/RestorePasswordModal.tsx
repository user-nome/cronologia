import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { richText, useMessages } from '@zero/renderer/i18n';
import AppIcon from '@zero/renderer/components/AppIcon';

interface RestorePasswordModalProps {
  onConfirm: (passphrase: string) => void;
  onCancel: () => void;
  /** Nome do provedor de onde vem o backup ("Dropbox", "Google Drive"). */
  provider: string;
}

export default function RestorePasswordModal({
  onConfirm,
  onCancel,
  provider,
}: RestorePasswordModalProps): JSX.Element {
  const m = useMessages();
  const [passphrase, setPassphrase] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="modal">
        <div className="modal-header">
          <h2>
            <AppIcon name="key" /> {m.restore.title}
          </h2>
          <button className="modal-close" onClick={onCancel} title={m.common.close}>
            <AppIcon name="x" />
          </button>
        </div>

        <div className="modal-body">
          <div className="banner info">{richText(m.restore.banner(provider))}</div>

          <div className="field">
            <label>{m.restore.passphraseLabel}</label>
            <input
              ref={inputRef}
              type="password"
              value={passphrase}
              placeholder={m.restore.passphrasePlaceholder}
              onChange={(event) => setPassphrase(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onConfirm(passphrase);
              }}
            />
          </div>
        </div>

        <div className="modal-footer">
          <span className="spacer" />
          <button className="btn ghost" onClick={onCancel}>
            {m.common.cancel}
          </button>
          <button className="btn primary" onClick={() => onConfirm(passphrase)}>
            <AppIcon name="history" /> {m.restore.action}
          </button>
        </div>
      </div>
    </div>
  );
}
