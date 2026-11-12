'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A number box that lets the rep type freely ("0.", "1,200", "") and only
 * reports a number when the text parses. `scale` shows fractions as percents
 * (0.035 ↔ "3.5"). `nullable` lets an empty box mean "use the default".
 */
export interface NumInputProps {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  onBlur?: () => void;
  scale?: number;
  nullable?: boolean;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  'aria-label'?: string;
}

const show = (v: number | null | undefined, scale: number) =>
  v == null || !Number.isFinite(v) ? '' : String(Number((v * scale).toPrecision(12)));

export function NumInput({ value, onChange, onBlur, scale = 1, nullable, placeholder, prefix, suffix, min, max, id, disabled, invalid, className = '', ...rest }: NumInputProps) {
  const [text, setText] = useState(show(value, scale));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(show(value, scale));
  }, [value, scale]);

  function handle(raw: string) {
    setText(raw);
    const cleaned = raw.replace(/[,$%\s]/g, '');
    if (cleaned === '') {
      onChange(nullable ? null : 0);
      return;
    }
    const n = Number(cleaned);
    if (Number.isFinite(n)) onChange(n / scale);
  }

  const outOfRange = value != null && ((min != null && value < min) || (max != null && value > max));
  return (
    <div className={`relative ${className}`}>
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-teton-ui-gray pointer-events-none">{prefix}</span>}
      <input
        id={id}
        inputMode="decimal"
        className={`input-field tabular-nums ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-12' : ''} ${invalid || outOfRange ? 'ring-2 ring-teton-red border-transparent' : ''}`}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || outOfRange || undefined}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setText(show(value, scale));
          onBlur?.();
        }}
        onChange={(e) => handle(e.target.value)}
        {...rest}
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-teton-ui-gray pointer-events-none">{suffix}</span>}
    </div>
  );
}
