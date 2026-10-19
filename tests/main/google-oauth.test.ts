import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { googleFlow } from '@zero/main/drive/providers/google/oauth';
import {
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_LOOPBACK_PATH,
  GOOGLE_TOKEN_ENDPOINT,
  GOOGLE_USERINFO_ENDPOINT,
} from '@zero/main/drive/providers/google/constants';
import { currentMessages } from '@zero/main/i18n';
import { headerOf, json, stubFetch } from '../helpers/drive.ts';

const SEGREDO = 'GOCSPX-segredo-de-teste';

describe('google oauth helpers via googleFlow', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_CLIENT_SECRET', SEGREDO);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('authorizeParams', () => {
    it('retorna parâmetros offline e consent', () => {
      const params = googleFlow.authorizeParams?.('client-id');
      expect(params).toEqual({ access_type: 'offline', prompt: 'consent' });
    });

    it('ignora o clientId: o pedido de consentimento não leva segredo', () => {
      // O parâmetro existe só porque o `OAuthFlow` tem a mesma assinatura para
      // os dois provedores; o Google não precisa de nada além de `access_type`.
      expect(googleFlow.authorizeParams?.('client-id-que-nao-entra')).toEqual({
        access_type: 'offline',
        prompt: 'consent',
      });
    });
  });

  describe('tokenParams', () => {
    it('inclui client_secret quando há credencial', () => {
      const params = googleFlow.tokenParams?.('client-id');
      expect(params).toEqual({
        client_id: 'client-id',
        client_secret: SEGREDO,
      });
    });

    it('retorna objeto vazio sem client_secret', () => {
      vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
      const params = googleFlow.tokenParams?.('client-id');
      expect(params).toEqual({});
    });

    it('devolve o client_id do fluxo, e não um valor fixo', () => {
      // O `client_id` tem de ser o do app em uso: um par trocado faria o Google
      // recusar a troca por `invalid_client`.
      const params = googleFlow.tokenParams?.('outro.apps.googleusercontent.com');
      expect(params?.client_id).toBe('outro.apps.googleusercontent.com');
    });
  });

  describe('renewError', () => {
    it('nomeia o provedor para o usuário saber que precisa reconectar', () => {
      const error = googleFlow.renewError();
      // A renovação falha no fim da validade: o que o usuário precisa saber é que
      // a sessão acabou, não um "HTTP 400" de uma API intermediária.
      expect(error).toContain('Google Drive');
      expect(error).toBe(currentMessages().driveErrors.refreshFailed('Google Drive'));
    });
  });

  describe('a descrição do fluxo', () => {
    it('aponta para os endpoints do Google e pede os dois escopos mínimos', () => {
      expect(googleFlow.id).toBe('google-drive');
      expect(googleFlow.authorizeEndpoint).toBe(GOOGLE_AUTH_ENDPOINT);
      expect(googleFlow.tokenEndpoint).toBe(GOOGLE_TOKEN_ENDPOINT);
      expect(googleFlow.scopes.split(' ')).toEqual([
        'https://www.googleapis.com/auth/drive.appdata',
        'https://www.googleapis.com/auth/userinfo.email',
      ]);
    });

    it('sobe o callback em porta efêmera, sem porta fixa cadastrada', () => {
      // Cliente Desktop aceita qualquer porta de loopback no Google: fixar uma
      // exigiria cadastrar a URI no painel a cada build.
      expect(googleFlow.fixedPort).toBeUndefined();
      expect(googleFlow.loopbackPath).toBe(GOOGLE_LOOPBACK_PATH);
    });
  });

  describe('accountEmail (fetchAccountEmail)', () => {
    it('manda o token no header e devolve o e-mail quando a resposta é válida', async () => {
      const calls = stubFetch(() => json({ email: 'leitor@gmail.com' }));

      await expect(googleFlow.accountEmail('access-token')).resolves.toBe('leitor@gmail.com');

      const call = calls[0];
      if (call === undefined) throw new Error('O userinfo não foi chamado.');
      expect(call.url).toBe(GOOGLE_USERINFO_ENDPOINT);
      // No header, nunca na query: a URL vaza em log e proxy.
      expect(call.url).not.toContain('access-token');
      expect(headerOf(call, 'Authorization')).toBe('Bearer access-token');
    });

    it('devolve null em vez de derrubar a conexão quando o status não é 2xx', async () => {
      stubFetch(() => json({ error: 'invalid_token' }, 401));

      await expect(googleFlow.accountEmail('access-token')).resolves.toBeNull();
    });

    it('devolve null quando o corpo não tem o campo `email`', async () => {
      stubFetch(() => json({ name: 'Leitor', sub: '123' }));

      await expect(googleFlow.accountEmail('access-token')).resolves.toBeNull();
    });

    it('devolve null quando o `email` não é string', async () => {
      stubFetch(() => json({ email: 123 }));

      await expect(googleFlow.accountEmail('access-token')).resolves.toBeNull();
    });

    it('devolve null quando o corpo é lista em vez de objeto', async () => {
      stubFetch(() => json(['email']));

      await expect(googleFlow.accountEmail('access-token')).resolves.toBeNull();
    });

    it('devolve null quando o corpo é JSON inválido', async () => {
      stubFetch(() => new Response('nao-e-json', { status: 200 }));

      await expect(googleFlow.accountEmail('access-token')).resolves.toBeNull();
    });

    it('devolve null quando a rede falha', async () => {
      stubFetch(() => {
        throw new TypeError('fetch failed');
      });

      await expect(googleFlow.accountEmail('access-token')).resolves.toBeNull();
    });
  });
});
