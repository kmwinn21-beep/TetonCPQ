'use client';

/**
 * Form fields bound to the QuoteDraft form via react-hook-form's context.
 * Rates are stored as fractions and shown as percents (PercentField).
 */
import { useId } from 'react';
import { Controller, useFormContext, type FieldPath, type RegisterOptions } from 'react-hook-form';
import type { QuoteDraft } from '@/lib/quote/draft';
import { NumInput } from './NumInput';

type Name = FieldPath<QuoteDraft>;

interface FieldProps {
  name: Name;
  label: string;
  hint?: string;
  /** Workbook cell, shown on hover so a rep can find the same input in Excel. */
  cell?: string;
  disabled?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  rules?: RegisterOptions<QuoteDraft, Name>;
}

function FieldShell({ id, label, hint, cell, error, children }: { id: string; label: string; hint?: string; cell?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label" title={cell ? `Workbook: ${cell}` : undefined}>
        {label}
      </label>
      {children}
      {error ? <p className="text-xs mt-1 text-teton-ink bg-teton-red/25 rounded px-1.5 py-0.5 inline-block">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

function NumberLike({ name, label, hint, cell, disabled, placeholder, min, max, rules, scale, prefix, suffix, nullable }: FieldProps & { scale?: number; prefix?: string; suffix?: string; nullable?: boolean }) {
  const id = useId();
  const { control } = useFormContext<QuoteDraft>();
  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <FieldShell id={id} label={label} hint={hint} cell={cell} error={fieldState.error?.message}>
          <NumInput
            id={id}
            value={field.value as number | null}
            onChange={field.onChange}
            onBlur={field.onBlur}
            scale={scale}
            prefix={prefix}
            suffix={suffix}
            nullable={nullable}
            placeholder={placeholder}
            disabled={disabled}
            min={min}
            max={max}
            invalid={!!fieldState.error}
          />
        </FieldShell>
      )}
    />
  );
}

export const NumberField = (p: FieldProps & { suffix?: string; nullable?: boolean }) => <NumberLike {...p} />;
export const MoneyField = (p: FieldProps & { suffix?: string; nullable?: boolean }) => <NumberLike {...p} prefix="$" />;
export const PercentField = (p: FieldProps & { nullable?: boolean }) => <NumberLike {...p} scale={100} suffix="%" />;

export function ToggleField({ name, label, hint, disabled }: { name: Name; label: string; hint?: string; disabled?: boolean }) {
  const { control } = useFormContext<QuoteDraft>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
          <button
            type="button"
            role="switch"
            aria-checked={!!field.value}
            disabled={disabled}
            onClick={() => field.onChange(!field.value)}
            className={`mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent ${
              field.value ? 'bg-brand-secondary' : 'bg-teton-pale-gray'
            }`}
          >
            <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${field.value ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
          </button>
          <span>
            <span className="text-sm text-teton-ink">{label}</span>
            {hint && <span className="block text-xs text-teton-ui-gray">{hint}</span>}
          </span>
        </label>
      )}
    />
  );
}

export function SegmentedField<T extends string>({ name, label, options }: { name: Name; label: string; options: Array<{ value: T; label: string }> }) {
  const { control } = useFormContext<QuoteDraft>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div>
          <span className="label">{label}</span>
          <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-teton-pale-gray bg-white p-0.5">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={field.value === o.value}
                onClick={() => field.onChange(o.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  field.value === o.value ? 'bg-brand-secondary text-white' : 'text-teton-dark-gray hover:bg-teton-off-white'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    />
  );
}

/** A value the rep can't type: computed from other inputs, with its formula on show. */
export function DerivedField({ label, value, formula }: { label: string; value: string; formula: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="derived" title={formula}>
        {value}
      </div>
      <p className="hint">= {formula}</p>
    </div>
  );
}

export function Section({ id, title, description, children, aside }: { id: string; title: string; description?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-teton-ui-gray mt-0.5">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export const Grid = ({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) => (
  <div className={`grid gap-4 grid-cols-1 sm:grid-cols-2 ${cols === 3 ? 'lg:grid-cols-3' : cols === 4 ? 'lg:grid-cols-4' : ''}`}>{children}</div>
);
