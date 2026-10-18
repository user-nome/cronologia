import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { MS_PER_SECOND, formatCountdown } from '@zero/shared';
import { useMessages } from '@zero/renderer/i18n';

/**
 * Peças de apresentação que os passos do cofre repetem: o aviso de erro, o
 * aviso de trava com a contagem regressiva e o atalho de Enter.
 *
 * Ficam aqui (e não dentro de `VaultModal`) porque são as mesmas nos passos de
 * criação, de abertura e de recuperação. Um aviso de erro escrito duas vezes
 * acaba divergindo em uma linha, e a diferença aparece só no idioma que o
 * tradutor não revisou.
 */

interface ErrorBannerProps {
  error: string | null;
}

/** Aviso de erro do canal de cofre; nada é desenhado quando não há erro. */
export function ErrorBanner({ error }: ErrorBannerProps): JSX.Element | null {
  if (error === null) return null;
  return (
    <div className="banner error">
      <i className="fa-solid fa-triangle-exclamation" /> {error}
    </div>
  );
}

interface LockBannerProps {
  /** Espera que falta, em segundos (a contagem é do lado da tela). */
  remainingSeconds: number;
}

/**
 * Aviso de trava exponencial, com o tempo que falta.
 *
 * O valor chega em segundos porque quem decreta é a tela: quem lê precisa ver o
 * tempo diminuindo, e recalcular o formato a cada tique só custaria trabalho.
 */
export function LockBanner({ remainingSeconds }: LockBannerProps): JSX.Element | null {
  const m = useMessages();
  if (remainingSeconds <= 0) return null;
  return (
    <div className="banner warning">
      <i className="fa-solid fa-clock" />{' '}
      {m.auth.lockout(formatCountdown(remainingSeconds * MS_PER_SECOND))}
    </div>
  );
}

/**
 * Enter no campo confirma o passo. O `preventDefault` é porque o Enter num
 * campo de senha dentro de um formulário recarregaria a tela inteira.
 */
export function submitOnEnter(
  event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  action: () => void,
): void {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  action();
}
