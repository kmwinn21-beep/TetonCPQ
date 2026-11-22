'use client';

import { SegGroup } from '@/components/form/SegGroup';

/**
 * A small screen-only switch between two or more ways of showing a section
 * (e.g. Standard Bar / Stacked Bar, Cards / Gantt). It sits at the section's
 * top right and shows on hover; the parent must carry `group/view`.
 */
export function ViewSwitch<T extends string>({ label, options, value, onChange, position = 'absolute right-3 top-3', hover = 'group-hover/view:opacity-100', field }: { /** The layout setting it changes (reset puts it back). */ field?: string; label: string; options: ReadonlyArray<readonly [T, string]>; value: T; onChange: (v: T) => void; position?: string; /** The hover class that shows it (its parent group). */ hover?: string }) {
  return (
    <div data-edit-ui data-layout-field={field} className={`no-print ${position} z-[5] opacity-0 ${hover} focus-within:opacity-100 transition-opacity`} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
    <SegGroup role="group" label={label} thumbClass="bg-white" className="flex rounded-lg bg-[rgba(15,23,32,.88)] p-0.5 text-[11px] text-white">
      {options.map(([v, text]) => {
        const on = value === v;
        return (
          <button key={v} type="button" aria-pressed={on} className={`px-2.5 py-1 rounded-md transition-colors duration-200 ${on ? 'text-teton-ink font-medium' : 'hover:bg-white/15'}`} onClick={() => onChange(v)}>
            {text}
          </button>
        );
      })}
    </SegGroup>
    </div>
  );
}
