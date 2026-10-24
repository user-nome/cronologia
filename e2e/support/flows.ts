import { expect } from 'vitest';
import type { Locator, Page } from 'playwright-core';
import { LANGUAGE_LABELS, messages } from '@zero/messages';
import {
  button,
  clickButton,
  closeButton,
  fillLabel,
  waitForHeading,
  waitForHeadingGone,
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

/**
 * Credenciais do cofre de teste, nos formatos de produção: senha mestra de 24
 * caracteres sem fragmento previsível, PIN de 8 dígitos não degenero e frase de
 * recuperação de 13 palavras distintas. A validação do app é conferida de
 * verdade, e não por um atalho que só existe no teste.
 */
export const VAULT = {
  master: 'Kx7#mQ2v!Zt9@Lp4&Rw6$Bd8',
  wrongMaster: 'Zq4#nW8c!Yv2@Tg7&Sh1$Fj5',
  weakMaster: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  pin: '49201733',
  wrongPin: '00000000',
  weakPin: '11111111',
  newPin: '63084512',
  phrase:
    'cavalo cenoura feira inverno bibliografia zettelkasten kalamita peixoto velleda aurora jubileu silhueta',
  wrongPhrase: 'gato relogio janela montanha livro nuvem farol vinho barco ponte folha chave mesa',
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
  await page.getByPlaceholder(pt.workModal.markerPlaceholder, { exact: true }).fill(WORK.marker);
}

/**
 * Cria o cofre pelas duas etapas: credenciais (senha mestra + PIN) e frase de
 * recuperação.
 *
 * Preenche tudo uma vez e depois muda **um campo por vez**, clicando em
 * Avançar e conferindo a recusa. É assim que a pessoa de verdade encontra a
 * tela: o formulário já está quase certo e o app diz o que falta. Cada recusa é
 * exercitada porque o que a jornada precisa provar é que o app barra formato
 * errado e valor degenerado **antes** de pagar o Argon2id.
 */
export async function createVault(page: Page): Promise<void> {
  await waitForHeading(page, pt.auth.createTitle);

  await fillLabel(page, pt.auth.masterLabel, VAULT.master);
  // Um caractere trocado na confirmação: o botão responde sem chamar o main.
  await fillLabel(page, pt.auth.masterConfirmLabel, VAULT.wrongMaster);
  await fillLabel(page, pt.auth.pinLabel, VAULT.pin);
  await fillLabel(page, pt.auth.newPinConfirmLabel, VAULT.pin);
  await clickButton(page, pt.common.next);
  await waitForText(page, pt.auth.masterMismatch);

  // Senha mestra degenerada com os 24 caracteres: recusada antes do Argon2id.
  await fillLabel(page, pt.auth.masterLabel, VAULT.weakMaster);
  await fillLabel(page, pt.auth.masterConfirmLabel, VAULT.weakMaster);
  await clickButton(page, pt.common.next);
  await waitForText(page, pt.vault.errors.vaultWeakMaster);

  // Senha mestra de volta ao valor válido: o que falta agora é o PIN.
  await fillLabel(page, pt.auth.masterLabel, VAULT.master);
  await fillLabel(page, pt.auth.masterConfirmLabel, VAULT.master);
  await fillLabel(page, pt.auth.pinLabel, '123');
  await fillLabel(page, pt.auth.newPinConfirmLabel, '123');
  await clickButton(page, pt.common.next);
  await waitForText(page, pt.vault.errors.vaultInvalidPin);

  // PIN degenerado: 8 dígitos que o app recusa (o primeiro palpite de ataque).
  await fillLabel(page, pt.auth.pinLabel, VAULT.weakPin);
  await fillLabel(page, pt.auth.newPinConfirmLabel, VAULT.weakPin);
  await clickButton(page, pt.common.next);
  await waitForText(page, pt.vault.errors.vaultWeakPin);

  // PIN válido em confirmação divergente: a dupla continua valendo.
  await fillLabel(page, pt.auth.pinLabel, VAULT.pin);
  await fillLabel(page, pt.auth.newPinConfirmLabel, VAULT.wrongPin);
  await clickButton(page, pt.common.next);
  await waitForText(page, pt.auth.pinMismatch);

  // Agora as duas credenciais batem: a etapa da frase abre.
  await fillLabel(page, pt.auth.newPinConfirmLabel, VAULT.pin);
  await clickButton(page, pt.common.next);
  await waitForHeading(page, pt.auth.recoveryTitle);

  // Frase curta: recusada na etapa da recuperação.
  await fillLabel(page, pt.auth.recoveryLabel, 'poucas palavras');
  await clickButton(page, pt.auth.createAction);
  await waitForText(page, pt.auth.recoveryTooShort(12, 2));

  // Frase pronta, confirmada com espaço a mais: só o espaço é normalizado, e a
  // caixa de cada palavra conta, então o Caps Lock aqui seria outra frase.
  await fillLabel(page, pt.auth.recoveryLabel, VAULT.phrase);
  await fillLabel(page, pt.auth.recoveryConfirmLabel, `  ${VAULT.phrase}  `);
  await clickButton(page, pt.auth.createAction);
  // A criação deriva um Argon2id por credencial (128 MiB na senha mestra, 256 MiB
  // no PIN): a biblioteca vazia cobre a espera.
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
  await page.getByText(pt.attributions.creditsSubtitle, { exact: true }).first().waitFor();
  await closeButton(page, pt.common.close).click();
  await waitForText(page, WORK.editedTitle);
}

/**
 * Troca de idioma e volta. O `Select` de idioma fica no modal de configurações,
 * que é onde o ajuste é salvo; o header e os cards acompanham porque a UI lê do
 * mesmo contexto de mensagens.
 */
/**
 * Troca de idioma e volta.
 *
 * O botão de salvar acompanha o idioma **já salvo**, e não o escolhido no
 * `Select`: o modal lê os textos do contexto, que só muda depois que o main
 * devolve as configurações normalizadas. Por isso o primeiro salvamento é pelo
 * rótulo em português e o segundo, com a tela já em inglês, pelo rótulo em
 * inglês.
 */
export async function switchLanguage(page: Page): Promise<void> {
  await openSettings(page);
  await page.getByRole('button', { name: LANGUAGE_LABELS['pt-BR'], exact: true }).click();
  await page.getByRole('option', { name: LANGUAGE_LABELS.en, exact: true }).click();
  await clickButton(page, pt.common.save);
  await waitForText(page, en.app.newWork);

  await page.getByRole('button', { name: LANGUAGE_LABELS.en, exact: true }).click();
  await page.getByRole('option', { name: LANGUAGE_LABELS['pt-BR'], exact: true }).click();
  await clickButton(page, en.common.save);
  await waitForText(page, pt.app.newWork);
  await closeSettings(page);
}

/**
 * Seletor de provedor sem chave embutida: desabilitado **e explicado**.
 *
 * Este passo só vale no alvo compilado com o `.env` ausente, que é como o
 * `npm run build` sai sem ninguém configurar `DROPBOX_APP_KEY` nem
 * `GOOGLE_CLIENT_ID`. Foi exatamente assim que o defeito chegou: o controle
 * aparecia desabilitado e mudo, e a leitura era "a tela quebrou" em vez de "este
 * build não tem chave". O motivo por provedor continua na lista do catálogo,
 * com o texto que o main devolveu.
 */
export async function providerUnavailableExplainsWhy(page: Page): Promise<void> {
  await openSettings(page);

  // O gatilho cai no placeholder do `Select` (não há opção para nomear), então
  // o nome acessível é o do placeholder, e ele precisa estar desabilitado.
  const seletor = button(page, pt.common.select);
  expect(await seletor.isDisabled()).toBe(true);
  await waitForText(page, pt.settings.noOperationalProvider);
  await waitForText(page, pt.providers.googleNoCredentials);
  await waitForText(page, pt.driveErrors.configureAppKey);
  // O botão de conectar continua visível e nomeado: é ele que diz qual conta
  // seria autorizada, e um rótulo ausente seria pior que o aviso.
  expect(await button(page, pt.settings.connectAction('Dropbox')).isVisible()).toBe(true);

  await closeSettings(page);
}

/**
 * Ação destrutiva sem a palavra exata: o botão de confirmar não habilita.
 *
 * A comparação da palavra ignora caixa (`typed.toUpperCase() === word.toUpperCase()`),
 * então a palavra errada aqui é outra, e não a mesma em minúsculas.
 */
export async function resetLibraryRequiresExactWord(page: Page): Promise<void> {
  await openSettings(page);
  await page.getByTitle(pt.danger.resetTitle, { exact: true }).click();
  const confirmInput = page.getByLabel(pt.danger.typeLabel(pt.danger.resetWord), { exact: true });
  const confirm = button(page, pt.danger.confirmAction);
  expect(await confirm.isDisabled()).toBe(true);

  await confirmInput.fill(pt.danger.destroyWord);
  expect(await confirm.isDisabled()).toBe(true);
  // "Cancelar" também é o atalho de cancelar obra no cartão, então o clique sai
  // do painel de confirmação: o pai do aviso é o campo que tem os dois botões.
  const panel = page.getByText(pt.danger.resetConfirm, { exact: true }).locator('..');
  await panel.getByRole('button', { name: pt.common.cancel, exact: true }).click();
  await waitForText(page, pt.danger.resetAction);
  await closeSettings(page);
}

/**
 * O modal de tela cheia do cofre, localizado pelo título **da etapa**.
 *
 * O botão "Abrir cofre" também existe no modal de configurações (que fica por
 * baixo, aberto), então as ações da barreira saem daqui para não ambiguar. E o
 * título entra como argumento porque cada etapa é um `h2` próprio: esperar por
 * "Cofre bloqueado" na tela de redefinição daria verde na hora, já que o `h2`
 * anterior acabou de ser trocado pelo título da etapa seguinte.
 *
 * A subida é pelo DOM: `h2` → cabeçalho do modal → modal.
 */
function vaultBarrier(page: Page, title: string): Locator {
  return page.getByRole('heading', { name: title, exact: true }).locator('xpath=../..');
}

/** A barreira some do DOM quando a chave volta para a sessão. */
async function barreiraClosed(page: Page, title: string): Promise<void> {
  await waitForHeadingGone(page, title);
}

/** Fecha o cofre pelo modal de configurações e devolve a barreira de pé. */
async function lockVault(page: Page): Promise<Locator> {
  await openSettings(page);
  await clickButton(page, pt.vault.closeVault);
  await waitForHeading(page, pt.auth.unlockTitle);
  return vaultBarrier(page, pt.auth.unlockTitle);
}

/**
 * Fecha o cofre e abre de novo, errando o PIN uma vez antes. O PIN errado arma a
 * trava exponencial, então o acerto logo em seguida prova que a trava só atrasa
 * a tentativa: ela não a elimina.
 */
export async function lockAndUnlockVault(page: Page): Promise<void> {
  const barreira = await lockVault(page);

  await barreira.getByLabel(pt.auth.pinLabel, { exact: true }).fill(VAULT.wrongPin);
  await barreira.getByRole('button', { name: pt.auth.unlockAction, exact: true }).click();
  await waitForText(page, pt.vault.errors.vaultWrongPin);

  await barreira.getByLabel(pt.auth.pinLabel, { exact: true }).fill(VAULT.pin);
  await barreira.getByRole('button', { name: pt.auth.unlockAction, exact: true }).click();
  await barreiraClosed(page, pt.auth.unlockTitle);
  await closeSettings(page);
  // O acervo voltou: o roundtrip da biblioteca cifrada passou pelo disco.
  await waitForText(page, WORK.editedTitle);
}

/**
 * A senha mestra abre o mesmo cofre, no mesmo campo e sem escolher: o app decide
 * o método pelo comprimento do que foi digitado, porque 24 caracteres só podem
 * ser a senha mestra. A etapa de redefinição do PIN deixa de existir, então a
 * espera é pelo título de bloqueio.
 */
export async function unlockWithMaster(page: Page): Promise<void> {
  const barreira = await lockVault(page);

  await barreira.getByLabel(pt.auth.pinLabel, { exact: true }).fill(VAULT.master);
  await barreira.getByRole('button', { name: pt.auth.unlockAction, exact: true }).click();
  await barreiraClosed(page, pt.auth.unlockTitle);
  await closeSettings(page);
  await waitForText(page, WORK.editedTitle);
}

/**
 * A frase de recuperação não é login: ela só redefine o PIN. O caminho existe a
 * partir da tela de bloqueio e abre o cofre em seguida, com o PIN novo já
 * reembrulhado (o acervo em disco não é tocado).
 */
export async function resetVaultPin(page: Page): Promise<void> {
  const bloqueio = await lockVault(page);

  await bloqueio.getByRole('button', { name: pt.auth.forgotPin, exact: true }).click();
  await waitForHeading(page, pt.auth.resetTitle);
  // A etapa trocou o `h2`: o alcance das ações passa a ser o novo modal.
  const redefinicao = vaultBarrier(page, pt.auth.resetTitle);

  // Frase errada: erro próprio, e a rampa conta como em qualquer credencial.
  await redefinicao.getByLabel(pt.auth.recoveryLabel, { exact: true }).fill(VAULT.wrongPhrase);
  await redefinicao.getByLabel(pt.auth.newPinLabel, { exact: true }).fill(VAULT.newPin);
  await redefinicao.getByLabel(pt.auth.newPinConfirmLabel, { exact: true }).fill(VAULT.newPin);
  await redefinicao.getByRole('button', { name: pt.auth.resetAction, exact: true }).click();
  await waitForText(page, pt.vault.errors.vaultWrongRecovery);

  // Frase certa: PIN novo reembrulhado e cofre aberto.
  await redefinicao.getByLabel(pt.auth.recoveryLabel, { exact: true }).fill(VAULT.phrase);
  await redefinicao.getByRole('button', { name: pt.auth.resetAction, exact: true }).click();
  await barreiraClosed(page, pt.auth.resetTitle);
  await closeSettings(page);
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

/** Fecha o cofre e prova que a barreira reaparece pedindo a criação de um novo. */
export async function destroyVault(page: Page): Promise<void> {
  await openSettings(page);
  await page.getByTitle(pt.danger.destroyTitle, { exact: true }).click();
  await page
    .getByLabel(pt.danger.typeLabel(pt.danger.destroyWord), { exact: true })
    .fill('DESTRUIR');
  await clickButton(page, pt.danger.confirmAction);
  await waitForHeading(page, pt.auth.createTitle);
  await waitForText(page, pt.auth.pinSubtitle);
}

export async function openSettings(page: Page): Promise<void> {
  await page.getByTitle(pt.app.settingsTitle, { exact: true }).click();
  await waitForHeading(page, pt.settings.title);
}

export async function closeSettings(page: Page): Promise<void> {
  await closeButton(page, pt.common.close).click();
  await page.getByRole('heading', { name: pt.settings.title }).waitFor({ state: 'detached' });
}
