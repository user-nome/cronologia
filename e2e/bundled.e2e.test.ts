import { afterAll, beforeAll, describe, it } from 'vitest';
import { launchBundled } from './support/launch.ts';
import type { LaunchedApp } from './support/launch.ts';
import {
  addAndDeleteWork,
  addWork,
  createVault,
  destroyVault,
  filterByStatus,
  lockAndUnlockVault,
  providerUnavailableExplainsWhy,
  resetLibrary,
  resetLibraryRequiresExactWord,
  resetVaultPin,
  searchAndEditWork,
  switchLanguage,
  trackProgressFromCard,
  unlockWithMaster,
  visitAttributions,
  visitDonate,
} from './support/flows.ts';

/**
 * Jornada completa contra o app compilado (`out/`), subido pelo Playwright.
 *
 * Os passos compartilham um único acervo: criar o cofre é o que deriva o
 * Argon2id, então os passos seguintes só reabrem e usam o mesmo cofre. A ordem
 * importa e é de propósito: é a jornada de quem instala e usa o app, e o
 * último passo fecha o cofre (que é o estado em que o app volta a ficar depois
 * de uma destruição).
 */
describe('App compilado (out/)', () => {
  let app: LaunchedApp | undefined;

  function current(): LaunchedApp {
    if (app === undefined) throw new Error('O app compilado não foi iniciado.');
    return app;
  }

  beforeAll(async () => {
    app = await launchBundled();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    app = undefined;
  });

  it('cria o cofre recusando confirmação e senha previsível', async () => {
    await createVault(current().page);
  });

  it('cadastra uma obra com tipo, status, categoria e marcação', async () => {
    await addWork(current().page);
  });

  it('acompanha o progresso e o status pelo cartão', async () => {
    await trackProgressFromCard(current().page);
  });

  it('busca pela marcação e edita a obra', async () => {
    await searchAndEditWork(current().page);
  });

  it('cadastra e exclui uma obra com confirmação em duas etapas', async () => {
    await addAndDeleteWork(current().page);
  });

  it('filtra a grade pelos chips de status', async () => {
    await filterByStatus(current().page);
  });

  it('abre a tela de atribuições', async () => {
    await visitAttributions(current().page);
  });

  it('abre a tela de doações e copia o link', async () => {
    await visitDonate(current().page);
  });

  it('troca o idioma e volta para o português', async () => {
    await switchLanguage(current().page);
  });

  it('não apaga a biblioteca sem a palavra exata', async () => {
    await resetLibraryRequiresExactWord(current().page);
  });

  it('explica por que o seletor de provedor está desabilitado', async () => {
    await providerUnavailableExplainsWhy(current().page);
  });

  it('fecha e reabre o cofre, recusando o PIN errado', async () => {
    await lockAndUnlockVault(current().page);
  });

  it('abre o cofre com a senha mestra no mesmo campo do PIN', async () => {
    await unlockWithMaster(current().page);
  });

  it('redefine o PIN com a frase de recuperação', async () => {
    await resetVaultPin(current().page);
  });

  it('apaga a biblioteca pela palavra de confirmação', async () => {
    await resetLibrary(current().page);
  });

  it('destrói o cofre e volta a pedir a senha mestra', async () => {
    await destroyVault(current().page);
  });
});
