'use client';

/**
 * Arranging the proposal on screen, per version: remove and add back the
 * standard sections, drag them into a different order (desktop), add blank
 * sections with formatted text between them, and remove individual figures.
 * Everything here is screen-only chrome (data-edit-ui): it never prints and
 * is stripped from the copy kept when a proposal is recorded as sent.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { renderText } from '@/lib/proposal/text';
import { isCustomId, type StandardSection } from '@/lib/proposal/layout';
import { T, useProposalText } from './EditableText';
import { useFigure } from './WhatIf';

/* ------------------------------------------------------------------ */
/* Labels of figures, so removed ones can be listed and added back.    */
/* ------------------------------------------------------------------ */

const LabelsCtx = createContext<{ labels: Record<string, string>; register: (k: string, label: string) => void }>({ labels: {}, register: () => {} });

export function ValueLabelsProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const register = useCallback((k: string, label: string) => setLabels((l) => (l[k] === label ? l : { ...l, [k]: label })), []);
  const value = useMemo(() => ({ labels, register }), [labels, register]);
  return <LabelsCtx.Provider value={value}>{children}</LabelsCtx.Provider>;
}

const MinusIcon = () => (
  <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
    <path d="M3.5 8h9" />
  </svg>
);
const PlusIcon = () => (
  <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
);
const GripIcon = () => (
  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
    {[3, 8, 13].flatMap((y) => [5.5, 10.5].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r={1.3} />))}
  </svg>
);

/**
 * A calculated figure the rep may remove (never edit). `label` names it in the
 * Removed list so it can be added back.
 */
export function V({ k, label, children, block = false }: { k: string; label: string; children: React.ReactNode; block?: boolean }) {
  const { editable, layout, setLayout } = useProposalText();
  const { register } = useContext(LabelsCtx);
  const fig = useFigure(k, label);
  useEffect(() => register(k, label), [k, label, register]);
  if (layout.hiddenValues.includes(k)) return null;
  if (!editable && !fig.clickable) return <>{children}</>;
  const Tag = block ? 'div' : 'span';
  const open = fig.clickable ? fig.open : undefined;
  return (
    <Tag ref={fig.ref as React.Ref<HTMLDivElement & HTMLSpanElement>} data-fig={k} className={`relative group/v ${block ? '' : 'inline-block'}`}>
      {fig.clickable ? (
        <span
          data-fig-value
          role="button"
          tabIndex={0}
          title={`See and change the inputs behind ${label}`}
          onClick={open}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              open?.();
            }
          }}
          className={`cursor-pointer rounded-[4px] -mx-0.5 px-0.5 outline-none decoration-dotted decoration-teton-blue underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-brand-accent ${
            fig.selected ? 'bg-teton-blue/10 ring-2 ring-teton-blue' : fig.was ? 'bg-[#FFF1CC] ring-1 ring-[#E2A72B]' : ''
          }`}
        >
          {children}
        </span>
      ) : (
        <span data-fig-value>{children}</span>
      )}
      {fig.clickable && fig.was && (
        <span data-edit-ui className="no-print block text-[10px] font-medium leading-tight text-[#8A5A00] whitespace-nowrap">
          was {fig.was}
        </span>
      )}
      {editable && (
        <button
          type="button"
          data-edit-ui
          className="no-print absolute -top-2 -right-3 hidden group-hover/v:flex w-4 h-4 items-center justify-center rounded-full bg-teton-near-black text-white shadow"
          title={`Remove ${label}`}
          aria-label={`Remove ${label}`}
          onClick={() => setLayout((l) => ({ ...l, hiddenValues: [...l.hiddenValues, k] }))}
        >
          <MinusIcon />
        </button>
      )}
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/* Section titles (shared with the Removed list).                      */
/* ------------------------------------------------------------------ */

export const SECTION_TITLES: Record<StandardSection, { key: string; title: string }> = {
  summary: { key: 'summary.title', title: 'Year 1 Financial Summary' },
  scope: { key: 'scope.title', title: 'Scope & investment' },
  terms: { key: 'terms.title', title: 'Terms / Notes' },
  implementation: { key: 'impl.title', title: 'Implementation' },
  resources: { key: 'resources.title', title: 'Implementation – Estimated Resource Allocation' },
  roi: { key: 'roi.title', title: 'Return on investment' },
  assumptions: { key: 'assume.title', title: 'Assumptions' },
};

/** The proposal's section heading with its divider line. */
export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold border-b-2 border-teton-ink pb-1 mb-3">{children}</h2>;
}

/* ------------------------------------------------------------------ */
/* Rich text for added sections.                                       */
/* ------------------------------------------------------------------ */

const SIZES: Array<[string, string]> = [
  ['12px', 'Small'],
  ['14px', 'Normal'],
  ['16px', 'Large'],
  ['19px', 'Larger'],
];
const COLORS: Array<[string, string]> = [
  ['#1E1E1E', 'Ink'],
  ['#394147', 'Dark gray'],
  ['#656E77', 'Gray'],
  ['#3F8CEA', 'Blue'],
  ['#2E9E64', 'Green'],
  ['#D9472B', 'Red'],
];

function exec(cmd: string, value?: string) {
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand(cmd, false, value);
}

/** Size the selection: the browser only offers 7 fixed sizes, so mark with the largest and swap in pixels. */
function setFontSize(root: HTMLElement, px: string) {
  exec('fontSize', '7');
  root.querySelectorAll<HTMLElement>('[style*="xxx-large"], font[size="7"]').forEach((el) => {
    if (el.tagName === 'FONT') {
      const span = document.createElement('span');
      span.style.fontSize = px;
      span.append(...Array.from(el.childNodes));
      el.replaceWith(span);
    } else el.style.fontSize = px;
  });
}

function FormatBar({ editor }: { editor: React.RefObject<HTMLDivElement> }) {
  const [, force] = useState(0);
  const btn = (label: string, title: string, onClick: () => void, cls = '') => (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={`min-w-[28px] h-7 px-1.5 rounded text-[13px] text-teton-ink hover:bg-teton-off-white ${cls}`}
      // Keep the text selection: act on mousedown without taking focus.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
        editor.current?.dispatchEvent(new Event('input', { bubbles: true }));
        force((n) => n + 1);
      }}
    >
      {label}
    </button>
  );
  return (
    <div data-edit-ui role="toolbar" aria-label="Text formatting" className="no-print absolute -top-11 left-0 z-20 flex flex-wrap items-center gap-0.5 rounded-lg border border-teton-pale-gray bg-white px-1.5 py-1 shadow-md">
      {btn('B', 'Bold', () => exec('bold'), 'font-bold')}
      {btn('I', 'Italic', () => exec('italic'), 'italic')}
      {btn('U', 'Underline', () => exec('underline'), 'underline')}
      <span className="w-px h-5 bg-teton-off-white mx-1" />
      {btn('•', 'Bulleted list', () => exec('insertUnorderedList'), 'text-base')}
      {btn('1.', 'Numbered list', () => exec('insertOrderedList'))}
      {btn('⇥', 'Indent', () => exec('indent'))}
      {btn('⇤', 'Outdent', () => exec('outdent'))}
      <span className="w-px h-5 bg-teton-off-white mx-1" />
      <select
        aria-label="Font size"
        className="h-7 rounded border border-teton-pale-gray bg-white text-[12px] px-1"
        defaultValue=""
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          if (editor.current && e.target.value) {
            editor.current.focus();
            setFontSize(editor.current, e.target.value);
            editor.current.dispatchEvent(new Event('input', { bubbles: true }));
          }
          e.target.value = '';
        }}
      >
        <option value="" disabled>
          Size
        </option>
        {SIZES.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <span className="w-px h-5 bg-teton-off-white mx-1" />
      {COLORS.map(([c, name]) => (
        <button
          key={c}
          type="button"
          title={name}
          aria-label={`Text color ${name}`}
          className="w-5 h-5 rounded-full border border-white ring-1 ring-teton-pale-gray mx-0.5"
          style={{ background: c }}
          onMouseDown={(e) => {
            e.preventDefault();
            exec('foreColor', c);
            editor.current?.dispatchEvent(new Event('input', { bubbles: true }));
          }}
        />
      ))}
    </div>
  );
}

/** Formatted body of an added section. Uncontrolled while editing so the caret never jumps. */
function RichBody({ id, html }: { id: string; html: string }) {
  const { editable, setLayout } = useProposalText();
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const initial = useRef(html);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initial.current;
  }, []);

  const className = 'proposal-rich text-[14px] leading-relaxed max-w-prose';
  if (!editable) return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <div className="relative">
      {focused && <FormatBar editor={ref} />}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Section text"
        data-placeholder="Type here…"
        className={`${className} min-h-[3rem] rounded-sm outline-none hover:bg-teton-pale-yellow/40 focus:bg-teton-pale-yellow/40 focus:ring-2 focus:ring-brand-accent/60 empty:before:content-[attr(data-placeholder)] empty:before:text-teton-light-gray print:empty:before:content-none`}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onInput={(e) => {
          const next = (e.currentTarget as HTMLDivElement).innerHTML;
          setLayout((l) => ({ ...l, custom: { ...l.custom, [id]: { ...l.custom[id], html: next } } }));
        }}
      />
    </div>
  );
}

/** Plain editable heading for an added section. */
function CustomTitle({ id, title }: { id: string; title: string }) {
  const { editable, setLayout } = useProposalText();
  if (!editable) return <>{title}</>;
  return (
    <span
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Section heading"
      data-placeholder="Section heading"
      data-custom-title={id}
      className="proposal-editable rounded-sm outline-none hover:bg-teton-pale-yellow/60 focus:bg-teton-pale-yellow/60 focus:ring-2 focus:ring-brand-accent/60 empty:inline-block empty:min-w-[8rem] empty:before:content-[attr(data-placeholder)] empty:before:text-teton-light-gray print:empty:before:content-none"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      onBlur={(e) => {
        const next = (e.currentTarget.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (next !== title) setLayout((l) => ({ ...l, custom: { ...l.custom, [id]: { ...l.custom[id], title: next } } }));
      }}
    >
      {title}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* The arranged document body.                                         */
/* ------------------------------------------------------------------ */

export interface StandardSectionContent {
  /** Body under the heading. */
  body: React.ReactNode;
  className?: string;
  /** Values for {tokens} in the section's title (e.g. the company name). */
  titleVars?: Record<string, string>;
}

/** "Add section" hover strip between sections. */
function AddZone({ at }: { at: number }) {
  const { setLayout } = useProposalText();
  return (
    // Zero height: it sits in the gap between sections and takes no room in the layout.
    <div data-edit-ui className="no-print relative h-0">
      <div className="group/add absolute inset-x-0 -top-7 h-10 flex items-center justify-center">
      <div className="absolute inset-x-0 top-1/2 h-px bg-teton-blue/50 opacity-0 group-hover/add:opacity-100 transition-opacity" />
      <button
        type="button"
        className="relative opacity-0 group-hover/add:opacity-100 focus:opacity-100 transition-opacity flex items-center gap-1 rounded-full bg-white border border-teton-blue/60 text-teton-ink text-[11px] font-medium px-2.5 py-0.5 shadow-sm"
        onClick={() => {
          const id = `custom-${Date.now().toString(36)}`;
          setLayout((l) => {
            const order = [...l.order];
            order.splice(at, 0, id);
            return { ...l, order, custom: { ...l.custom, [id]: { title: 'New section', html: '' } } };
          });
          // Put the cursor in the new heading once it renders.
          setTimeout(() => {
            const el = document.querySelector<HTMLElement>(`[data-custom-title="${id}"]`);
            if (!el) return;
            el.focus();
            const r = document.createRange();
            r.selectNodeContents(el);
            const sel = getSelection();
            sel?.removeAllRanges();
            sel?.addRange(r);
          }, 50);
        }}
      >
        <PlusIcon /> Add section
      </button>
      </div>
    </div>
  );
}

export function ProposalSections({ sections }: { sections: Partial<Record<StandardSection, StandardSectionContent>> }) {
  const { editable, layout, setLayout, edits } = useProposalText();
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  // Pointer-driven drag (native drag can't start from editable text): press a heading and move to drag;
  // a plain click still puts the cursor in the heading to type.
  const press = useRef<{ id: string; x: number; y: number } | null>(null);
  const dropRef = useRef<{ id: string; after: boolean } | null>(null);
  const draggingRef = useRef<string | null>(null);
  const moveRef = useRef<(id: string, target: string, after: boolean) => void>(() => {});

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pr = press.current;
      if (!pr) return;
      if (!draggingRef.current) {
        if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 6) return;
        draggingRef.current = pr.id;
        setDragging(pr.id);
        (document.activeElement as HTMLElement | null)?.blur();
        getSelection()?.removeAllRanges();
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
      }
      e.preventDefault();
      const els = Array.from(document.querySelectorAll<HTMLElement>('#proposal [data-section]'));
      let best: { id: string; after: boolean } | null = null;
      let bestDist = Infinity;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        const dist = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
        if (dist < bestDist) {
          bestDist = dist;
          best = { id: el.dataset.section!, after: e.clientY > r.top + r.height / 2 };
        }
      }
      dropRef.current = best;
      setDrop(best);
    };
    const onUp = () => {
      const id = draggingRef.current;
      if (id && dropRef.current) moveRef.current(id, dropRef.current.id, dropRef.current.after);
      press.current = null;
      draggingRef.current = null;
      dropRef.current = null;
      setDragging(null);
      setDrop(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const visible = layout.order.filter((id) => (isCustomId(id) ? !!layout.custom[id] : !layout.hiddenSections.includes(id) && id in sections));

  const move = (id: string, target: string, after: boolean) => {
    if (id === target) return;
    setLayout((l) => {
      const order = l.order.filter((x) => x !== id);
      const i = order.indexOf(target);
      order.splice(after ? i + 1 : i, 0, id);
      return { ...l, order };
    });
  };
  moveRef.current = move;
  const remove = (id: string) => {
    if (isCustomId(id)) {
      const c = layout.custom[id];
      if ((c?.html.replace(/<[^>]*>/g, '').trim() || (c?.title && c.title !== 'New section')) && !window.confirm('Delete this section and its text?')) return;
      setLayout((l) => {
        const custom = { ...l.custom };
        delete custom[id];
        return { ...l, order: l.order.filter((x) => x !== id), custom };
      });
    } else setLayout((l) => ({ ...l, hiddenSections: [...l.hiddenSections, id] }));
  };

  // Insert positions are indexes into the full order, so hidden sections keep their place.
  const insertAt = (k: number) => (k < visible.length ? layout.order.indexOf(visible[k]) : layout.order.length);

  return (
    <div>
      {editable && <AddZone at={insertAt(0)} />}
      {visible.map((id, k) => {
        const custom = isCustomId(id) ? layout.custom[id] : null;
        const std = custom ? null : sections[id as StandardSection];
        const title = custom ? null : SECTION_TITLES[id as StandardSection];
        const label = custom ? custom.title || 'Added section' : renderText(edits[title!.key] ?? title!.title, std?.titleVars);
        const heading = custom ? <CustomTitle id={id} title={custom.title} /> : <T k={title!.key} d={title!.title} v={std?.titleVars} />;
        const showDrop = drop?.id === id && dragging && dragging !== id;
        return (
          <div key={id}>
            <section
              data-section={id}
              className={`group/sec relative mb-8 ${std?.className ?? ''} ${dragging === id ? 'opacity-40' : ''}`}
            >
              {showDrop && <div data-edit-ui className={`no-print absolute inset-x-0 h-0.5 rounded bg-teton-blue ${drop!.after ? '-bottom-3' : '-top-3'}`} />}
              <div
                // Press and drag the heading to move the section (desktop). Disarmed while typing in it.
                data-drag-handle={editable ? id : undefined}
                onPointerDown={(e) => {
                  if (!editable || e.button !== 0 || e.pointerType === 'touch') return;
                  const t = e.target as HTMLElement;
                  if (t.closest('button')) return;
                  // Already typing in this heading: let the press select text instead.
                  const a = document.activeElement;
                  if (a && a !== document.body && e.currentTarget.contains(a) && t.closest('[contenteditable="true"]') === a) return;
                  press.current = { id, x: e.clientX, y: e.clientY };
                }}
                className={editable ? 'cursor-grab' : ''}
              >
                {editable && (
                  <div data-edit-ui className="no-print absolute -left-9 top-0.5 hidden md:flex flex-col items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                    <span className="w-6 h-6 flex items-center justify-center rounded text-teton-ui-gray hover:bg-teton-off-white" title="Drag to move this section" aria-hidden="true">
                      <GripIcon />
                    </span>
                  </div>
                )}
                {editable && (
                  <button
                    type="button"
                    data-edit-ui
                    className="no-print absolute right-0 md:-right-9 top-0.5 w-6 h-6 flex items-center justify-center rounded-full bg-teton-near-black text-white opacity-0 group-hover/sec:opacity-100 focus:opacity-100 transition-opacity shadow"
                    title={custom ? 'Delete this section' : 'Remove this section (you can add it back)'}
                    aria-label={`Remove section ${label}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => remove(id)}
                  >
                    <MinusIcon />
                  </button>
                )}
                <H2>{heading}</H2>
              </div>
              {custom ? <RichBody id={id} html={custom.html} /> : std!.body}
            </section>
            {editable && <AddZone at={insertAt(k + 1)} />}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Removed sections and figures, with Add back.                        */
/* ------------------------------------------------------------------ */

export function RemovedPanel() {
  const { editable, layout, setLayout, edits } = useProposalText();
  const { labels } = useContext(LabelsCtx);
  if (!editable) return null;
  const sections = layout.hiddenSections.filter((id): id is StandardSection => id in SECTION_TITLES);
  const values = layout.hiddenValues;
  if (!sections.length && !values.length) return null;
  const item = (key: string, label: string, onClick: () => void) => (
    <li key={key}>
      <button type="button" onClick={onClick} className="w-full flex items-start gap-2 text-left rounded-md px-2 py-1.5 text-[13px] hover:bg-teton-off-white" title="Add back to the proposal">
        <span className="mt-0.5 w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full border border-teton-pale-gray text-teton-dark-gray">
          <PlusIcon />
        </span>
        <span className="min-w-0">{label}</span>
      </button>
    </li>
  );
  return (
    <aside data-edit-ui className="no-print rounded-xl border border-teton-pale-gray bg-white p-3 shadow-sm" aria-label="Removed from this proposal">
      <p className="text-xs font-semibold uppercase tracking-wider text-teton-ui-gray px-2 mb-1">Removed</p>
      {sections.length > 0 && (
        <>
          <p className="text-[11px] text-teton-ui-gray px-2 mt-2">Sections</p>
          <ul>
            {sections.map((id) =>
              item(id, renderText(edits[SECTION_TITLES[id].key] ?? SECTION_TITLES[id].title).replace(/\{\w+\}\s*/g, ''), () => setLayout((l) => ({ ...l, hiddenSections: l.hiddenSections.filter((x) => x !== id) }))),
            )}
          </ul>
        </>
      )}
      {values.length > 0 && (
        <>
          <p className="text-[11px] text-teton-ui-gray px-2 mt-2">Figures</p>
          <ul>
            {values.map((k) => item(k, labels[k] ?? k, () => setLayout((l) => ({ ...l, hiddenValues: l.hiddenValues.filter((x) => x !== k) }))))}
          </ul>
        </>
      )}
    </aside>
  );
}
