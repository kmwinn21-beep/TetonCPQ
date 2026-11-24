'use client';

/**
 * "Impacts": which parts of the organization a source of value benefits, as labeled pills or icon chips.
 * Editing: click one to change it (any department, a custom entry, or remove it); the dashed + adds one.
 * Custom entries take a name, one of eight colors and one of twelve icons. Edit controls never print.
 */
import { useEffect, useRef, useState } from 'react';
import { CUSTOM_ICONS, DEPARTMENTS, DEPT_KEYS, IMPACT_COLORS, impactLook, type CustomImpact, type ImpactColor, type ImpactIcon, type ImpactItem } from '@/lib/proposal/impacts';

const PATHS: Record<ImpactIcon, React.ReactNode> = {
  trend: <><path d="M4 17l5-5 3 3 7-7" /><path d="M14 8h5v5" /></>,
  dollar: <><circle cx="12" cy="12" r="8" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v1.5M12 16v1.5" /></>,
  home: <><path d="M4 11l8-6 8 6" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></>,
  building: <><rect x="5" y="4" width="14" height="16" rx="1.5" /><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 20v-4h4v4" /></>,
  cross: <path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></>,
  carer: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.6-3 2.8-5 5.5-5s4.9 2 5.5 5" /><path d="M17 11.5s-2.5-1.5-2.5-3.3a1.3 1.3 0 0 1 2.5-.6 1.3 1.3 0 0 1 2.5.6c0 1.8-2.5 3.3-2.5 3.3z" /></>,
  star: <path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z" />,
  shield: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  chart: <path d="M5 19V9M10 19V5M15 19v-7M20 19v-4" />,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  people: <><circle cx="9" cy="9" r="3" /><circle cx="16.5" cy="10" r="2.4" /><path d="M3.5 19c.6-3 2.8-5 5.5-5s4.9 2 5.5 5M15 14.2c2.3 0 4.2 1.6 4.8 4.8" /></>,
  key: <><circle cx="8" cy="12" r="3.5" /><path d="M11.5 12H20M17 12v3M20 12v2" /></>,
  leaf: <><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" /><path d="M5 19l7-7" /></>,
  bolt: <path d="M13 3L5 13h6l-1 8 8-10h-6z" />,
  phone: <><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 17.5h2" /></>,
  pill: <><rect x="3.5" y="9" width="17" height="6" rx="3" transform="rotate(-35 12 12)" /><path d="M10 8.5l5 7" /></>,
  flag: <path d="M6 21V4M6 4h11l-2 4 2 4H6" />,
};

export function ImpactIconSvg({ icon }: { icon: ImpactIcon }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[icon]}
    </svg>
  );
}

/** One entry, as a labeled pill or an icon chip. */
export function ImpactMark({ item, chip, selected }: { item: ImpactItem; chip: boolean; selected?: boolean }) {
  const l = impactLook(item);
  return chip ? (
    <span className={`bc-imp-chip ${selected ? 'bc-imp-sel' : ''}`} style={{ color: l.ink, background: l.tint }} title={l.name}>
      <ImpactIconSvg icon={l.icon} />
      <span className="sr-only">{l.name}</span>
    </span>
  ) : (
    <span className={`bc-imp-pill ${selected ? 'bc-imp-sel' : ''}`} style={{ color: l.ink, background: l.tint }}>
      <ImpactIconSvg icon={l.icon} />
      {l.name}
    </span>
  );
}

/** The key for chips: every entry the table uses, once. */
export function ImpactLegend({ items }: { items: ImpactItem[] }) {
  const seen = new Map<string, ImpactItem>();
  for (const it of items) seen.set(impactLook(it).key, it);
  if (!seen.size) return null;
  return (
    <div className="bc-imp-legend">
      {Array.from(seen.values()).map((it) => {
        const l = impactLook(it);
        return (
          <span key={l.key}>
            <span className="bc-imp-chip bc-imp-xs" style={{ color: l.ink, background: l.tint }}><ImpactIconSvg icon={l.icon} /></span>
            {l.name}
          </span>
        );
      })}
    </div>
  );
}

type Open = { at: number | 'add'; custom: boolean } | null;

/** A row's impacts; editable when `onChange` is given. */
export function ImpactsCell({ items, chip, onChange }: { items: ImpactItem[]; chip: boolean; onChange?: (next: ImpactItem[]) => void }) {
  const [open, setOpen] = useState<Open>(null);
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(null);
      setClosing(false);
    }, 140);
  };
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  if (!onChange) {
    return (
      <div className={chip ? 'bc-imp-chips' : 'bc-imp-pills'}>
        {items.map((it, i) => <ImpactMark key={i} item={it} chip={chip} />)}
      </div>
    );
  }
  const put = (it: ImpactItem) => {
    if (!open) return;
    const next = [...items];
    if (open.at === 'add') next.push(it);
    else next[open.at] = it;
    onChange(next);
    close();
  };
  const remove = () => {
    if (open && open.at !== 'add') onChange(items.filter((_, i) => i !== open.at));
    close();
  };
  const current = open && open.at !== 'add' ? items[open.at] : undefined;

  return (
    <div ref={ref} className={`relative ${chip ? 'bc-imp-chips' : 'bc-imp-pills'}`}>
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          className="bc-imp-btn"
          aria-haspopup="menu"
          aria-expanded={open?.at === i}
          aria-label={`Change ${impactLook(it).name}`}
          onClick={() => (open?.at === i ? close() : setOpen({ at: i, custom: false }))}
        >
          <ImpactMark item={it} chip={chip} selected={open?.at === i} />
        </button>
      ))}
      <button
        type="button"
        data-edit-ui
        className={`no-print bc-imp-add ${chip ? 'bc-imp-add-c' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open?.at === 'add'}
        aria-label="Add an impact"
        onClick={() => (open?.at === 'add' ? close() : setOpen({ at: 'add', custom: false }))}
      >
        {chip ? '+' : '+ Add'}
      </button>
      {open && (
        <div data-edit-ui className={`no-print bc-imp-pop ${closing ? 'bc-imp-pop-out' : ''}`} role="menu">
          {open.custom ? (
            <CustomEditor
              initial={current && typeof current !== 'string' ? current : undefined}
              adding={open.at === 'add'}
              onBack={() => setOpen({ ...open, custom: false })}
              onSave={put}
            />
          ) : (
            <>
              <p className="bc-imp-mh">{open.at === 'add' ? 'Add' : 'Change to'}</p>
              {DEPT_KEYS.map((k) => {
                const l = impactLook(k);
                const on = current === k;
                return (
                  <button key={k} type="button" role="menuitem" className={`bc-imp-mi ${on ? 'bc-imp-on' : ''}`} onClick={() => put(k)}>
                    <span className="bc-imp-chip bc-imp-xs" style={{ color: l.ink, background: l.tint }}><ImpactIconSvg icon={l.icon} /></span>
                    <span className="flex-1">{DEPARTMENTS[k].name}</span>
                    {on && <span className="bc-imp-tick">✓</span>}
                  </button>
                );
              })}
              <div className="bc-imp-sep" />
              <button type="button" role="menuitem" className="bc-imp-mi" onClick={() => setOpen({ ...open, custom: true })}>
                <span className="bc-imp-chip bc-imp-xs bc-imp-dash">+</span>
                <span className="flex-1">{current && typeof current !== 'string' ? 'Edit custom…' : 'Custom…'}</span>
              </button>
              {open.at !== 'add' && (
                <button type="button" role="menuitem" className="bc-imp-mi bc-imp-rm" onClick={remove}>
                  <span className="bc-imp-chip bc-imp-xs bc-imp-x">×</span>
                  <span className="flex-1">Remove</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CustomEditor({ initial, adding, onBack, onSave }: { initial?: CustomImpact; adding: boolean; onBack: () => void; onSave: (c: CustomImpact) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState<ImpactColor>(initial?.color ?? 'teal');
  const [icon, setIcon] = useState<ImpactIcon>(initial?.icon ?? 'star');
  const ok = name.trim().length > 0;
  const item: CustomImpact = { name: name.trim() || 'Custom', color, icon };
  const [ink, tint] = IMPACT_COLORS[color];
  return (
    <form
      className="bc-imp-cust"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSave({ ...item, name: name.trim().slice(0, 30) });
      }}
    >
      <button type="button" className="bc-imp-mh bc-imp-back" onClick={onBack}>‹ Custom</button>
      <label className="bc-imp-lbl">
        Name
        <input autoFocus className="bc-imp-inp" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing" />
      </label>
      <p className="bc-imp-lbl">Color</p>
      <div className="bc-imp-sws" role="radiogroup" aria-label="Color">
        {(Object.keys(IMPACT_COLORS) as ImpactColor[]).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={c} className={`bc-imp-sw ${c === color ? 'bc-imp-on' : ''}`} style={{ background: IMPACT_COLORS[c][0] }} onClick={() => setColor(c)} />
        ))}
      </div>
      <p className="bc-imp-lbl">Icon</p>
      <div className="bc-imp-igs" role="radiogroup" aria-label="Icon">
        {CUSTOM_ICONS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={k === icon} aria-label={k} className={`bc-imp-ig ${k === icon ? 'bc-imp-on' : ''}`} style={k === icon ? { color: ink, background: tint } : undefined} onClick={() => setIcon(k)}>
            <ImpactIconSvg icon={k} />
          </button>
        ))}
      </div>
      <div className="bc-imp-prev">
        <span>Preview</span>
        <ImpactMark item={item} chip={false} />
        <ImpactMark item={item} chip />
      </div>
      <div className="bc-imp-btns">
        <button type="button" className="bc-imp-b2" onClick={onBack}>Cancel</button>
        <button type="submit" className="bc-imp-b1" disabled={!ok}>{adding ? 'Add' : 'Save'}</button>
      </div>
    </form>
  );
}
