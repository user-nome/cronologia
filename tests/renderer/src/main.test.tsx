import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { createApiMock, installApiMock } from '../../helpers/api.ts';

/**
 * Cobre `src/renderer/src/main.tsx`, o entry point do renderer.
 *
 * Todo o resto da suíte de renderer monta `<App/>` pelo Testing Library, ou seja,
 * pula esse arquivo por inteiro: ele aparecia com 0% nas quatro métricas mesmo
 * sendo o caminho real de partida do app (`cronologia://index.html` carrega
 * este módulo e ele é quem faz `createRoot`).
 *
 * Duas condições decidem o comportamento do arquivo:
 *
 * 1. `window.api` precisa existir **antes** do import, porque o `App` lê a
 *    fachada no primeiro efeito. Por isso a instalação do mock vem no
 *    `beforeEach` e o módulo entra por `import()` dinâmico.
 * 2. O guarda `if (container !== null)` evita que a tela inteira quebre quando o
 *    `#root` falta do documento, então esse caminho também é exercitado.
 *
 * `vi.resetModules()` entre os cenários é obrigatório: sem ele o segundo
 * `import()` devolve o módulo do cache e o ramo de `#root` ausente nunca roda
 * (e o `render` do primeiro cenário não acontece duas vezes).
 */

/** Deixa o documento com um `#root` limpo e devolve o elemento. */
function montaRaiz(): HTMLDivElement {
  document.body.innerHTML = '';
  const raiz = document.createElement('div');
  raiz.id = 'root';
  document.body.appendChild(raiz);
  return raiz;
}

beforeEach(() => {
  // A fachada tem de estar no `window` antes de o `App` ser montado, senão o
  // primeiro efeito cai em `window.api` indefinido.
  installApiMock(createApiMock({ works: [] }));
  vi.resetModules();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('main.tsx: montagem do renderer', () => {
  it('monta o App dentro de #root', async () => {
    const raiz = montaRaiz();

    await act(async () => {
      await import('@zero/renderer/main');
    });

    // `createRoot(...).render()` é concorrente: o commit acontece no próximo
    // microtask, por isso o `act` acima e não uma leitura síncrona do DOM.
    await vi.waitFor(() => {
      expect(raiz).not.toBeEmptyDOMElement();
    });

    expect(raiz.querySelector('.app')).not.toBeNull();
    expect(raiz.querySelector('h1')?.textContent).toBe('Cronologia');
  });

  it('monta o App mesmo sem acervo e sem cofre fechado', async () => {
    // `createApiMock` padrão devolve cofre aberto e acervo vazio: o App entra
    // na tela principal, sem o VaultModal, e o cabeçalho mostra zero obras.
    const raiz = montaRaiz();

    await act(async () => {
      await import('@zero/renderer/main');
    });

    await vi.waitFor(() => {
      expect(raiz.querySelector('.app')).not.toBeNull();
    });
    expect(raiz.querySelectorAll('.work-card')).toHaveLength(0);
    expect(raiz.querySelector('.drive-pill')).not.toBeNull();
  });

  it('não renderiza nem quebra quando o #root não existe', async () => {
    document.body.innerHTML = '';

    await expect(import('@zero/renderer/main')).resolves.toBeDefined();

    expect(document.getElementById('root')).toBeNull();
    expect(document.body.innerHTML).toBe('');
  });
});
