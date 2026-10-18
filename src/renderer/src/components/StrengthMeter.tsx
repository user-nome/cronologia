import type { JSX } from 'react';
import { useMessages } from '@zero/renderer/i18n';
import type { StrengthResult } from '@zero/shared';
import { meterWidthPercent } from '@zero/shared';

interface StrengthMeterProps {
  result: StrengthResult;
  /** Dica do tipo de credencial (`m.strength.hintMaster` etc.). */
  hint: string;
}

/**
 * Medidor de força da credencial: barra de 5 segmentos, rótulo do nível e o que
 * derrubou a nota.
 *
 * A régua vem de `@zero/shared` e é a mesma que o main usa para recusar: os dois
 * processos avaliam o mesmo texto com a mesma função, então o que a tela mostra
 * como "muito fraca" é literalmente o que o app vai recusar. Por isso o medidor
 * é conveniente de ler, não de enganar: `blocked` é o que recusa, e o nível é
 * só a nota.
 *
 * A dica e os motivos são dois elementos separados (e não uma frase montada) para
 * que o texto da dica não mude quando um motivo aparece: quem lê a dica nos
 * dois passos não vê a mesma linha respirar.
 */
export default function StrengthMeter({ result, hint }: StrengthMeterProps): JSX.Element {
  const m = useMessages();
  const reasons = result.reasons.map((reason) => m.strength.reasons[reason]);

  return (
    <div className="vault-strength">
      <span className="vault-strength-track">
        <span
          className={`vault-strength-bar ${result.level}`}
          style={{ width: `${meterWidthPercent(result.score)}%` }}
        />
      </span>
      <span className="help">{m.strength.levels[result.level]}</span>
      <span className="help">{hint}</span>
      {reasons.length > 0 ? <span className="help">{reasons.join(', ')}</span> : null}
    </div>
  );
}
