'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A whole-number counter: − n +, where the number can also be typed. Steps stay inside min…max (− is off at the
 * minimum, + at the maximum); arrow keys step too. Disabled, it's grayed out and `reason` says why (under it).
 */
export function Counter({
  value,
  onChange,
  min = 0,
  max = 999,
  disabled,
  reason,
  id,
  className = '',
  size = 'md',
  'aria-label': ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Shown under it when disabled. */
  reason?: string;
  id?: string;
  className?: string;
  /** xs: compact, for narrow popovers (Scope Mode). */
  size?: 'xs' | 'sm' | 'md';
  'aria-label'?: string;
}) {
  const v = Number.isFinite(value) ? value : min;
  const [text, setText] = useState(String(v));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(v));
  }, [v]);
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const step = (d: number) => {
    if (disabled) return;
    const n = clamp(v + d);
    if (n !== v) onChange(n);
    setText(String(n));
  };
  const h = size === 'xs' ? 'h-7' : size === 'sm' ? 'h-8' : 'h-[34px]';
  const w = size === 'xs' ? 'w-6 text-[13px]' : 'w-[34px] text-[15px]';
  const btn = `${h} ${w} flex-shrink-0 grid place-items-center font-semibold bg-[#FAF8F4] transition-colors duration-150 motion-reduce:transition-none enabled:hover:bg-[#F1EEE8] disabled:text-[#C9C4BA] disabled:cursor-not-allowed`;
  return (
    <div className={className}>
      <div className={`flex items-stretch rounded-[9px] border overflow-hidden ${disabled ? 'border-[#ECE8DF] bg-[#F4F2EE]' : 'border-[#E4E0D6] bg-white focus-within:border-[#3F8CEA] focus-within:ring-[3px] focus-within:ring-[#3F8CEA]/15'}`}>
        <button type="button" tabIndex={-1} aria-label={`Fewer${ariaLabel ? `: ${ariaLabel}` : ''}`} disabled={disabled || v <= min} onClick={() => step(-1)} className={`${btn} border-r border-[#ECE8DF] ${disabled ? '!bg-[#F4F2EE]' : 'text-[#3F4753]'}`}>
          −
        </button>
        <input
          id={id}
          inputMode="numeric"
          role="spinbutton"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={v}
          aria-label={ariaLabel}
          disabled={disabled}
          value={text}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            setText(String(v));
          }}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d]/g, '');
            setText(raw);
            if (raw !== '') {
              const n = clamp(Number(raw));
              if (n !== v) onChange(n);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') (e.preventDefault(), step(1));
            if (e.key === 'ArrowDown') (e.preventDefault(), step(-1));
          }}
          className={`min-w-0 flex-1 w-full text-center ${size === 'xs' ? 'text-[12.5px]' : 'text-[13.5px]'} font-bold tabular-nums bg-transparent outline-none ${disabled ? 'text-[#B4AFA6]' : 'text-teton-ink'}`}
        />
        <button type="button" tabIndex={-1} aria-label={`More${ariaLabel ? `: ${ariaLabel}` : ''}`} disabled={disabled || v >= max} onClick={() => step(1)} className={`${btn} border-l border-[#ECE8DF] ${disabled ? '!bg-[#F4F2EE]' : 'text-[#3F4753]'}`}>
          +
        </button>
      </div>
      {disabled && reason && <p className="mt-1 text-[10.5px] leading-snug text-[#8A919C]">{reason}</p>}
    </div>
  );
}
