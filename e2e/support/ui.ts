import type { Locator, Page } from 'playwright-core';

/**
 * Atalhos de seleção sobre a interface composta.
 *
 * Tudo aqui casa por papel acessível (`getByRole`, `getByLabel`) ou por
 * `placeholder`/`title`, nunca por classe: a classe é apresentação e muda com o
 * tema. Os textos vêm de `@zero/messages`, a mesma fonte que a tela usa, para o
 * seletor não virar uma segunda cópia da mensagem.
 */

/**
 * Passo que deriva Argon2id pode passar de um minuto: criar o cofre paga três
 * derivações e destravar uma paga uma. O prazo é folgado porque a espera é o
 * tempo do algoritmo, não um travamento do app.
 */
export const STEP_TIMEOUT_MS = 120_000;
const TOAST_TIMEOUT_MS = 15_000;

export function button(page: Page, name: string): Locator {
  return page.getByRole('button', { name, exact: true });
}

export async function clickButton(page: Page, name: string): Promise<void> {
  await button(page, name).click();
}

export async function fillLabel(page: Page, label: string, value: string): Promise<void> {
  await page.getByLabel(label, { exact: true }).fill(value);
}

export async function waitForHeading(
  page: Page,
  name: string,
  timeout = STEP_TIMEOUT_MS,
): Promise<void> {
  await page.getByRole('heading', { name, exact: true }).waitFor({ state: 'visible', timeout });
}

export async function waitForText(
  page: Page,
  text: string,
  timeout = STEP_TIMEOUT_MS,
): Promise<void> {
  await page.getByText(text, { exact: true }).first().waitFor({ state: 'visible', timeout });
}

/**
 * Um título que sai do DOM.
 *
 * É o sinal de que a barreira do cofre caiu: a chave voltou para a sessão e o
 * modal inteiro desmonta, em vez de só ficar escondido atrás do modal de
 * configurações. O prazo é o do passo porque o desenrolho custa um Argon2id.
 */
export async function waitForHeadingGone(
  page: Page,
  name: string,
  timeout = STEP_TIMEOUT_MS,
): Promise<void> {
  await page.getByRole('heading', { name, exact: true }).waitFor({ state: 'detached', timeout });
}

export async function waitForToast(page: Page, message: string): Promise<void> {
  await page
    .getByText(message, { exact: true })
    .first()
    .waitFor({ state: 'visible', timeout: TOAST_TIMEOUT_MS });
}

/**
 * Botão de fechar de um modal.
 *
 * Todo modal do app tem dois controles com o mesmo nome acessível: o `X` do
 * cabeçalho, que só carrega `title`, e o botão do rodapé, que carrega o texto.
 * O do rodapé é o último do DOM, e é ele que este atalho devolve. O nome vem
 * do bundle de mensagens porque a tela troca de idioma no meio da jornada.
 */
export function closeButton(page: Page, name: string): Locator {
  return button(page, name).last();
}

/** Cartão de obra, localizado pelo papel `article` e filtrado pelo título. */
export function workCard(page: Page, title: string): Locator {
  return page.getByRole('article').filter({ hasText: title });
}
