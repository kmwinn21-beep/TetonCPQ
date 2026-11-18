'use client';

/**
 * A small screen-only switch between two or more ways of showing a section
 * (e.g. Standard Bar / Stacked Bar, Cards / Gantt). It sits at the section's
 * top right and shows on hover; the parent must carry `group/view`.
 */
export function ViewSwitch<T extends string>({ label, options, value, onChange }: { label: string; options: ReadonlyArray<readonly [T, string]>; value: T; onChange: (v: T) => void }) {
  return (
    <div
      data-edit-ui
      role="group"
      aria-label={label}
      className="no-print absolute right-3 top-3 z-[5] flex rounded-lg bg-[rgba(15,23,32,.88)] p-0.5 text-[11px] text-white opacity-0 group-hover/view:opacity-100 focus-within:opacity-100 transition-opacity"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {options.map(([v, text]) => {
        const on = value === v;
        return (
          <button key={v} type="button" aria-pressed={on} className={`px-2.5 py-1 rounded-md ${on ? 'bg-white text-teton-ink font-medium' : 'hover:bg-white/15'}`} onClick={() => onChange(v)}>
            {text}
          </button>
        );
      })}
    </div>
  );
}
