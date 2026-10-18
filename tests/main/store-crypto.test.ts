import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { dataDir } from '@zero/main/library';
import {
  STORE_EXTENSION,
  STORE_MAGIC,
  coverFileName,
  openStoreFile,
  plainCoverName,
  readStoreFile,
  sealStoreFile,
  writeStoreFile,
} from '@zero/main/store-crypto';
import { lockVault } from '@zero/main/vault';
import { VaultError, isVaultError } from '@zero/main/vault/errors';
import { resetSandbox } from '../helpers/sandbox.ts';
import { openTestVault } from '../helpers/vault.ts';

const PLAIN = Buffer.from('[{"id":"obra-1"}]', 'utf-8');
/** Tamanho do cabeçalho: assinatura + IV + tag. */
const HEADER_BYTES = STORE_MAGIC.length + 16 + 16;

function storeFile(name: string): string {
  return path.join(dataDir(), name);
}

// O acervo em disco só existe enquanto há chave-mestra na sessão, e a chave de
// cada arquivo vem da sessão do cofre por HKDF com um `info` por domínio. Estes
// testes fixam as duas regras: sem chave não há cifra, e um domínio não abre o
// arquivo do outro.
describe('arquivo cifrado do acervo', () => {
  beforeEach(async () => {
    resetSandbox();
    await openTestVault();
  });

  it('grava no formato CLIB1 e devolve o texto no roundtrip', () => {
    const file = storeFile('library.enc');

    writeStoreFile(file, 'library', PLAIN);

    const raw = fs.readFileSync(file);
    expect(raw.subarray(0, STORE_MAGIC.length).toString('ascii')).toBe(STORE_MAGIC);
    expect(raw).toHaveLength(HEADER_BYTES + PLAIN.byteLength);
    // Em repouso o acervo é ruído: o texto não aparece no arquivo.
    expect(raw.toString('utf-8')).not.toContain('obra-1');
    expect(readStoreFile(file, 'library')?.equals(PLAIN)).toBe(true);
  });

  it('grava com 0600 e não deixa o .tmp para trás', () => {
    const file = storeFile('library.enc');

    writeStoreFile(file, 'library', PLAIN);

    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  it('ausente devolve null e ilegível falha fechado com libraryTampered', () => {
    // Ausente é o estado normal de biblioteca vazia; ilegível não pode virar
    // lista vazia, senão o próximo salvamento sobrescreveria o acervo do usuário.
    expect(readStoreFile(storeFile('fantasma.enc'), 'library')).toBeNull();
    expect(readStoreFile(dataDir(), 'library')).toBeNull();

    const file = storeFile('library.enc');
    writeStoreFile(file, 'library', PLAIN);
    const raw = fs.readFileSync(file);
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0xff;
    fs.writeFileSync(file, raw);

    expect(() => readStoreFile(file, 'library')).toThrow(VaultError);
    expect(() => readStoreFile(file, 'library')).toThrow('libraryTampered');
  });

  it('recusa arquivo com a assinatura de outro formato', () => {
    const file = storeFile('library.enc');
    writeStoreFile(file, 'library', PLAIN);
    const raw = fs.readFileSync(file);
    const outro = Buffer.concat([Buffer.from('OUTRO', 'ascii'), raw.subarray(STORE_MAGIC.length)]);

    // Mesmo tamanho e tag intacta: só a assinatura denuncia o formato errado.
    expect(outro).toHaveLength(raw.length);
    expect(openStoreFile('library', outro)).toBeNull();
    fs.writeFileSync(file, outro);
    expect(() => readStoreFile(file, 'library')).toThrow('libraryTampered');
  });

  it('recusa arquivo menor que o cabeçalho antes de tentar decifrar', () => {
    expect(openStoreFile('library', Buffer.alloc(HEADER_BYTES - 1))).toBeNull();
    expect(openStoreFile('cover', Buffer.from(STORE_MAGIC, 'ascii'))).toBeNull();
  });

  it('a chave de um domínio não abre o arquivo do outro', () => {
    const sealed = sealStoreFile('library', PLAIN);

    expect(openStoreFile('library', sealed)?.equals(PLAIN)).toBe(true);
    // Domínios separados por `info`: comprometer a biblioteca não vale a capa.
    expect(openStoreFile('cover', sealed)).toBeNull();
  });

  it('sem cofre aberto, selar e abrir falham com vaultLocked antes de tocar em disco', () => {
    const file = storeFile('library.enc');
    writeStoreFile(file, 'library', PLAIN);
    const sealed = fs.readFileSync(file);
    lockVault();

    for (const run of [
      () => sealStoreFile('library', PLAIN),
      () => sealStoreFile('cover', PLAIN),
      () => openStoreFile('library', sealed),
      () => writeStoreFile(storeFile('nova.enc'), 'library', PLAIN),
    ]) {
      try {
        run();
        throw new Error('esperava vaultLocked');
      } catch (error) {
        expect(isVaultError(error) && error.code).toBe('vaultLocked');
      }
    }
    expect(fs.existsSync(storeFile('nova.enc'))).toBe(false);
    expect(fs.existsSync(`${storeFile('nova.enc')}.tmp`)).toBe(false);
  });

  it('nomes de capa cifrado seguem a extensão do acervo', () => {
    expect(coverFileName('uuid.jpg')).toBe(`uuid.jpg${STORE_EXTENSION}`);
    expect(plainCoverName('uuid.jpg.enc')).toBe('uuid.jpg');
    // Só remove o sufixo do acervo: nome solto não vira nome de capa.
    expect(plainCoverName('uuid.jpg')).toBeNull();
  });
});
