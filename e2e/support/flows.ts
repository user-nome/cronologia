import { expect } from 'vitest';
import type { Page } from 'playwright-core';
import { LANGUAGE_LABELS, messages } from '@zero/messages';
import {
  button,
  clickButton,
  closeButton,
  fillLabel,
  waitForHeading,
  waitForText,
  waitForToast,
  workCard,
} from './ui.ts';

/**
 * A jornada do usuário, em passos reutilizáveis pelos dois alvos (compilado e
 * empacotado). Cada função dirige a interface por papel acessível e confere um
 * efeito observável (uma tela, um aviso, um cartão na grade), para que o teste
 * seja a afirmação de que aquele pedaço funciona de ponta a ponta.
 *
 * Os dois alvos compartilham os passos porque a jornada é do app, não do alvo:
 * o que muda entre eles é só a capacidade de alcançar a main do Electron.
 */

const pt = messages('pt-BR');
const en = messages('en');

/** Senha mestra do cofre de teste: longa e sem fragmento previsível. */
export const VAULT = {
  master: 'Kx7#mQ2v!Zt9@Lp4&Rw6$Bd8',
  wrong: 'Zq4#nW8c!Yv2@Tg7&Sh1$Fj5',
  weak: 'aaaaaaaaaaaa',
} as const;

/** Obra principal da jornada; o `title` muda na edição, por isso os dois campos. */
export const WORK = {
  title: 'Solo Leveling',
  editedTitle: 'Solo Leveling (reedição)',
  synopsis: 'HUNTERS x ZED: caçadores de rank E no mundo das portas.',
  marker: 'Cap. 45 / Vol. 3',
} as const;

const SECOND_WORK = {
  title: 'Obra temporária',
  synopsis: 'Entra e sai na mesma jornada.',
} as const;

/**
 * Abre o modal de obra com o formulário vazio.
 *
 * O botão do cabeçalho, e não o da tela vazia: a jornada cria a primeira obra
 * quando a biblioteca está vazia e a segunda quando já tem acervo, e os dois
 * atalhos têm textos diferentes.
 */
async function openNewWork(page: Page): Promise<void> {
  await clickButton(page, pt.app.newWork);
  await waitForHeading(page, pt.workModal.newTitle);
}

/** Preenche título, descrição, tipo, status, categoria e marcação. */
async function fillWorkForm(page: Page, work: { title: string; synopsis: string }): Promise<void> {
  await page.getByPlaceholder(pt.workModal.titlePlaceholder, { exact: true }).fill(work.title);
  await page
    .getByPlaceholder(pt.workModal.synopsisPlaceholder, { exact: true })
    .fill(work.synopsis);
  await page
    .getByPlaceholder(pt.workModal.markerPlaceholder, { exact: true })
    .fill(WORK.marker);
}

export async function createVault(page: Page): Promise<void> {
  await waitForHeading(page, pt.vault.createTitle);

  // Confirmação divergente: o botão responde sem chamar o main.
  await fillLabel(page, pt.vault.passwordLabel, VAULT.master);
  await fillLabel(page, pt.vault.confirmLabel, VAULT.wrong);
  await clickButton(page, pt.vault.createAction);
  await waitForText(page, pt.vault.mismatch);

  // Senha previsível: recusada pelo main antes do Argon2id.
  await fillLabel(page, pt.vault.passwordLabel, VAULT.weak);
  await fillLabel(page, pt.vault.confirmLabel, VAULT.weak);
  await clickButton(page, pt.vault.createAction);
  await waitForText(page, pt.vault.errors.vaultWeakPassword);

  await fillLabel(page, pt.vault.passwordLabel, VAULT.master);
  await fillLabel(page, pt.vault.confirmLabel, VAULT.master);
  await clickButton(page, pt.vault.createAction);
  // A criação deriva um Argon2id de 128 MiB: a biblioteca vazia cobre a espera.
  await waitForText(page, pt.app.emptyLibraryTitle);
}

export async function addWork(page: Page): Promise<void> {
  await openNewWork(page);
  await fillWorkForm(page, WORK);

  // Os `Select` do modal não têm `label` associado (o `label` é decorativo), então
  // o gatilho é localizado pelo nome acessível, que é o da opção escolhida.
  await clickButton(page, pt.workTypes.webtoon);
  await page.getByRole('option', { name: pt.workTypes.manga, exact: true }).click();
  await clickButton(page, pt.workStatus.planejado);
  await page.getByRole('option', { name: pt.workStatus.lendo, exact: true }).click();

  // A categoria é o único `Select` com busca: filtra e escolhe.
  await clickButton(page, pt.common.none);
  await page.getByPlaceholder(pt.common.searchOptions, { exact: true }).fill('Isekai');
  await page.getByRole('option', { name: 'Isekai', exact: true }).click();

  await clickButton(page, pt.common.save);
  await waitForToast(page, pt.app.toastSaved);
  await waitForText(page, WORK.title);
  await waitForText(page, pt.workTypes.manga);
  await waitForText(page, pt.workStatus.lendo);
  await waitForText(page, WORK.marker);
  await waitForText(page, pt.app.headerStats(1, 0));
}

export async function trackProgressFromCard(page: Page): Promise<void> {
  const card = workCard(page, WORK.title);
  await card.getByTitle(pt.workCard.increase1, { exact: true }).click();
  await waitForText(page, pt.workCard.progressValue(1));
  await card.getByTitle(pt.workCard.increase1, { exact: true }).click();
  await waitForText(page, pt.workCard.progressValue(2));
  await card.getByTitle(pt.workCard.decrease1, { exact: true }).click();
  await waitForText(page, pt.workCard.progressValue(1));

  await card.getByTitle(pt.workCard.pause, { exact: true }).click();
  await waitForText(page, pt.workStatus.pausado);
  await card.getByTitle(pt.workCard.resume, { exact: true }).click();
  await waitForText(page, pt.workStatus.lendo);

  await card.getByTitle(pt.workCard.finish, { exact: true }).click();
  await waitForText(page, pt.workStatus.concluido);
  await card.getByTitle(pt.workCard.reopen, { exact: true }).click();
  await waitForText(page, pt.workStatus.lendo);
}

export async function searchAndEditWork(page: Page): Promise<void> {
  const search = page.getByPlaceholder(pt.app.searchPlaceholder, { exact: true });
  await search.fill('obra que não existe');
  await waitForText(page, pt.app.emptyFoundTitle);
  // A busca cobre título, descrição e categoria: a categoria é o único dos três
  // que não é o texto visível do cartão.
  await search.fill('Isekai');
  await waitForText(page, WORK.title);
  await search.fill('');

  await page.getByText(WORK.title, { exact: true }).click();
  await waitForHeading(page, pt.workModal.editTitle);
  await page
    .getByPlaceholder(pt.workModal.titlePlaceholder, { exact: true })
    .fill(WORK.editedTitle);
  await page
    .getByPlaceholder(pt.workModal.synopsisPlaceholder, { exact: true })
    .fill(`${WORK.synopsis} Editado.`);
  await clickButton(page, pt.common.save);
  await waitForToast(page, pt.app.toastSaved);
  await waitForText(page, WORK.editedTitle);
  expect(await page.getByText(WORK.title, { exact: true }).count()).toBe(0);
}

export async function addAndDeleteWork(page: Page): Promise<void> {
  await openNewWork(page);
  await fillWorkForm(page, SECOND_WORK);
  await clickButton(page, pt.common.save);
  await waitForToast(page, pt.app.toastSaved);
  await waitForText(page, pt.app.headerStats(2, 0));

  const card = workCard(page, SECOND_WORK.title);
  await card.getByText(SECOND_WORK.title, { exact: true }).click();
  await waitForHeading(page, pt.workModal.editTitle);
  // Duas etapas: o primeiro clique só troca o rótulo do botão.
  await clickButton(page, pt.workModal.deleteAction);
  await clickButton(page, pt.workModal.confirmDelete);
  await waitForToast(page, pt.app.toastRemoved);
  await waitForText(page, pt.app.headerStats(1, 0));
  expect(await page.getByText(SECOND_WORK.title, { exact: true }).count()).toBe(0);
}

export async function filterByStatus(page: Page): Promise<void> {
  await clickButton(page, pt.app.filters.concluido);
  await waitForText(page, pt.app.emptyFoundTitle);
  await clickButton(page, pt.app.filters.lendo);
  await waitForText(page, WORK.editedTitle);
  await clickButton(page, pt.app.filters.todos);
  await waitForText(page, WORK.editedTitle);
}

export async function visitAttributions(page: Page): Promise<void> {
  await page.getByTitle(pt.app.openAttributionsTitle, { exact: true }).click();
  await waitForHeading(page, pt.attributions.title);
  // A tela tem duas cópias da rolagem (a original e a do laço): o texto do
  // subtítulo é o mesmo nas duas, e a visível vem primeiro.
  await page
    .getByText(pt.attributions.creditsSubtitle, { exact: true })
    .first()
    .waitFor();
  await closeButton(page, pt.common.close).click();
  await waitForText(page, WORK.editedTitle);
}

export async function visitDonate(page: Page): Promise<void> {
  await page.getByTitle(pt.app.openDonateTitle, { exact: true }).click();
  await waitForHeading(page, pt.donate.title);
  await waitForText(page, pt.donate.copyLink);
  await closeButton(page, pt.common.close).click();
  await waitForText(page, WORK.editedTitle);
}

/**
 * Troca de idioma e volta. O `Select` de idioma fica no modal de configurações,
 * que é onde o ajuste é salvo; o header e os cards acompanham porque a UI lê do
 * mesmo contexto de mensagens.
 */
export async function switchLanguage(page: Page): Promise<void> {
  await openSettings(page);
  await page.getByRole('button', { name: LANGUAGE_LABELS['pt-BR'], exact: true }).click();
  await page.getByRole('option', { name: LANGUAGE_LABELS.en, exact: true }).click();
  await clickButton(page, en.common.save);
  await waitForText(page, en.app.newWork);

  await page.getByRole('button', { name: LANGUAGE_LABELS.en, exact: true }).click();
  await page.getByRole('option', { name: LANGUAGE_LABELS['pt-BR'], exact: true }).click();
  await clickButton(page, pt.common.save);
  await waitForText(page, pt.app.newWork);
  await closeSettings(page);
}

/** Ação destrutiva sem a palavra exata: o botão de confirmar não habilita. */
export async function resetLibraryRequiresExactWord(page: Page): Promise<void> {
  await openSettings(page);
  await page.getByTitle(pt.danger.resetTitle, { exact: true }).click();
  const confirmInput = page.getByLabel(pt.danger.typeLabel(pt.danger.resetWord), { exact: true });
  const confirm = button(page, pt.danger.confirmAction);
  expect(await confirm.isDisabled()).toBe(true);

  await confirmInput.fill('apagar');
  expect(await confirm.isDisabled()).toBe(true);
  await clickButton(page, pt.common.cancel);
  await waitForText(page, pt.danger.resetAction);
  await closeSettings(page);
}

export async function lockAndUnlockVault(page: Page): Promise<void> {
  await openSettings(page);
  await clickButton(page, pt.vault.closeVault);
  await waitForHeading(page, pt.vault.unlockTitle);

  await fillLabel(page, pt.vault.passwordLabel, VAULT.wrong);
  await clickButton(page, pt.vault.unlockAction);
  await waitForText(page, pt.vault.errors.vaultWrongPassword);

  await fillLabel(page, pt.vault.passwordLabel, VAULT.master);
  await clickButton(page, pt.vault.unlockAction);
  // O badge de cofre aberto fica no modal de configurações, que continua aberto.
  await waitForText(page, pt.vault.badge.open);
  await closeSettings(page);
  // O acervo voltou: o roundtrip da biblioteca cifrada passou pelo disco.
  await waitForText(page, WORK.editedTitle);
}

/**
 * Apaga a biblioteca pela palavra de confirmação. A biblioteca zerada é a prova
 * de que o acervo foi sobrescrito e apagado, não esvaziado na tela.
 */
export async function resetLibrary(page: Page): Promise<void> {
  await openSettings(page);
  await page.getByTitle(pt.danger.resetTitle, { exact: true }).click();
  await page.getByLabel(pt.danger.typeLabel(pt.danger.resetWord), { exact: true }).fill('APAGAR');
  await clickButton(page, pt.danger.confirmAction);
  await waitForToast(page, pt.danger.libraryReset);
  await closeSettings(page);
  await waitForText(page, pt.app.emptyLibraryTitle);
}

/** Fecha o cofre e prova que a barreira reaparece pedindo a senha mestra. */
export async function destroyVault(page: Page): Promise<void> {
  await openSettings(page);
  await page.getByTitle(pt.danger.destroyTitle, { exact: true }).click();
  await page
    .getByLabel(pt.danger.typeLabel(pt.danger.destroyWord), { exact: true })
    .fill('DESTRUIR');
  await clickButton(page, pt.danger.confirmAction);
  await waitForHeading(page, pt.vault.createTitle);
  await waitForText(page, pt.vault.hint);
}

export async function openSettings(page: Page): Promise<void> {
  await page.getByTitle(pt.app.settingsTitle, { exact: true }).click();
  await waitForHeading(page, pt.settings.title);
}

export async function closeSettings(page: Page): Promise<void> {
  await closeButton(page, pt.common.close).click();
  await page.getByRole('heading', { name: pt.settings.title }).waitFor({ state: 'detached' });
}