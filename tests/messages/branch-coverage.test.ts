// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LANGUAGES, messages } from '@zero/messages';

/**
 * Ramos das mensagens que a varredura estrutural não alcança.
 *
 * `bundles.test.ts` percorre todas as folhas e chama cada função com argumentos
 * gerados: número na primeira posição e um texto de exemplo na segunda. Para
 * `driveErrors.providerHttp`, porém, a resposta do Dropbox é o **segundo**
 * argumento, então o gerador nunca entrega a string vazia e o ramo
 * `response === ''` ficava de fora do relatório de ramos dos cinco bundles
 * (83,3% em `en`, `ja`, `ko`, `zh-CN` e `pt-BR`).
 *
 * Esse ramo não é inalcançável: é o caso de um 5xx sem corpo, e é justamente o
 * caso em que a mensagem não pode prometer uma "Resposta:" que não existe. O
 * teste abaixo exercita o par inteiro (vazio e com corpo) nos cinco idiomas.
 */

describe('driveErrors.providerHttp: resposta vazia e resposta com corpo', () => {
  it.each([...LANGUAGES])('%s formata as duas respostas sem perder o status', (language) => {
    const { providerHttp } = messages(language).driveErrors;

    const semCorpo = providerHttp('Dropbox', 500, '');
    const comCorpo = providerHttp('Dropbox', 409, 'conflito de pasta');

    // Corpo vazio: o código HTTP continua visível e nenhum rótulo de resposta
    // órfão aparece na tela.
    expect(semCorpo).toContain('500');
    expect(semCorpo).not.toMatch(/Resposta:|Response:|응답|応答|响应/);

    // Com corpo: o texto do Dropbox chega ao usuário para o diagnóstico.
    expect(comCorpo).toContain('409');
    expect(comCorpo).toContain('conflito de pasta');
  });

  it.each([...LANGUAGES])('%s não confunde corpo vazio com status zero', (language) => {
    const { providerHttp } = messages(language).driveErrors;

    expect(providerHttp('Dropbox', 0, '')).not.toBe(providerHttp('Dropbox', 0, 'x'));
  });
});
