import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, JSX } from 'react';
import { useLanguage, useMessages } from '@zero/renderer/i18n';
import {
  dateMask,
  editDateText,
  formatDateText,
  isCompleteDateText,
  parseDateInput,
  parseDateText,
} from '@zero/shared/date';

interface DateFieldProps {
  /** Rótulo do campo (vem das mensagens). */
  label: string;
  /** A data em ISO (`YYYY-MM-DD`), que é o que o acervo guarda. */
  value: string | undefined;
  /** Recebe a nova data em ISO; `undefined` quando o campo é apagado. */
  onChange: (iso: string | undefined) => void;
  /** Avisa o dono quando o texto digitado não é uma data. */
  onInvalidChange?: (invalid: boolean) => void;
  /** Texto de exemplo do campo vazio (vem das mensagens). */
  placeholder: string;
  /** Identificador para os testes. */
  testId?: string;
}

/**
 * Campo de data com digitação livre.
 *
 * A pessoa digita os números como quiser (`10022026`, `10/02/2026`, `5/6/26`) e
 * o campo mostra a máscara do idioma (`10/02/2026`), no lugar do calendário do
 * navegador. O valor que sai daqui é sempre ISO (`YYYY-MM-DD`), que é o que o
 * acervo guarda.
 *
 * Enquanto a digitação não fecha uma data, o campo avisa o dono
 * (`onInvalidChange`): a data guardada continua sendo a última válida, e o
 * modal não salva por cima de uma data que a pessoa ainda não terminou.
 */
export default function DateField({
  label,
  value,
  onChange,
  onInvalidChange,
  placeholder,
  testId,
}: DateFieldProps): JSX.Element {
  const m = useMessages();
  const language = useLanguage();
  const mask = dateMask(language);
  const inputId = useId();
  const errorId = useId();

  const [text, setText] = useState<string>(() => formatDateText(value, language));
  const [synced, setSynced] = useState<string | undefined>(value);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);
  const emittedRef = useRef<string | undefined>(value);

  // O dono trocou a data por fora (o modal reabriu com outra obra): o texto
  // segue o valor. Quando a troca veio do próprio campo, o texto já é o que a
  // pessoa digitou e não é tocado.
  if (value !== synced) {
    setSynced(value);
    if (value !== emittedRef.current) setText(formatDateText(value, language));
  }

  const invalid = text !== '' && parseDateText(text, language) === null;
  const showError = invalid && (touched || isCompleteDateText(text, language));

  // O cursor volta para onde a digitação aconteceu: o navegador o joga para o
  // fim sempre que o valor do campo muda.
  useEffect(() => {
    const input = inputRef.current;
    const caret = caretRef.current;
    if (input === null || caret === null) return;
    input.setSelectionRange(caret, caret);
    caretRef.current = null;
  }, [text]);

  const emit = (next: string): void => {
    if (next === '') {
      emittedRef.current = undefined;
      onInvalidChange?.(false);
      onChange(undefined);
      return;
    }
    const iso = parseDateText(next, language);
    if (iso === null) {
      // Texto que ainda não é uma data: a data guardada continua a última
      // válida, e o dono fica sabendo de que há algo errado.
      onInvalidChange?.(true);
      return;
    }
    emittedRef.current = iso;
    onInvalidChange?.(false);
    onChange(iso);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;
    const edit = editDateText(raw, caret, language);
    caretRef.current = edit.caret;
    setText(edit.text);
    emit(edit.text);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const pasted = event.clipboardData.getData('text');
    const iso = parseDateInput(pasted, language);
    // O que não é uma data entra como texto normal: a máscara cuida dele.
    if (iso === null) return;
    event.preventDefault();
    const formatted = formatDateText(iso, language);
    caretRef.current = formatted.length;
    setText(formatted);
    emit(formatted);
  };

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className="date-input"
        data-testid={testId}
        value={text}
        placeholder={placeholder}
        aria-invalid={showError}
        aria-describedby={showError ? errorId : undefined}
        onChange={handleChange}
        onBlur={() => {
          setTouched(true);
        }}
        onPaste={handlePaste}
      />
      {showError ? (
        <span className="field-error" id={errorId} role="alert">
          {m.common.invalidDate(mask)}
        </span>
      ) : null}
    </div>
  );
}
