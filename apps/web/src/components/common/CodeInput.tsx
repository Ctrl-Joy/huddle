import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

const LENGTH = 6;

/**
 * Six single-digit boxes for a one-time code. Typing advances, Backspace goes back, pasting (or the phone's
 * one-time-code autofill) fills every box, and `onComplete` fires once all six digits are in.
 */
export function CodeInput({ value, onChange, onComplete, disabled, invalid, autoFocus, label = 'Verification code' }: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus) refs.current[Math.min(value.length, LENGTH - 1)]?.focus();
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // after a check finishes (boxes re-enabled), put the caret back so the user can retype straight away
  const wasDisabled = useRef(disabled);
  useEffect(() => {
    if (wasDisabled.current && !disabled && autoFocus) refs.current[Math.min(value.length, LENGTH - 1)]?.focus();
    wasDisabled.current = disabled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const focus = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(LENGTH - 1, i))];
    el?.focus();
    el?.select();
  };

  const commit = (next: string, focusAt?: number) => {
    const clean = next.replace(/\D/g, '').slice(0, LENGTH);
    onChange(clean);
    if (focusAt !== undefined) focus(focusAt);
    if (clean.length === LENGTH && clean !== value) onComplete?.(clean);
  };

  const onInput = (i: number, raw: string) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;
    if (typed.length > 1) {
      // autofill / paste into one box: spread from the start when it's a whole code, else from here
      const start = typed.length >= LENGTH ? 0 : i;
      const next = (value.slice(0, start) + typed).slice(0, LENGTH);
      commit(next, Math.min(next.length, LENGTH - 1));
      return;
    }
    const arr = digits.slice();
    arr[i] = typed;
    // keep it contiguous: a digit typed past the end lands in the first empty box
    const next = arr.join('').slice(0, LENGTH);
    commit(next, Math.min(i + 1, LENGTH - 1));
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[i]) commit(value.slice(0, i) + value.slice(i + 1), i);
      else if (i > 0) commit(value.slice(0, i - 1) + value.slice(i), i - 1);
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); focus(i - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); focus(i + 1); }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!text) return;
    e.preventDefault();
    const next = text.slice(0, LENGTH);
    commit(next, Math.min(next.length, LENGTH - 1));
  };

  return (
    <div className={'code-input' + (invalid ? ' invalid' : '')} role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className="code-box"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          maxLength={i === 0 ? LENGTH : 1}
          value={d}
          disabled={disabled}
          onChange={(e) => onInput(i, e.target.value.replace(d, '') || e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          // a tap on any empty box goes to the first empty one, so digits stay in order
          onMouseDown={(e) => { if (!d && i > value.length) { e.preventDefault(); focus(value.length); } }}
        />
      ))}
    </div>
  );
}
