import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openExternalSafe } from '@zero/main/external';
import { shell } from '../mocks/electron.ts';

/** URL de autorização que o próprio app monta (PKCE, sem secret). */
const AUTH_URL =
  'https://www.dropbox.com/oauth2/authorize?client_id=app-key&response_type=code&code_challenge=xyz&state=s1';

/**
 * `external.ts` é a defesa em profundidade das duas origens de URL externa: o
 * link que escapa do renderer (pelo `setWindowOpenHandler`) e a URL de
 * autorização do OAuth. Aqui a função é testada direto, sem janela: o que
 * importa é a decisão do módulo (abrir só `https`, devolver `false` no resto e
 * nunca derrubar quem chamou).
 */
describe('external: a única saída para o navegador é https', () => {
  beforeEach(() => {
    shell.openExternal.mockClear();
    shell.openExternal.mockImplementation(() => Promise.resolve());
  });

  it('abre a URL de autorização e repassa ao shell a mesma string recebida', () => {
    expect(openExternalSafe(AUTH_URL)).toBe(true);
    expect(shell.openExternal).toHaveBeenCalledTimes(1);
    // O shell recebe o que o app montou, e não o `href` normalizado do `URL`:
    // o `state` e o `code_challenge` do PKCE vão como o OAuth espera.
    expect(shell.openExternal).toHaveBeenCalledWith(AUTH_URL);
  });

  it('aceita o esquema escrito em maiúscula, que a URL normaliza para https', () => {
    const url = 'HTTPS://www.dropbox.com/oauth2/authorize';
    expect(openExternalSafe(url)).toBe(true);
    expect(shell.openExternal).toHaveBeenCalledWith(url);
  });

  it('recusa qualquer outro esquema e não chega ao shell', () => {
    const recusadas = [
      'http://exemplo.com/docs',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<script>alert(1)</script>',
      'mailto:alguem@exemplo.com',
    ];
    for (const url of recusadas) {
      expect(openExternalSafe(url)).toBe(false);
    }
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('URL malformada devolve false em vez de estourar exceção', () => {
    // `https://` e `www.dropbox.com` sem esquema não são URL para o construtor:
    // a recusa tem que ser a mesma do caminho malformado, sem exceção.
    for (const url of ['nao-e-url', '', 'https://', 'www.dropbox.com']) {
      expect(openExternalSafe(url)).toBe(false);
    }
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('falha do shell é registrada e não vira erro para quem chamou', async () => {
    const falha = new Error('nenhum navegador configurado');
    shell.openExternal.mockImplementationOnce(() => Promise.reject(falha));
    const logErro = vi.spyOn(console, 'error').mockImplementation((): void => undefined);

    // A abertura é "dispara e esquece": quem chamou (o handler de janela ou o
    // OAuth) decide por conta própria, então a recusa do shell não propaga.
    expect(openExternalSafe(AUTH_URL)).toBe(true);
    await vi.waitFor(() => expect(logErro).toHaveBeenCalledTimes(1));

    expect(logErro).toHaveBeenCalledWith('Falha ao abrir URL externa:', falha);
  });
});
