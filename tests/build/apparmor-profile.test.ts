import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * O perfil AppArmor não é código, e por isso não tem teste de unidade: o
 * electron-builder só o lê no momento de empacotar, e o erro aparece no
 * binário de quem instala. Estes testes são a linha de defesa barata para o que
 * já quebrou de verdade em campo.
 *
 * Duas regras deste arquivo vêm de defeito real, não de estilo:
 *
 * - o socket concreto do IBus (`~/.cache/ibus/dbus-*`) não é coberto por
 *   `<abstractions/ibus>`, e a ausência da regra **não derruba o app**: ela
 *   só deixa os campos de texto mudos no build instalado. `npm run dev` roda
 *   sem perfil, então ninguém vê;
 * - `/media/**` e `/run/media/**` são o caminho do pendrive no Mint, e o
 *   `owner @{HOME}/** r` não os alcança.
 *
 * Um teste que "o arquivo tem a regra certa" não prova que o AppArmor aplica
 * ela. O que prova é o ciclo em `docs/build.md` (`complain` → uso real →
 * enforce). O que estes testes garantem é o mais barato de todos: que a regra
 * não é apagada no próximo ajuste do perfil.
 */

const PROFILE_PATH = path.join(import.meta.dirname, '../../build/apparmor-profile');
const PROFILE = fs.readFileSync(PROFILE_PATH, 'utf-8');

/** Regras do perfil, sem comentário nem linha em branco. */
function rules(): string[] {
  return PROFILE.split('\n')
    .map((line) => norm(line))
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/**
 * Uma regra como o `hasRule` a compara: espaços colapsados.
 *
 * O perfil alinha as permissões em coluna (`owner /media/**     r,`), então a
 * comparação tem de ignorar o alinhamento ou todo teste quebra num ajuste
 * cosmético de espaçamento.
 */
function norm(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

/** `true` quando o perfil tem a regra, com espaços e alinhamento normalizados. */
function hasRule(expected: string): boolean {
  const alvo = norm(expected);
  return PROFILE.split('\n').some((line) => {
    const trimmed = norm(line);
    return trimmed !== '' && !trimmed.startsWith('#') && trimmed === alvo;
  });
}

describe('perfil AppArmor: método de entrada (IBus)', () => {
  it('libera o diretório do socket e o socket concreto', () => {
    // Sem o `r` no diretório, o `connect()` é negado antes de chegar no
    // socket; sem o `rw` no socket, o contexto de IME não escreve.
    expect(hasRule('owner @{HOME}/.cache/ibus/ r,')).toBe(true);
    expect(hasRule('owner @{HOME}/.cache/ibus/dbus-* rw,')).toBe(true);
  });

  it('continua incluindo a abstração do IBus', () => {
    // A abstração cobre a configuração e o peer abstrato; as duas linhas acima
    // somam o que falta. Remover a abstração inteira quebraria o resto do IME.
    expect(hasRule('include <abstractions/ibus>')).toBe(true);
  });

  it('explica por que a regra existe, para não ser "lixo" numa limpeza', () => {
    // Comentário apagado é regra apagada três meses depois: a regra parece
    // arbitrária para quem não conhece o defeito.
    expect(PROFILE).toMatch(/LP#1856738/);
    expect(PROFILE).toMatch(/IME/);
  });
});

describe('perfil AppArmor: mídia removível (seletor de capa)', () => {
  it('libera leitura do pendrive nos dois pontos de montagem do Mint', () => {
    expect(hasRule('owner /media/** r,')).toBe(true);
    expect(hasRule('owner /run/media/** r,')).toBe(true);
  });

  it('é somente leitura: escrever no pendrive não é necessidade do Cronologia', () => {
    // O Guardinha precisa de `rwk` porque grava backup no pendrive; aqui o app
    // só lê a capa escolhida. `rwk` aqui abriria escrita em todo o conteúdo
    // removível do usuário.
    //
    // O filtro olha só o trecho de permissões (depois da última barra), senão
    // `/run/media` casaria com "w" de "run".
    const escrita = rules().filter((line) => {
      if (!/^\S+\/media/.test(line) && !/^\S+\/run\/media/.test(line)) return false;
      return /[wa]/.test(line.slice(line.lastIndexOf('/') + 1));
    });
    expect(escrita).toEqual([]);
  });
});

describe('perfil AppArmor: caminhos do pacote', () => {
  it('não usa aspas: productName e executableName não têm espaço', () => {
    // `productName` é Cronologia e `executableName` é cronologia. As aspas não
    // quebram o parser, mas o comentário que as justificava ("productFilename
    // com espaço") estava errado e é o tipo de coisa que faz alguém copiar o
    // padrão para um app que tem espaço de verdade e achá-lo necessário.
    expect(PROFILE).not.toContain('"/opt/');
    expect(PROFILE).not.toContain('profile ${executable} "');
  });

  it('declara o perfil com as duas macros que o electron-builder substitui', () => {
    // `${...}` desconhecido **derruba o build**, então as duas macros precisam
    // estar e nada mais pode aparecer.
    expect(PROFILE).toMatch(/^profile \$\{executable\} \/opt\/\$\{sanitizedProductName\}\//m);
    const macros = PROFILE.match(/\$\{[a-zA-Z]+\}/g) ?? [];
    expect(new Set(macros)).toEqual(new Set(['${executable}', '${sanitizedProductName}']));
  });
});

describe('perfil AppArmor: estrutura', () => {
  it('abre e fecha um único perfil', () => {
    expect(PROFILE.match(/^profile /gm)).toHaveLength(1);
    expect(PROFILE.trimEnd().endsWith('}')).toBe(true);
  });

  it('mantém a escrita do cofre em /var/lib', () => {
    // O acervo e os segredos vivem aqui; encolher estas regras traria a falha
    // fechada do cofre de volta (ver docs/seguranca.md).
    expect(hasRule('owner /var/lib/.cronologia/.vault/ rw,')).toBe(true);
    expect(hasRule('owner /var/lib/.cronologia/.vault/** rwkl,')).toBe(true);
  });

  it('mantém a negação de escrita fora dos diretórios do app', () => {
    // Convergência: se alguém acrescentar `w` em `@{HOME}/**` (o que a
    // leitura do seletor de capa quase justificaria), esta lista trava.
    expect(PROFILE).not.toMatch(/owner @\{HOME\}\/\*\*\s+[a-z]*w/);
    expect(hasRule('owner @{HOME}/.local/share/cronologia/** rwkl,')).toBe(true);
  });
});
