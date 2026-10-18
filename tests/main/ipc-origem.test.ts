import fs from 'fs';
import path from 'path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@zero/types';
import { messages } from '@zero/messages';
import { currentMessages } from '@zero/main/i18n';
import { configDir } from '@zero/main/library';
import { ipcMain } from '../mocks/electron.ts';
import type { IpcHandler } from '../mocks/electron.ts';
import { openTestVault } from '../helpers/vault.ts';

/**
 * Guarda de origem do IPC (`assertAppFrame`).
 *
 * Fica em arquivo próprio porque é a **primeira** coisa que roda em todos os
 * canais, antes de qualquer regra de domínio: um handler chamado por um frame que
 * não é a página do app não pode tocar cofre, biblioteca ou nuvem. Quando ela
 * falha por descasamento, o sintoma é silencioso (o app "não faz nada"), então o
 * conjunto de frames recusados é o que precisa ficar explícito.
 *
 * Também fixa o que a extração de `appPageUrl()` protegeu: a base da URL é
 * resolvida em um lugar só (`main/protocols.ts`), e as duas guardas que dependem
 * dela precisam ler a mesma função.
 */

const FAKE_EVENT = { senderFrame: { url: 'cronologia://app/index.html' } };

const AJUSTES: AppSettings = {
  language: 'pt-BR',
  drivePassphrase: 'senha-de-teste',
  driveClientId: '',
  backupProvider: 'dropbox',
};

function handler(channel: string): IpcHandler {
  const call = ipcMain.handle.mock.calls.find((entry) => entry[0] === channel);
  if (call === undefined) throw new Error(`Handler IPC ausente: ${channel}`);
  return call[1];
}

function frameDe(url: unknown): unknown {
  return { senderFrame: { url } };
}

/** Frames que não são a página do app e portanto não podem chamar handler nenhum. */
const FORA_DA_PAGINA: unknown[] = [
  {},
  null,
  { senderFrame: null },
  { senderFrame: {} },
  // URL que não é parseável não pode "dar branco" e liberar o handler.
  { senderFrame: { url: ':::nao-e-url' } },
  // `url` fora de string é tratado como ausente, nunca como confiado.
  { senderFrame: { url: 42 } },
  { senderFrame: { url: 'https://evil.example/pagina' } },
  // Mesmo scheme, outra origem, ou nenhum origin.
  { senderFrame: { url: 'cronologia://outro/index.html' } },
  { senderFrame: { url: 'file:///etc/passwd' } },
];

/** Troca o idioma no `settings.json`, que é o que `currentMessages()` lê a cada chamada. */
function gravarIdioma(language: 'pt-BR' | 'en' | 'ja'): void {
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(path.join(configDir(), 'settings.json'), JSON.stringify({ language }), 'utf-8');
}

beforeAll(async () => {
  await openTestVault();
  gravarIdioma('pt-BR');
  await import('@zero/main/index');
  await vi.waitFor(() => expect(ipcMain.handle).toHaveBeenCalled());
});

afterEach(() => {
  vi.unstubAllEnvs();
  gravarIdioma('pt-BR');
});

describe('guarda de origem do IPC', () => {
  it('recusa frame ausente, de URL inválida e de outra origem', () => {
    for (const frame of FORA_DA_PAGINA) {
      expect(() => handler('library:get')(frame)).toThrow(currentMessages().errors.foreignFrame);
      expect(() => handler('settings:set')(frame, AJUSTES)).toThrow(
        currentMessages().errors.foreignFrame,
      );
    }
  });

  it('aceita a página do app e recusa a mesma origem com porta diferente', () => {
    // Só o origin interessa: o reload com query de cache bust é a mesma página.
    expect(handler('library:get')(FAKE_EVENT)).toBeInstanceOf(Array);
    expect(handler('library:get')(frameDe('cronologia://app/index.html?v=2'))).toBeInstanceOf(
      Array,
    );
    expect(() => handler('library:get')(frameDe('cronologia://app:1234/index.html'))).toThrow(
      currentMessages().errors.foreignFrame,
    );
  });

  it('a recusa sai no idioma em uso, porque ela atravessa o IPC', () => {
    // Este erro **chega ao renderer** como `Error` rejeitado, igual aos outros:
    // a pessoa lê a frase na tela e pode estar em qualquer um dos cinco idiomas.
    // Hardcodar a string em português no main era o que mantinha o texto fora do
    // bundle.
    for (const idioma of ['pt-BR', 'en', 'ja'] as const) {
      gravarIdioma(idioma);
      expect(() => handler('library:get')(frameDe('https://evil.example/'))).toThrow(
        messages(idioma).errors.foreignFrame,
      );
      // E não é o texto do outro idioma: a troca precisa valer.
      expect(() => handler('library:get')(frameDe('https://evil.example/'))).not.toThrow(
        messages(idioma === 'pt-BR' ? 'en' : 'pt-BR').errors.foreignFrame,
      );
    }
  });

  it('com o dev server de pé, ele é o frame aceito e o scheme de produção não', () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/index.html');
    expect(() => handler('library:get')(frameDe('http://localhost:5173/index.html'))).not.toThrow();
    expect(() => handler('library:get')(frameDe('cronologia://app/index.html'))).toThrow(
      currentMessages().errors.foreignFrame,
    );
  });

  it('não copia a fórmula da URL para dentro do index', () => {
    // `ELECTRON_RENDERER_URL` era lida em dois lugares (a `will-navigate` da
    // janela e `isAppFrameUrl`). Uma cópia que divergisse faria uma das guardas
    // recusar o frame legítimo sem mensagem, e o sintoma seria "o app não salva
    // nada". O dono único é `appPageUrl()`, em `main/protocols.ts`.
    const fonte = fs.readFileSync(
      path.join(import.meta.dirname, '..', '..', 'src', 'main', 'index.ts'),
      'utf-8',
    );
    expect(fonte).not.toMatch(/process\.env\.ELECTRON_RENDERER_URL/);
    expect(fonte).toContain('appPageUrl()');
  });
});
