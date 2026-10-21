import type { AuthorizeResult, BackupProviderId, BackupProviderInfo } from '@zero/types';
import type { Messages } from '@zero/messages';
import type { RemoteFile } from '@zero/types';
import { currentMessages } from '@zero/main/i18n';
import { dropboxProvider } from '@zero/main/drive/providers/dropbox';
import { googleDriveProvider } from '@zero/main/drive/providers/google';
import { state } from '@zero/main/drive/state';

/**
 * Contrato de um provedor de backup em nuvem.
 *
 * O núcleo do backup (`backup.ts`), a criptografia (`crypto.ts`) e a orquestração
 * são genéricos: eles conversam com a nuvem só por este contrato. Cada provedor
 * implementa as 4 operações de arquivo mais a autorização; OAuth, REST e forma
 * dos tokens vivem em `src/main/drive/providers/<provedor>/`.
 *
 * Textos da UI ficam em `describe(messages)` (idioma corrente em cada chamada);
 * `label` é o nome da marca, que não se traduz. O catálogo (`listProviders`)
 * formata tudo de uma vez no idioma vigente.
 *
 * Estado por provedor: `state.tokens` é sempre a sessão do provedor escolhido
 * (`state.provider`), e o cofre guarda uma entrada por destino, para que trocar
 * de provedor não desconecte o outro.
 */
export interface BackupProvider {
  readonly id: BackupProviderId;
  /** Nome da marca, fixo entre idiomas ("Dropbox", "Google Drive"). */
  readonly label: string;
  readonly operational: boolean;
  readonly storageHidden: boolean;
  /** Dados de UI localizados; também é o que `drive.providers()` devolve. */
  describe(messages: Messages): BackupProviderInfo;
  authorize(): Promise<AuthorizeResult>;
  listAppFiles(): Promise<RemoteFile[]>;
  uploadFile(name: string, buffer: Buffer): Promise<void>;
  downloadFile(fileId: string): Promise<Buffer>;
  deleteFile(fileId: string): Promise<void>;
}

/** Registro de todos os provedores catalogados, por id fechado. */
const REGISTRY: Record<BackupProviderId, BackupProvider> = {
  dropbox: dropboxProvider,
  'google-drive': googleDriveProvider,
};

/** Catálogo de provedores na ordem de exibição (UI e documentação). */
export function listProviders(): BackupProviderInfo[] {
  const m = currentMessages();
  return Object.values(REGISTRY).map((provider) => provider.describe(m));
}

export function getProvider(id: BackupProviderId): BackupProvider {
  return REGISTRY[id];
}

/**
 * Provedor usado nas operações de backup: o que o usuário escolheu.
 *
 * O valor vem de `state.provider`, que é carregado do `settings.json` no boot e
 * trocado por `switchProvider` (chamado pelo IPC `drive:setProvider`). Todo
 * caminho que fala com a nuvem passa por aqui, então `state.tokens` e o provedor
 * em uso não têm como divergir.
 */
export function currentProvider(): BackupProvider {
  return REGISTRY[state.provider];
}

/**
 * Autoriza o **provedor escolhido**, não um provedor fixo.
 *
 * É o que o IPC `drive:auth` chama. Cada sessão é gravada na entrada do cofre do
 * provedor ativo (`persistState` olha `state.provider`), então autorizar o
 * Dropbox com o Google Drive selecionado abriria a tela de login do Dropbox e
 * ainda escreveria o token dele na vaga do Drive. Delegar ao catálogo tira o
 * caminho de segunda mão: `switchProvider` escolhe, e aqui só se conecta.
 */
export function authorize(): Promise<AuthorizeResult> {
  return currentProvider().authorize();
}
