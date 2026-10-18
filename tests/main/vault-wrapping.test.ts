import { describe, expect, it } from 'vitest';
import {
  clearedAttempts,
  registerFailedAttempt,
  remainingMs,
  statusFrom,
  wrongCredentialCode,
} from '@zero/main/vault/auth';
import { KDF_LIMITS } from '@zero/main/vault/crypto';
import { createVaultKey, isKdfCurrent, wrapperFor } from '@zero/main/vault/wrapping';
import type { CredentialKind } from '@zero/types/vault';

/**
 * Duas peças pequenas que valem teste próprio porque a suíte do cofre só as
 * exercita por efeito colateral: o estado da trava (projeção para a interface) e
 * o embrulho da chave (a estratégia por tipo de credencial).
 */

describe('vault/auth: a rampa é uma função da contagem, sem estado próprio', () => {
  const agora = 1_700_000_000_000;

  it('cada falha soma uma tentativa e aplica a espera do degrau', () => {
    expect(registerFailedAttempt({ attempts: 0, lockUntil: 0 }, agora)).toEqual({
      attempts: 1,
      lockUntil: agora + 10_000,
    });
    expect(registerFailedAttempt({ attempts: 1, lockUntil: 0 }, agora)).toEqual({
      attempts: 2,
      lockUntil: agora + 30_000,
    });
  });

  it('a contagem nunca zera por-effecto de uma falha, e o degrau só sobe', () => {
    // A rampa é monótona: um PIN digitado errado 4 vezes tem de custar mais que
    // 3, senão a penalidade vira um número que o atacante escolhe.
    const degraus = [0, 1, 2, 3, 4].map(
      (tentativas) =>
        registerFailedAttempt({ attempts: tentativas, lockUntil: 0 }, agora).lockUntil - agora,
    );
    expect(degraus).toEqual([10_000, 30_000, 60_000, 3_600_000, 86_400_000]);
    for (let i = 1; i < degraus.length; i += 1) {
      expect(degraus[i] ?? 0).toBeGreaterThan(degraus[i - 1] ?? 0);
    }
  });

  it('o acerto zera as tentativas e a espera', () => {
    expect(clearedAttempts()).toEqual({ attempts: 0, lockUntil: 0 });
  });

  it('o que falta da espera é medido contra o relógio, e nunca fica negativo', () => {
    expect(remainingMs({ attempts: 1, lockUntil: agora + 5_000 }, agora)).toBe(5_000);
    expect(remainingMs({ attempts: 1, lockUntil: agora }, agora)).toBe(0);
    expect(remainingMs({ attempts: 1, lockUntil: 0 }, agora)).toBe(0);
  });
});

describe('vault/auth: a projeção para a interface', () => {
  const agora = 1_700_000_000_000;

  it('leva as três coisas independentes que a tela precisa', () => {
    // `exists` vem do disco, `unlocked` da sessão e a trava do container: são
    // fontes diferentes, e uma tela que as misture mostra "cofre aberto" para
    // um cofre que existe e está fechado.
    expect(statusFrom({ attempts: 2, lockUntil: agora + 5_000 }, true, false, true, agora)).toEqual(
      {
        exists: true,
        unlocked: false,
        attempts: 2,
        lockUntil: agora + 5_000,
        lockRemainingMs: 5_000,
        hasRecovery: true,
      },
    );
    // Sem a trava, a contagem regressiva é zero mesmo com tentativas no disco:
    // quem já passou pela espera não vê um número que não pode contar.
    expect(
      statusFrom({ attempts: 3, lockUntil: agora - 1 }, true, true, true, agora).lockRemainingMs,
    ).toBe(0);
  });

  it('`hasRecovery` é o que habilita a tela "esqueci o PIN"', () => {
    expect(statusFrom({ attempts: 0, lockUntil: 0 }, true, true, false).hasRecovery).toBe(false);
  });

  it('cada credencial recusada tem o seu próprio código', () => {
    // Três recusas que pedem três ações diferentes: repetir o PIN, repetir a
    // senha ou conferir a frase. Colapsar num código só fazia o usuário
    // procurar a credencial errada.
    expect(wrongCredentialCode('master')).toBe('vaultWrongMaster');
    expect(wrongCredentialCode('pin')).toBe('vaultWrongPin');
  });
});

describe('vault/wrapping: a estratégia por tipo de credencial', () => {
  it('cada tipo tem o custo do segredo que ele protege', () => {
    expect(wrapperFor('pin').kdf.memoryKiB).toBeGreaterThan(wrapperFor('master').kdf.memoryKiB);
    expect(wrapperFor('recovery').kdf).toEqual(wrapperFor('master').kdf);
    // O PIN é 10^8 candidatos e não pode ficar no piso da faixa aceita.
    expect(wrapperFor('pin').kdf.memoryKiB).toBeGreaterThan(KDF_LIMITS.memoryKiB.min);
  });

  it('a chave nova é aleatória, do tamanho certo, e nunca igual à anterior', () => {
    const a = createVaultKey();
    const b = createVaultKey();
    expect(a.length).toBe(32);
    expect(a.equals(b)).toBe(false);
  });

  it('só um tipo fora da união é erro; os três da união resolvem', () => {
    expect(wrapperFor('master').kind).toBe('master');
    expect(wrapperFor('pin').kind).toBe('pin');
    expect(wrapperFor('recovery').kind).toBe('recovery');
    // A união fecha em tempo de compilação, mas o mapa é lido por nome: um
    // método desconhecido vindo do container tem de ser erro, nunca um caminho
    // silencioso sem custo de KDF.
    expect(() => wrapperFor('inexistente' as CredentialKind)).toThrow(/desconhecido/);
  });

  it('reembrulhar não toca na chave: é a mesma, com outro embrulho', async () => {
    // É essa propriedade que faz trocar senha/PIN ser barato e a frase de
    // recuperação ser só o regenerador do embrulho do PIN.
    const chave = createVaultKey();
    const wrapper = wrapperFor('pin');
    const primeiro = await wrapper.wrap(chave, '49201733');
    const segundo = await wrapper.wrap(chave, '73851042');

    const abrirPrimeiro = await wrapper.derive(primeiro, '49201733');
    const abrirSegundo = await wrapper.derive(segundo, '73851042');
    expect(wrapper.unwrap(primeiro, abrirPrimeiro)?.equals(chave)).toBe(true);
    expect(wrapper.unwrap(segundo, abrirSegundo)?.equals(chave)).toBe(true);
    // Cada embrulho tem o seu salt: dois PINs do mesmo valor em coframes
    // diferentes não podem dar a mesma chave de trabalho.
    expect(primeiro.kdfSalt.equals(segundo.kdfSalt)).toBe(false);
  });

  it('o custo gravado é conferido contra o perfil vigente', async () => {
    const wrapper = wrapperFor('master');
    const atual = await wrapper.wrap(createVaultKey(), 'a'.repeat(24));
    expect(isKdfCurrent('master', atual)).toBe(true);
    expect(isKdfCurrent('pin', atual)).toBe(false);

    // Um cofre gravado com perfil antigo é candidato a reembrulho, e é assim que
    // o custo sobe no próximo desbloqueio de quem tem a credencial.
    const antigo = { ...atual, kdf: { memoryKiB: 16_384, iterations: 1, parallelism: 1 } };
    expect(isKdfCurrent('master', antigo)).toBe(false);
  });

  it('um payload que não abre é recusado, e o que abre com outro tamanho também', async () => {
    const wrapper = wrapperFor('master');
    const chave = createVaultKey();
    const method = await wrapper.wrap(chave, 'a'.repeat(24));
    const errada = await wrapper.derive(method, 'b'.repeat(24));
    expect(wrapper.unwrap(method, errada)).toBeNull();

    // Embrulho cujo texto cifrado não tem os 32 bytes da chave: sem a conferência
    // de tamanho, a HKDF aceitaria o Buffer curto como se fosse o bom e a falha
    // só apareceria como acervo ilegível, bem depois do ponto do problema.
    const curto = {
      ...method,
      payload: { ...method.payload, data: method.payload.data.subarray(0, 8) },
    };
    expect(wrapper.unwrap(curto, await wrapper.derive(method, 'a'.repeat(24)))).toBeNull();
  });
});
