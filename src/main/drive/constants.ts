import type { BackupProviderId } from '@zero/types';

/**
 * Nome da marca de cada provedor.
 *
 * Não é texto de interface e por isso não se traduz: "Dropbox" e "Google Drive"
 * são os nomes dos serviços. A tabela é a fonte única porque as mensagens de
 * erro precisam do nome certo (dizer "Permissões do dropbox atualizadas" entrega
 * o id do catálogo para o usuário) e porque a interface o usa nos botões.
 *
 * Fica aqui, e não em `providers/<provedor>/constants.ts`, porque é a única
 * tabela que os dois provedores e o fluxo compartilhado (`oauth-flow.ts`)
 * consultam. O que é exclusivo de cada serviço mora na pasta dele.
 */
export const PROVIDER_LABELS: Record<BackupProviderId, string> = {
  dropbox: 'Dropbox',
  'google-drive': 'Google Drive',
};

/**
 * Página de termos de uso do projeto, na landing page.
 *
 * Abre no navegador logo depois de o consentimento voltar aprovado: é onde a
 * pessoa está de fato (a aba do callback é a do `localhost`) e é o texto que
 * acompanha a concessão da conta. Mora aqui porque é do fluxo compartilhado, não
 * de um provedor: os dois abrem a mesma página.
 *
 * É URL de marca, não texto de interface, então fica fora dos bundles de idioma
 * (`docs/messages.md`).
 */
export const TERMS_URL = 'https://cronologia-delirante.vercel.app/termos';

/** Rótulo da marca de um provedor. */
export function providerLabel(id: BackupProviderId): string {
  return PROVIDER_LABELS[id];
}
