'use client';

import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { SegGroup } from '@/components/form/SegGroup';
import { CommentPageContext } from './Comments';
import { BlockDisplayCtx, InPanelCtx, useInspector } from './inspectorContext';
import { InspRow, InspSeg } from './Inspector';

/**
 * A small screen-only switch between two or more ways of showing a section
 * (e.g. Standard Bar / Stacked Bar, Cards / Gantt). It sits at the section's
 * top right and shows on hover; the parent must carry `group/view`.
 *
 * In the business case's options panel mode it isn't on the page at all: it shows in the panel, as one of the
 * display options of the section it's in (or of its page), while that's selected.
 */
export function ViewSwitch<T extends string>(props: { /** The layout setting it changes (reset puts it back). */ field?: string; label: string; options: ReadonlyArray<readonly [T, string]>; value: T; onChange: (v: T) => void; position?: string; /** The hover class that shows it (its parent group). */ hover?: string }) {
  const { label, options, value, onChange, position = 'absolute right-3 top-3', hover = 'group-hover/view:opacity-100', field } = props;
  const insp = useInspector();
  const inPanel = useContext(InPanelCtx);
  const block = useContext(BlockDisplayCtx);
  const page = useContext(CommentPageContext);
  // (Reset finds the setting it changes by this marker, so it stays on the page, empty.)
  const marker = <span hidden data-edit-ui data-layout-field={field} />;
  const row = (
    <div data-layout-field={field}>
      <InspRow label={label}>
        <InspSeg label={label} options={options} value={value} onChange={onChange} />
      </InspRow>
    </div>
  );
  if (inPanel) return row;
  if (insp.on) {
    if (block) return block.el ? <>{marker}{createPortal(row, block.el)}</> : marker;
    const pageSel = insp.sel?.tab === 'page' && !!page && insp.sel.page === page.id;
    return pageSel && insp.pageDisplay ? <>{marker}{createPortal(row, insp.pageDisplay)}</> : marker;
  }
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
