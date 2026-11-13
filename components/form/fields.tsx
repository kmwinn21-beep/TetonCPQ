'use client';

/**
 * Form fields bound to the QuoteDraft form via react-hook-form's context.
 * Rates are stored as fractions and shown as percents (PercentField).
 */
import { useId } from 'react';
import { Controller, useFormContext, type FieldPath, type RegisterOptions } from 'react-hook-form';
import type { QuoteDraft } from '@/lib/quote/draft';
import { NumInput } from './NumInput';
import { useSections } from './SectionsContext';

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

/**
 * A collapsible form section. The header toggles it; while collapsed it shows
 * `summary` so the deal can be scanned without opening anything. Contents stay
 * mounted when collapsed (only hidden), so the live preview and validation
 * keep working.
 */
export function Section({
  id,
  title,
  description,
  summary,
  children,
  aside,
}: {
  id: string;
  title: string;
  description?: string;
  summary?: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const { isOpen, setOpen } = useSections();
  const open = isOpen(id);
  const bodyId = `${id}-body`;
  return (
    <section id={id} className="card scroll-mt-4 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <button
          type="button"
          className="flex items-start gap-3 text-left flex-1 min-w-[16rem] group"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(id, !open)}
        >
          <svg
            className={`w-4 h-4 mt-1 flex-shrink-0 text-teton-ui-gray transition-transform ${open ? 'rotate-90' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M7.2 4.2a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L11.92 10 7.2 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
          <span className="min-w-0">
            <span className="block text-base font-semibold group-hover:underline underline-offset-2">{title}</span>
            {open
              ? description && <span className="block text-sm text-teton-ui-gray mt-0.5">{description}</span>
              : summary && <span className="block text-sm text-teton-dark-gray mt-0.5 line-clamp-2">{summary}</span>}
          </span>
        </button>
        {aside && (
          <div
            onClick={() => {
              // Actions in the header (e.g. "Add community") act on the contents, so show them.
              if (!open) setOpen(id, true);
            }}
          >
            {aside}
          </div>
        )}
      </div>
      <div id={bodyId} hidden={!open} className="px-5 pb-5">
        {children}
      </div>
    </section>
  );
}

export const Grid = ({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) => (
  <div className={`grid gap-4 grid-cols-1 sm:grid-cols-2 ${cols === 3 ? 'lg:grid-cols-3' : cols === 4 ? 'lg:grid-cols-4' : ''}`}>{children}</div>
);

/** Height animation for expanding content: grid rows 0fr ↔ 1fr, with a fade. */
export function Collapse({ open, id, children, className = '' }: { open: boolean; id?: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      id={id}
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'} ${className}`}
      // Hidden content stays mounted (its fields still validate) but can't be tabbed into.
      {...((open ? {} : { inert: '' }) as Record<string, string>)}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/**
 * A collapsible group of sections (e.g. Assumptions). Collapsed by default;
 * opening it reveals its sections, each still collapsed until clicked.
 */
export function SectionGroup({ id, title, summary, children }: { id: string; title: string; summary?: React.ReactNode; children: React.ReactNode }) {
  const { isOpen, setOpen } = useSections();
  const open = isOpen(id);
  const bodyId = `${id}-group`;
  return (
    <div data-group={id}>
      <button
        type="button"
        className="w-full flex items-start gap-3 text-left rounded-xl border border-dashed border-teton-pale-gray bg-teton-almost-white px-5 py-4 group hover:border-teton-light-gray transition-colors"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(id, !open)}
      >
        <svg className={`w-4 h-4 mt-1 flex-shrink-0 text-teton-ui-gray transition-transform duration-300 ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M7.2 4.2a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L11.92 10 7.2 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
        <span className="min-w-0">
          <span className="block text-base font-semibold group-hover:underline underline-offset-2">{title}</span>
          {summary && <span className="block text-sm text-teton-dark-gray mt-0.5">{summary}</span>}
        </span>
      </button>
      <Collapse open={open} id={bodyId}>
        <div className="space-y-4 pt-4">{children}</div>
      </Collapse>
    </div>
  );
}
