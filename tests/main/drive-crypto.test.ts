import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildManifest,
  decryptWith,
  isEncrypted,
  maybeEncrypt,
  parseManifest,
} from '@zero/main/drive/crypto';
import { saveSettings } from '@zero/main/settings';
import { resetSandbox } from '../helpers/sandbox.ts';
import { PASSPHRASE } from '../helpers/drive.ts';
import { openTestVault } from '../helpers/vault.ts';

const SECRET_DATA = Buffer.from('{"obras":[{"id":"segredo"}]}', 'utf-8');

function withPassphrase(passphrase = PASSPHRASE): void {
  saveSettings({
    driveClientId: '',
    drivePassphrase: passphrase,
    backupProvider: 'dropbox',
    language: 'pt-BR',
  });
}

describe('formato WTENC3 (único)', { timeout: 30_000 }, () => {
  beforeEach(async () => {
    resetSandbox();
    await openTestVault();
    withPassphrase();
  });

  it('roundtrip cifra e decifra com a senha', () => {
    const encrypted = maybeEncrypt(SECRET_DATA);
    expect(isEncrypted(encrypted)).toBe(true);
    expect(encrypted.subarray(0, 6).toString('utf-8')).toBe('WTENC3');
    expect(decryptWith(encrypted, PASSPHRASE).equals(SECRET_DATA)).toBe(true);
  });

  it('gera salt e IV aleatórios a cada chamada', () => {
    const first = maybeEncrypt(SECRET_DATA);
    const second = maybeEncrypt(SECRET_DATA);
    expect(first.equals(second)).toBe(false);
    expect(decryptWith(first, PASSPHRASE).equals(SECRET_DATA)).toBe(true);
    expect(decryptWith(second, PASSPHRASE).equals(SECRET_DATA)).toBe(true);
  });

  it('recusa senha errada sem vazar o motivo', () => {
    const encrypted = maybeEncrypt(SECRET_DATA);
    expect(() => decryptWith(encrypted, 'senha-errada')).toThrow(
      'Senha de criptografia incorreta ou backup corrompido.',
    );
  });

  it('exige senha para cifrar e para decifrar', () => {
    withPassphrase('');
    expect(() => maybeEncrypt(SECRET_DATA)).toThrow(
      'Defina uma senha de criptografia do backup nas configurações.',
    );
    const encrypted = Buffer.concat([Buffer.from('WTENC3'), Buffer.alloc(44), Buffer.from('x')]);
    expect(() => decryptWith(encrypted, '')).toThrow(
      'Este backup está criptografado. Informe a senha de criptografia.',
    );
  });

  it('rejeita buffers truncados e adulterados sem quebrar', () => {
    const encrypted = maybeEncrypt(SECRET_DATA);
    expect(() => decryptWith(encrypted.subarray(0, 20), PASSPHRASE)).toThrow(
      'Senha de criptografia incorreta ou backup corrompido.',
    );
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0xff;
    expect(() => decryptWith(tampered, PASSPHRASE)).toThrow(
      'Senha de criptografia incorreta ou backup corrompido.',
    );
  });

  it('devolve em claro o que nunca foi cifrado (compatibilidade)', () => {
    const plain = Buffer.from('texto-antigo-sem-cifra', 'utf-8');
    expect(isEncrypted(plain)).toBe(false);
    expect(decryptWith(plain, PASSPHRASE).equals(plain)).toBe(true);
  });

  it('não reconhece os formatos antigos WTENC1 e WTENC2', () => {
    for (const magic of ['WTENC1', 'WTENC2']) {
      const old = Buffer.concat([Buffer.from(magic), Buffer.alloc(44), Buffer.from('x')]);
      expect(isEncrypted(old)).toBe(false);
      expect(decryptWith(old, PASSPHRASE).equals(old)).toBe(true);
    }
  });
});

// O manifesto é o "commit" do backup: quem o lê decide os nomes locais de cada
// blob. `parseManifest` é a única fronteira antes dessa decisão, então cada
// forma estranha precisa virar recusa explícita, nunca um mapa adivinhado.
describe('formato do manifesto', () => {
  const INVALID = 'Manifesto do backup inválido.';
  const SALT = Buffer.alloc(16, 3);
  const SALT_B64 = SALT.toString('base64');

  beforeEach(() => {
    resetSandbox();
  });

  function manifestJson(payload: unknown): Buffer {
    return Buffer.from(JSON.stringify(payload), 'utf-8');
  }

  it('lê o formato atual com o salt da chave de nomes embutido', () => {
    const mapping = { 'hash-remoto': 'library.json' };
    expect(parseManifest(buildManifest(mapping, SALT))).toEqual({
      files: mapping,
      nameSalt: SALT,
    });
  });

  it('recusa o formato antigo sem salt próprio', () => {
    // O `v1` (mapa puro) saiu com a migração do cofre. Um backup desse formato
    // é recusado com a mensagem de restauração, que é a resposta honesta: quem
    // só tem esse backup precisa de um backup novo, não de um caminho antigo
    // meio lido.
    expect(() => parseManifest(manifestJson({ 'hash-antigo': 'library.json' }))).toThrow(INVALID);
  });

  it('recusa corpo que nem é JSON', () => {
    expect(() => parseManifest(Buffer.from('não é json'))).toThrow(INVALID);
  });

  it('recusa JSON que não é objeto', () => {
    for (const body of [null, 42, 'texto', true, ['a']]) {
      expect(() => parseManifest(manifestJson(body))).toThrow(INVALID);
    }
  });

  it('recusa versão que não é a atual', () => {
    expect(() => parseManifest(manifestJson({ v: 1, salt: SALT_B64, files: {} }))).toThrow(INVALID);
  });

  it('recusa o formato atual sem salt ou sem o mapa de arquivos', () => {
    expect(() => parseManifest(manifestJson({ v: 2, files: {} }))).toThrow(INVALID);
    expect(() => parseManifest(manifestJson({ v: 2, salt: SALT_B64 }))).toThrow(INVALID);
  });

  it('recusa salt fora do formato (não texto ou tamanho diferente de 16 bytes)', () => {
    const files = { hash: 'library.json' };
    expect(() => parseManifest(manifestJson({ v: 2, salt: 7, files }))).toThrow(INVALID);
    expect(() => parseManifest(manifestJson({ v: 2, salt: 'curto', files }))).toThrow(INVALID);
  });

  it('recusa mapa de arquivos que não é objeto de nome para nome', () => {
    for (const files of [null, ['x'], 'x', 3]) {
      expect(() => parseManifest(manifestJson({ v: 2, salt: SALT_B64, files }))).toThrow(INVALID);
    }
  });

  it('recusa entrada com nome local vazio, não texto ou nome remoto vazio', () => {
    const invalidos = [{ hash: '' }, { hash: 3 }, { '': 'library.json' }];
    for (const files of invalidos) {
      expect(() => parseManifest(manifestJson({ v: 2, salt: SALT_B64, files }))).toThrow(INVALID);
    }
  });
});
