'use client';

import { useMemo, useState } from 'react';
import { PackSvg } from '@/components/resources/CardIcon';
import { Collapse } from '@/components/form/fields';
import { placeFor } from '@/lib/pricing/markets';
import { PACK, PACK_GROUPS, TINTS, packIcon } from '@/lib/resources/iconPack';

export interface IconItem {
  sku: string;
  category?: string | null;
  sub?: string | null;
  icon?: string | null;
  iconTint?: string | null;
}

/** The icon an item gets without a pick: from its catalog place. */
export const autoItemIcon = (item: IconItem) => {
  const p = placeFor(item);
  return { icon: p.icon, tint: p.tint };
};

/** A price book item's icon: the one picked for it, else its catalog place's (from the card icon pack). */
export function ItemIcon({ sku, item, size = 'w-[34px] h-[34px]' }: { sku: string; item?: IconItem | null; size?: string }) {
  const it = item ?? { sku };
  const auto = autoItemIcon(it);
  const icon = packIcon(it.icon ?? auto.icon) ?? packIcon('document')!;
  const t = TINTS[it.iconTint ?? (it.icon ? 'stone' : auto.tint)] ?? TINTS.stone;
  return (
    <span className={`${size} rounded-[9px] grid place-items-center flex-shrink-0`} style={{ background: t.bg, color: t.fg }} aria-hidden="true">
      <PackSvg icon={icon} className="w-[52%] h-[52%]" />
    </span>
  );
}

/**
 * Pick an item's icon from the icon library: a tint, then an icon (search or browse by group), or Automatic (the
 * icon its category gives). `value.icon` null means Automatic.
 */
export function ItemIconPicker({ item, value, onChange, disabled, defaultOpen = false }: { item: IconItem; value: { icon: string | null; tint: string | null }; onChange: (v: { icon: string | null; tint: string | null }) => void; disabled?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('All');
  const auto = autoItemIcon(item);
  const tint = value.tint ?? (value.icon ? 'stone' : auto.tint);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return PACK.filter((i) => (s ? i.name.toLowerCase().includes(s) || i.group.toLowerCase().includes(s) : group === 'All' || i.group === group));
  }, [q, group]);
  const shown = { ...item, icon: value.icon, iconTint: value.tint };
  const what = value.icon ? `${packIcon(value.icon)?.name ?? 'Icon'} · ${TINTS[tint]?.name ?? ''}` : `Automatic · ${packIcon(auto.icon)?.name ?? 'by category'}`;
  const chip = (on: boolean) => `h-7 px-2.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap transition-colors duration-150 ${on ? 'bg-teton-ink text-white' : 'bg-[#F1EEE8] text-[#4E5562] hover:bg-[#E9E4DB]'}`;

  return (
    <div>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-3 rounded-[10px] border border-[#E4E0D6] bg-white px-2.5 py-2 text-left hover:bg-[#FBFAF7] disabled:opacity-50">
        <ItemIcon sku={item.sku} item={shown} size="w-9 h-9" />
        <span className="min-w-0 flex-1">
          <b className="block text-[12.5px] font-semibold">Icon</b>
          <small className="block text-[11.5px] text-[#8A919C] truncate">{what}</small>
        </span>
        <span className={`text-[#8A919C] text-[11px] transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>
      <Collapse open={open}>
        <div className="mt-2 rounded-[12px] border border-[#ECE8DF] bg-[#FCFBF8] p-2.5">
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Tint">
            {Object.entries(TINTS).map(([id, t]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={tint === id && !!value.icon}
                aria-label={t.name}
                title={t.name}
                disabled={disabled}
                onClick={() => onChange({ icon: value.icon ?? auto.icon, tint: id })}
                className={`w-7 h-7 rounded-full border transition-shadow duration-150 ${tint === id && value.icon ? 'ring-2 ring-[#3F8CEA] ring-offset-1' : ''}`}
                style={{ background: t.bg, borderColor: t.fg + '33' }}
              />
            ))}
            <button type="button" disabled={disabled || !value.icon} onClick={() => onChange({ icon: null, tint: null })} className="ml-auto h-7 px-2.5 rounded-full text-[11.5px] font-semibold text-[#3F4753] hover:bg-[#F1EEE8] disabled:opacity-40">
              Use automatic
            </button>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search icons…" aria-label="Search icons" className="mt-2.5 w-full h-8 rounded-[9px] border border-[#E3DFD8] bg-white px-2.5 text-[12.5px] outline-none focus:border-[#3F8CEA]" />
          {!q.trim() && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
              {['All', ...PACK_GROUPS].map((g) => (
                <button key={g} type="button" onClick={() => setGroup(g)} className={chip(group === g)}>
                  {g}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 grid grid-cols-6 sm:grid-cols-7 gap-1.5 max-h-[220px] overflow-y-auto p-0.5" role="radiogroup" aria-label="Icons">
            {list.map((i) => {
              const on = value.icon === i.id;
              const t = TINTS[tint] ?? TINTS.stone;
              return (
                <button
                  key={i.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={i.name}
                  title={i.name}
                  disabled={disabled}
                  onClick={() => onChange({ icon: i.id, tint })}
                  className={`aspect-square rounded-[9px] grid place-items-center transition-shadow duration-150 ${on ? 'ring-2 ring-[#3F8CEA]' : 'hover:ring-1 hover:ring-[#D9D4CA]'}`}
                  style={{ background: t.bg, color: t.fg }}
                >
                  <PackSvg icon={i} className="w-[55%] h-[55%]" />
                </button>
              );
            })}
            {!list.length && <p className="col-span-full py-3 text-center text-[12px] text-[#8A919C]">No icons match.</p>}
          </div>
        </div>
      </Collapse>
    </div>
  );
}
