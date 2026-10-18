import { evaluateMaster, evaluatePhrase, evaluatePin } from '@zero/shared/strength';
import type { StrengthResult } from '@zero/shared/strength';

/** Tipo de credencial que o medidor de força sabe avaliar. */
export type StrengthKind = 'master' | 'pin' | 'phrase';

/**
 * Estratégia de avaliação (padrão Strategy): cada tipo de credencial tem sua
 * régua, e quem chama escolhe a estratégia pelo tipo, nunca a função certa.
 * Pura e sem estado, roda no main (recusa) e no renderer (medidor ao vivo),
 * sem depender de React nem de Node.
 */
export interface StrengthStrategy {
  readonly kind: StrengthKind;
  evaluate(value: string): StrengthResult;
}

/** Senha mestra de 24 caracteres. */
class MasterStrengthStrategy implements StrengthStrategy {
  public readonly kind = 'master' as const;

  public evaluate(value: string): StrengthResult {
    return evaluateMaster(value);
  }
}

/** PIN de 8 dígitos: nota teto "razoável", bloqueio só do degenerado. */
class PinStrengthStrategy implements StrengthStrategy {
  public readonly kind = 'pin' as const;

  public evaluate(value: string): StrengthResult {
    return evaluatePin(value);
  }
}

/** Frase de recuperação de 12+ palavras escrita pelo usuário. */
class PhraseStrengthStrategy implements StrengthStrategy {
  public readonly kind = 'phrase' as const;

  public evaluate(value: string): StrengthResult {
    return evaluatePhrase(value);
  }
}

/** Mapa de estratégias: trocar a régua de um tipo é trocar uma entrada. */
const STRATEGIES: Readonly<Record<StrengthKind, StrengthStrategy>> = {
  master: new MasterStrengthStrategy(),
  pin: new PinStrengthStrategy(),
  phrase: new PhraseStrengthStrategy(),
};

/** Estratégia vigente para o tipo de credencial. */
export function strengthFor(kind: StrengthKind): StrengthStrategy {
  return STRATEGIES[kind];
}
