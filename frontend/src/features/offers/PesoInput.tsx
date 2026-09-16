import { useLayoutEffect, useRef, type ChangeEvent } from 'react';
import { Input, type InputProps } from '@/components/ui';
import { groupPesoDigits } from '@/lib/money';

type PesoInputProps = Omit<InputProps, 'value' | 'onChange' | 'type'> & {
  value: string;
  onValueChange: (next: string) => void;
};

/**
 * A peso field that groups digits as they are typed.
 *
 * Deliberately `type="text"`: a number input cannot display a separator at all,
 * because its value has to parse as a number, and the browser simply discards
 * the comma. `inputMode="numeric"` keeps the numeric keypad on a phone, which
 * is what the number type was really buying here.
 *
 * Reformatting on every keystroke moves the caret to the end unless it is put
 * back, which makes editing the middle of a number unusable. The caret is
 * tracked by counting *digits* before it — separators shift around, digits do
 * not.
 */
export function PesoInput({ value, onValueChange, ...rest }: PesoInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const caret = caretRef.current;
    caretRef.current = null;
    if (caret == null || !inputRef.current) return;
    inputRef.current.setSelectionRange(caret, caret);
  });

  function caretAfterDigits(formatted: string, digitCount: number): number {
    let position = 0;
    let seen = 0;
    while (position < formatted.length && seen < digitCount) {
      if (/\d/.test(formatted[position]!)) seen += 1;
      position += 1;
    }
    return position;
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const element = event.target;
    const typed = element.value;
    const selection = element.selectionStart ?? typed.length;
    const digitsBeforeCaret = typed.slice(0, selection).replace(/\D/g, '').length;

    const formatted = groupPesoDigits(typed);
    const caret = caretAfterDigits(formatted, digitsBeforeCaret);

    if (formatted === value) {
      // The keystroke changed nothing we keep — a letter, or a digit past the
      // cap. React will not re-render, so the rejected character would sit in
      // the DOM until the next change. Undo it here.
      element.value = formatted;
      element.setSelectionRange(caret, caret);
      return;
    }

    caretRef.current = caret;
    onValueChange(formatted);
  }

  return (
    <Input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={handleChange}
      {...rest}
    />
  );
}
