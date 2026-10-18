import type { JSX } from 'react';
import { VaultCreateSteps } from '@zero/renderer/components/VaultCreateSteps';
import { VaultUnlockSteps } from '@zero/renderer/components/VaultUnlockSteps';

interface VaultModalProps {
  mode: 'create' | 'unlock';
  onClose: () => void;
  /** Chama quando o cofre ficou aberto (criação, abertura ou redefinição do PIN). */
  onUnlocked: () => void;
  /**
   * `false` quando o cofre é a barreira da tela inteira (abrir o app): sem ele
   * não há acervo para mostrar, então não há para onde fechar.
   */
  closable?: boolean;
}

/**
 * Barreira de entrada do cofre.
 *
 * Este componente é só a escolha de **fluxo**; cada passo mora no seu módulo
 * (`VaultCreateSteps` e `VaultUnlockSteps`), porque os dois têm estado e
 * validação próprios e nenhum deles precisa saber do outro. A criação são duas
 * etapas e a abertura tem três caminhos — tudo isso é detalhe do passo, e o
 * modal existe só para dizer qual deles aparece.
 */
export default function VaultModal({
  mode,
  onClose,
  onUnlocked,
  closable = true,
}: VaultModalProps): JSX.Element {
  return mode === 'create' ? (
    <VaultCreateSteps closable={closable} onClose={onClose} onCreated={onUnlocked} />
  ) : (
    <VaultUnlockSteps closable={closable} onClose={onClose} onUnlocked={onUnlocked} />
  );
}
