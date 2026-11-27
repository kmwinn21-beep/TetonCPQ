'use client';

/**
 * Price book → Core products (admins): what each card on the deal page adds to a deal, for each way to buy, and the
 * combinations that swap items when two core products are on the same deal. Saving makes a new version: new deals
 * use it; open deals show "Update this deal"; saved versions never change.
 */
import { useEffect, useMemo, useState } from 'react';
import { SegGroup } from '@/components/form/SegGroup';
import { Collapse } from '@/components/form/fields';
import { SwipeSheet, usePhone } from '@/components/form/SwipeSheet';
import { SwitchButton } from '@/components/quote/sections';
import { ItemIcon } from './ItemIcon';
import { BILLING_LABEL, COUNT_LABEL, SKU, billingOf } from '@/lib/pricing/catalog';
import { BUILTIN_CORES, FINISH_ROLES, OFFER_LOCKED, removedRoles, ROLE_BY_SKU, ROLES, roleOf, SIDE_LABEL, SIDES, sameLineup, type CoreProduct, type Lineup, type LineupEntry, type RoleId, type Side } from '@/lib/pricing/lineup';
import type { LineupInfo } from '@/lib/data/lineup';
import type { PriceBookRow } from '@/lib/data/priceBook';

const eb = 'text-[10px] font-extrabold uppercase tracking-[1.5px] text-[#8A919C]';
const btn = 'h-9 px-3 rounded-[10px] text-[12.5px] font-semibold whitespace-nowrap';

/** How an entry reads in the lists: its SKU, name and how it's counted. */
function useLabels(rows: PriceBookRow[]) {
  const by = useMemo(() => new Map(rows.map((r) => [r.sku, r])), [rows]);
  return (e: LineupEntry) => {
    const r = by.get(e.sku);
    const role = roleOf(e);
    return {
      code: r?.itemCode ?? e.sku,
      name: role === 'ecallInstall' ? 'E-Call installation' : r?.name ?? e.sku,
      counted: role ? ROLES[role].counted : r?.generic && r.counted ? `${COUNT_LABEL[r.counted]} · ${r.billing === 'years' ? `every ${r.everyYears ?? 1} years` : BILLING_LABEL[billingOf(r)].toLowerCase()}` : 'Priced from its price book details',
      missing: !r,
    };
  };
}

const key = (e: LineupEntry) => `${e.sku}:${roleOf(e) ?? ''}`;
const when = (s: string | null) => {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export function CoreProducts({ initial, rows, onDirty, newer, onReload }: { initial: LineupInfo; rows: PriceBookRow[]; onDirty?: (dirty: boolean) => void; newer?: number | null; onReload?: () => void }) {
  const [info, setInfo] = useState(initial);
  const [draft, setDraft] = useState<Lineup>(() => structuredClone(initial.lineup));
  const [sel, setSel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const label = useLabels(rows);
  const dirty = !sameLineup(draft, info.lineup);
  // Built-in items that would be free on deals using this line-up (in no list), compared with what's saved.
  const freeNow = useMemo(() => Array.from(removedRoles(draft)), [draft]);
  const freeSaved = useMemo(() => new Set(removedRoles(info.lineup)), [info.lineup]);

  useEffect(() => onDirty?.(dirty), [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch('/api/catalog/lineup', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lineup: draft, baseVersion: info.lineup.version }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Could not save');
      setInfo(j as LineupInfo);
      setDraft(structuredClone((j as LineupInfo).lineup));
      setNote(`Saved as version ${(j as LineupInfo).lineup.version}. New deals use it; open deals show “Update this deal”. Saved versions don’t change.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };
  const updateCore = (id: string, f: (c: CoreProduct) => CoreProduct) => setDraft((l) => ({ ...l, cores: l.cores.map((c) => (c.id === id ? f(structuredClone(c)) : c)) }));
  const rid = () => Math.random().toString(36).slice(2, 8);
  /** A core product added here: a card (or an option chip) for items priced from their details. */
  const addCore = () => {
    const id = `core-${rid()}`;
    setDraft((l) => ({ ...l, cores: [...l.cores, { id, name: 'New core product', note: '', kind: 'core', sides: { subscription: { offered: true, items: [] }, capex: { offered: true, items: [] } } }] }));
    setSel(id);
  };
  const removeCore = (id: string) => {
    setSel(null);
    setDraft((l) => ({ ...l, cores: l.cores.filter((c) => c.id !== id), combos: l.combos.filter((x) => x.builtin || !x.when.includes(id)) }));
  };
  const [combo, setCombo] = useState<null | { when: string[]; side: Side; replace: string[]; with: string[] }>(null);
  const genericRows = rows.filter((r) => r.generic);
  const current = draft.cores.find((c) => c.id === sel) ?? null;

  return (
    <div className="max-w-[1180px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-bold">Core products</h2>
          <p className="text-[12.5px] text-[#6B7380]">
            What each card on the deal page adds to a deal. {info.lineup.version ? `Version ${info.lineup.version}${info.savedBy ? `, saved by ${info.savedBy}` : ''}${info.savedAt ? ` on ${when(info.savedAt)}` : ''}.` : 'The standard line-up (not edited yet).'}
          </p>
        </div>
        {dirty && <span className="text-[12px] font-semibold text-[#9A6512]">● Unsaved changes</span>}
        <button type="button" onClick={addCore} className={`${btn} border border-[#E4E0D6] bg-white`}>
          ＋ New core product
        </button>
        <button type="button" disabled={!dirty || saving} onClick={() => (setDraft(structuredClone(info.lineup)), setErr(null))} className={`${btn} border border-[#E4E0D6] bg-white disabled:opacity-40`}>
          Discard
        </button>
        <button type="button" disabled={!dirty || saving} onClick={() => void save()} className={`${btn} bg-teton-ink text-white disabled:opacity-40`}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
      <Collapse open={!!err}>
        <p role="alert" className="mb-3 rounded-[10px] bg-[#FDF0EE] px-3 py-2 text-[12.5px] text-[#B4442C]">{err}</p>
      </Collapse>
      <Collapse open={!!newer}>
        <div role="status" className="mb-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-[#CFE2F8] bg-[#F3F8FE] px-3 py-2 text-[12.5px]">
          <span className="flex-1 min-w-[220px]">An item change saved core products version {newer}. Your unsaved changes here are on an older version: discard them to load it.</span>
          <button type="button" onClick={onReload} className="h-8 px-3 rounded-[8px] bg-teton-ink text-white text-[12px] font-semibold">Discard and load version {newer}</button>
        </div>
      </Collapse>
      <Collapse open={!!note && !dirty}>
        <p role="status" className="mb-3 rounded-[10px] bg-[#EEF8F1] px-3 py-2 text-[12.5px] text-[#1E7A4C]">✓ {note}</p>
      </Collapse>
      <Collapse open={freeNow.length > 0}>
        <div className="mb-3 rounded-[12px] border border-[#F0D58A] bg-[#FFF8E6] px-3.5 py-2.5 text-[12.5px]">
          <b>Free on deals using this line-up</b> (in no core product):
          <ul className="mt-1 space-y-0.5">
            {freeNow.map((k) => {
              const [role, sku] = k.split(':') as [RoleId, string];
              const l = label({ sku, role: role === ROLE_BY_SKU[sku] ? undefined : role });
              return (
                <li key={k} className="text-[#4E5562]">
                  <span className="font-mono text-[11px] text-[#8A919C]">{l.code}</span> {l.name} — {ROLES[role].removed}
                  {!freeSaved.has(k) && <span className="ml-1.5 rounded-[5px] bg-[#FBF0D9] px-1.5 py-px text-[10px] font-bold text-[#9A6512]">NEW</span>}
                </li>
              );
            })}
          </ul>
        </div>
      </Collapse>

      <div className="grid gap-3.5 lg:grid-cols-2">
        {draft.cores.map((c) => (
          <div key={c.id} className="rounded-[14px] border border-[#E8E4DC] bg-white overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#FBFAF7] border-b border-[#ECE8DF]">
              <b className="text-[14px] truncate">{c.name}</b>
              <span className={`${eb} ml-auto`}>{c.kind === 'option' ? 'Option' : 'Core product'}</span>
              <button type="button" onClick={() => setSel(c.id)} className="h-8 px-3 rounded-[8px] border border-[#E4E0D6] bg-white text-[12px] font-semibold hover:bg-[#FBFAF7]">
                Edit
              </button>
            </div>
            <div className="grid sm:grid-cols-2">
              {SIDES.map((s) => (
                <div key={s} className="px-4 py-2.5 sm:[&+&]:border-l border-[#F1EEE7] max-sm:[&+&]:border-t">
                  <p className={`${eb} mb-1.5`}>{SIDE_LABEL[s]}</p>
                  {!c.sides[s].offered ? (
                    <p className="py-1 text-[12px] italic text-[#9AA0A8]">Not offered (the card is greyed out on deals)</p>
                  ) : !c.sides[s].items.length ? (
                    <p className="py-1 text-[12px] italic text-[#9AA0A8]">No items</p>
                  ) : (
                    c.sides[s].items.map((e) => {
                      const l = label(e);
                      return (
                        <div key={key(e)} className="flex items-baseline gap-2 py-[3px] text-[12.5px] min-w-0">
                          <span className="font-mono text-[11px] text-[#6B7380] whitespace-nowrap">{l.code}</span>
                          <span className="truncate">{l.name}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3.5 rounded-[14px] border border-[#E8E4DC] bg-white overflow-hidden">
        <div className="flex flex-wrap items-baseline gap-x-2.5 px-4 py-2.5 bg-[#FBFAF7] border-b border-[#ECE8DF]">
          <b className="text-[14px]">Combinations</b>
          <span className="text-[12px] text-[#6B7380]">when two core products are on the same deal, swap items</span>
          <button type="button" onClick={() => setCombo(combo ? null : { when: [], side: 'subscription', replace: [], with: [] })} aria-expanded={!!combo} className="ml-auto h-8 px-3 rounded-[8px] border border-[#E4E0D6] bg-white text-[12px] font-semibold">
            ＋ Add combination
          </button>
        </div>
        <Collapse open={!!combo}>
          {combo && (
            <ComboEditor
              value={combo}
              onChange={setCombo}
              cores={draft.cores}
              lineup={draft}
              generic={genericRows}
              label={label}
              onCancel={() => setCombo(null)}
              onAdd={() => {
                setDraft((l) => ({ ...l, combos: [...l.combos, { id: `combo-${rid()}`, when: combo.when, side: combo.side, replace: combo.replace, with: combo.with.map((sku) => ({ sku })), enabled: true }] }));
                setCombo(null);
              }}
            />
          )}
        </Collapse>
        {draft.combos.map((x) => {
          const names = x.when.map((w) => draft.cores.find((c) => c.id === w)?.name ?? w).join(' + ');
          const sys = x.system === 'inovonics' ? 'Inovonics' : x.system === 'ble' ? 'Bluetooth' : null;
          const locked = x.builtin === 'capexEcallBase';
          return (
            <div key={x.id} className="grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_auto] items-center px-4 py-2.5 border-t border-[#F1EEE7] first:border-t-0 text-[12.5px]">
              <span>
                <b>{names}</b>
                <small className="block text-[11.5px] text-[#8A919C]">
                  {SIDE_LABEL[x.side]}
                  {sys ? ` · ${sys}` : ''}
                </small>
              </span>
              <span className={`text-[#4E5562] ${x.enabled || locked ? '' : 'line-through opacity-60'}`}>
                {x.replace.length ? <>Replace {x.replace.map((r) => <span key={r} className="font-mono text-[11px]">{label({ sku: r }).code} </span>)}{x.with.length ? 'with ' : ''}</> : 'Add '}
                {x.with.map((w) => (
                  <span key={w.sku}>
                    <span className="font-mono text-[11px]">{label(w).code}</span> {label(w).name}
                  </span>
                ))}
                {locked && <small className="block text-[11px] text-[#8A919C]">Beds with both buy the base package with E-Call; software stays one fee.</small>}
              </span>
              {locked ? (
                <span className="text-[11.5px] text-[#8A919C] whitespace-nowrap" title="How equipment purchase prices beds with both">🔒 Always on</span>
              ) : !x.builtin ? (
                <span className="flex items-center gap-2 text-[12px] text-[#6B7380]">
                  <SwitchButton label={`${names} combination`} on={x.enabled} onChange={(on) => setDraft((l) => ({ ...l, combos: l.combos.map((y) => (y.id === x.id ? { ...y, enabled: on } : y)) }))} />
                  <button type="button" aria-label={`Remove the ${names} combination`} onClick={() => setDraft((l) => ({ ...l, combos: l.combos.filter((y) => y.id !== x.id) }))} className="w-8 h-8 grid place-items-center rounded-[8px] text-[#A3A9B2] hover:bg-[#F6F3EE] hover:text-[#B4442C]">
                    ✕
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-2 text-[12px] text-[#6B7380]">
                  <SwitchButton label={`${names} (${sys ?? 'any'}) bundle`} on={x.enabled} onChange={(on) => setDraft((l) => ({ ...l, combos: l.combos.map((y) => (y.id === x.id ? { ...y, enabled: on } : y)) }))} />
                  {x.enabled ? 'On' : 'Off: billed separately'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <CoreDrawer core={current} rows={rows} lineup={draft} label={label} onClose={() => setSel(null)} onChange={(f) => current && updateCore(current.id, f)} onRemove={current && !BUILTIN_CORES.includes(current.id as never) ? () => removeCore(current.id) : undefined} />
    </div>
  );
}

/** Edit one core product: name, note, and per way to buy whether it's offered and which items it adds. */
function CoreDrawer({ core, rows, lineup, label, onClose, onChange, onRemove }: { core: CoreProduct | null; rows: PriceBookRow[]; lineup: Lineup; label: ReturnType<typeof useLabels>; onClose: () => void; onChange: (f: (c: CoreProduct) => CoreProduct) => void; onRemove?: () => void }) {
  const phone = usePhone('(max-width: 1023px)');
  const [side, setSide] = useState<Side>('subscription');
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  // The drawer keeps showing its core product while it slides away.
  const [shown, setShown] = useState<CoreProduct | null>(core);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (core) {
      setShown(core);
      setLeaving(false);
      return;
    }
    if (!shown) return;
    setLeaving(true);
    const t = setTimeout(() => (setShown(null), setLeaving(false)), 200);
    return () => clearTimeout(t);
  }, [core]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setAdding(false);
    setQ('');
  }, [core?.id, side]);
  // Each core product opens on the subscription tab.
  useEffect(() => {
    if (core?.id) setSide('subscription');
  }, [core?.id]);
  useEffect(() => {
    if (!core) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [core, onClose]);
  const c = core ?? shown;
  if (!c) return null;
  const items = c.sides[side].items;
  const locked = OFFER_LOCKED.has(c.id);
  // Items that can go here: built-in ones priced this way (bundles and the base package with E-Call live in
  // combinations; the old full-facility multiplier isn't an item), and items priced from their own details.
  const candidates: LineupEntry[] = [];
  const custom = !BUILTIN_CORES.includes(c.id as never);
  for (const r of rows) {
    if (r.pricingModel === 'multiplier') continue;
    if (custom && !r.generic) continue;
    const role = ROLE_BY_SKU[r.sku];
    if (role === 'bundle' || role === 'capexBaseEcall') continue;
    // The concealed finish is an installation upgrade (on the deal's implementation line), not part of a core product.
    if (role && FINISH_ROLES.includes(role)) continue;
    if (role && ROLES[role].side !== 'both' && ROLES[role].side !== side) continue;
    candidates.push({ sku: r.sku });
    if (r.sku === SKU.install && side === 'subscription') candidates.push({ sku: r.sku, role: 'ecallInstall' });
  }
  const have = new Set(items.map(key));
  const shownCandidates = candidates.filter((e) => !have.has(key(e))).filter((e) => {
    const l = label(e);
    return !q.trim() || `${l.name} ${l.code}`.toLowerCase().includes(q.trim().toLowerCase());
  });
  // Is this entry anywhere else in the line-up (so removing it here doesn't make it free)?
  const elsewhere = (e: LineupEntry) => {
    const role = roleOf(e);
    if (!role) return true;
    return lineup.cores.some((x) => SIDES.some((s) => (x.id !== c.id || s !== side) && x.sides[s].items.some((y) => key(y) === key(e) && (ROLES[role].side === 'both' || s === side))));
  };
  const setItems = (f: (xs: LineupEntry[]) => LineupEntry[]) => onChange((x) => ({ ...x, sides: { ...x.sides, [side]: { ...x.sides[side], items: f(x.sides[side].items) } } }));
  const move = (i: number, d: -1 | 1) => setItems((xs) => {
    const ys = [...xs];
    const j = i + d;
    if (j < 0 || j >= ys.length) return xs;
    [ys[i], ys[j]] = [ys[j], ys[i]];
    return ys;
  });
  const input = 'h-9 w-full rounded-[10px] border border-[#E4E0D6] px-3 text-[13px] outline-none focus:border-[#3F8CEA]';

  const body = (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className="block mb-1 text-[11.5px] font-semibold text-[#4E5562]">Name on the deal page</span>
          <input value={c.name} onChange={(e) => onChange((x) => ({ ...x, name: e.target.value }))} className={input} maxLength={60} />
        </label>
        <label className="block">
          <span className="block mb-1 text-[11.5px] font-semibold text-[#4E5562]">Note under the name</span>
          <input value={c.note} onChange={(e) => onChange((x) => ({ ...x, note: e.target.value }))} className={input} maxLength={120} />
        </label>
      </div>
      {custom && (
        <div className="flex flex-wrap items-center gap-2.5">
          <SegGroup label="Shown as" className="inline-flex rounded-[11px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white">
            {(
              [
                ['core', 'A card'],
                ['option', 'An option chip'],
              ] as const
            ).map(([v, t]) => (
              <button key={v} type="button" role="radio" aria-checked={c.kind === v} onClick={() => onChange((x) => ({ ...x, kind: v }))} className={`h-9 sm:h-8 px-3.5 rounded-[8px] text-[12.5px] transition-colors duration-200 ${c.kind === v ? 'font-semibold text-teton-ink' : 'text-[#4E5562]'}`}>
                {t}
              </button>
            ))}
          </SegGroup>
          <small className="text-[11.5px] text-[#8A919C]">Only items priced from their details can go here.</small>
        </div>
      )}
      <SegGroup label="Way to buy" className="inline-flex self-start rounded-[11px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white">
        {SIDES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={side === s} onClick={() => setSide(s)} className={`h-9 sm:h-8 px-3.5 rounded-[8px] text-[12.5px] transition-colors duration-200 ${side === s ? 'font-semibold text-teton-ink' : 'text-[#4E5562]'}`}>
            {SIDE_LABEL[s]}
          </button>
        ))}
      </SegGroup>
      <div className="flex items-center gap-2.5">
        <SwitchButton label={`Offered with ${SIDE_LABEL[side].toLowerCase()}`} on={c.sides[side].offered} disabled={locked} onChange={(on) => onChange((x) => ({ ...x, sides: { ...x.sides, [side]: { ...x.sides[side], offered: on } } }))} />
        <span className="text-[12.5px]">
          <b>Offered</b> with {side === 'capex' ? 'equipment purchase' : 'the subscription'}
          {locked && <small className="block text-[11px] text-[#8A919C]">Always offered both ways: it prices the same way on both.</small>}
          {!locked && !c.sides[side].offered && <small className="block text-[11px] text-[#8A919C]">The card is greyed out on deals sold this way.</small>}
        </span>
      </div>
      <div>
        <p className={`${eb} mb-1`}>Items added to the deal · {items.length}</p>
        {!items.length && <p className="py-2 text-[12.5px] text-[#8A919C]">No items yet.</p>}
        {items.map((e, i) => {
          const l = label(e);
          const alone = !elsewhere(e);
          return (
            <div key={key(e)} className="grid grid-cols-[auto_28px_minmax(0,1fr)_auto] gap-2.5 items-center py-2 border-b border-[#F3F0EA]">
              <span className="flex flex-col">
                <button type="button" aria-label={`Move ${l.name} up`} disabled={i === 0} onClick={() => move(i, -1)} className="w-7 h-5 text-[10px] text-[#8A919C] disabled:opacity-30 hover:text-teton-ink">▲</button>
                <button type="button" aria-label={`Move ${l.name} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)} className="w-7 h-5 text-[10px] text-[#8A919C] disabled:opacity-30 hover:text-teton-ink">▼</button>
              </span>
              <ItemIcon sku={e.sku} item={rows.find((x) => x.sku === e.sku)} size="w-[28px] h-[28px]" />
              <span className="min-w-0">
                <b className="block text-[12.5px] font-semibold">{l.name}</b>
                <small className="block text-[11px] text-[#8A919C]">
                  <span className="font-mono">{l.code}</span> · {l.counted}
                </small>
                {alone && roleOf(e) && <small className="block text-[11px] text-[#8A919C]">Only in this list: removing it makes it free on deals. {ROLES[roleOf(e)!].removed}</small>}
              </span>
              <button type="button" aria-label={`Remove ${l.name}`} onClick={() => setItems((xs) => xs.filter((y) => key(y) !== key(e)))} className="w-9 h-9 grid place-items-center rounded-[8px] text-[#A3A9B2] hover:bg-[#F6F3EE] hover:text-[#B4442C]">
                ✕
              </button>
            </div>
          );
        })}
        <button type="button" onClick={() => setAdding(!adding)} aria-expanded={adding} className="mt-2 w-full h-10 rounded-[10px] border-[1.5px] border-dashed border-[#D3D0C8] px-3 text-left text-[12.5px] text-[#4E5562] hover:bg-[#FBFAF7]">
          ＋ Add an item from the price book
        </button>
        <Collapse open={adding}>
          <div className="mt-1.5 rounded-[12px] border border-[#E4E0D6] bg-white shadow-[0_10px_24px_rgba(0,0,0,.08)] overflow-hidden">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items, SKUs…" aria-label="Search items to add" className="h-9 w-full border-b border-[#F1EEE7] px-3 text-[13px] outline-none" />
            <div className="max-h-[260px] overflow-y-auto">
              {!shownCandidates.length && <p className="px-3 py-2.5 text-[12px] text-[#8A919C]">Nothing else can go here.</p>}
              {shownCandidates.map((e) => {
                const l = label(e);
                return (
                  <button key={key(e)} type="button" onClick={() => (setItems((xs) => [...xs, e]), setQ(''))} className="w-full flex items-center gap-2.5 px-3 py-2 border-b border-[#F7F4EE] text-left text-[12.5px] hover:bg-[#F3F8FE]">
                    <ItemIcon sku={e.sku} item={rows.find((x) => x.sku === e.sku)} size="w-[24px] h-[24px]" />
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <span className="font-mono text-[11px] text-[#8A919C]">{l.code}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Collapse>
      </div>
      <p className="rounded-[10px] bg-[#F3F8FE] border border-[#CFE2F8] px-3 py-2 text-[12px] leading-relaxed text-[#4E5562]">
        Quantities come from Communities and Scope, so reps never type them. Changes apply when you save; open deals keep their copy until someone presses “Update this deal”.
      </p>
    </div>
  );

  if (phone)
    return (
      <SwipeSheet open={!!core} onClose={onClose} eyebrow={c.kind === 'option' ? 'Option' : 'Core product'} title={c.name}>
        <div className="max-h-[75dvh] overflow-y-auto pb-4">{body}</div>
      </SwipeSheet>
    );
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={`Edit ${c.name}`}>
      <div className={`absolute inset-0 bg-[#1C1F24]/20 transition-opacity duration-200 ${leaving ? 'opacity-0' : 'opacity-100'}`} onClick={onClose} />
      <div className={`absolute right-0 top-0 h-full w-[500px] max-w-full bg-white border-l border-[#ECE8DF] shadow-xl flex flex-col ${leaving ? 'drawer-out' : 'drawer-in'}`}>
        <div className="px-5 pt-4 pb-3 border-b border-[#F1EEE7] flex items-start gap-2">
          <span className="min-w-0">
            <span className={eb}>{c.kind === 'option' ? 'Option' : 'Core product'}</span>
            <b className="block text-[17px]">{c.name || 'Untitled'}</b>
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto w-8 h-8 rounded-full bg-[#F1EEE8] text-[#5A6270] grid place-items-center hover:bg-[#E9E4DB]">
            ✕
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{body}</div>
        <div className="border-t border-[#ECE8DF] px-5 py-3 flex justify-end gap-2">
          {onRemove && (
            <button type="button" onClick={onRemove} className={`${btn} mr-auto border border-[#E4E0D6] bg-white text-[#B4442C]`}>
              Remove core product
            </button>
          )}
          <button type="button" onClick={onClose} className={`${btn} bg-teton-ink text-white`}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** A combination added here: with all these core products on a deal, replace some generic items with others. */
function ComboEditor({ value, onChange, cores, lineup, generic, label, onCancel, onAdd }: { value: { when: string[]; side: Side; replace: string[]; with: string[] }; onChange: (v: { when: string[]; side: Side; replace: string[]; with: string[] }) => void; cores: CoreProduct[]; lineup: Lineup; generic: PriceBookRow[]; label: ReturnType<typeof useLabels>; onCancel: () => void; onAdd: () => void }) {
  const v = value;
  const toggle = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  // Items that can be replaced: generic items in the chosen core products' lists for this way to buy.
  const replaceable = Array.from(new Set(lineup.cores.filter((c) => v.when.includes(c.id)).flatMap((c) => c.sides[v.side].items.filter((e) => e.item).map((e) => e.sku))));
  const chip = (on: boolean) => `h-8 px-3 rounded-full text-[12px] border transition-colors duration-200 ${on ? 'border-teton-ink bg-teton-ink text-white' : 'border-[#D3D6DA] bg-white text-[#4E5562] hover:bg-[#FBFAF7]'}`;
  const ok = v.when.length >= 2 && (v.replace.length > 0 || v.with.length > 0);
  return (
    <div className="px-4 py-3 border-b border-[#ECE8DF] bg-[#FCFBF8] space-y-3 text-[12.5px]">
      <div>
        <p className={`${eb} mb-1.5`}>When all of these are on the deal (2 or more)</p>
        <div className="flex flex-wrap gap-1.5">
          {cores.map((c) => (
            <button key={c.id} type="button" aria-pressed={v.when.includes(c.id)} onClick={() => onChange({ ...v, when: toggle(v.when, c.id), replace: [] })} className={chip(v.when.includes(c.id))}>
              {c.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className={`${eb} mb-1.5`}>Sold as</p>
        <SegGroup label="Sold as" className="inline-flex rounded-[11px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white">
          {SIDES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={v.side === s} onClick={() => onChange({ ...v, side: s, replace: [] })} className={`h-9 sm:h-8 px-3.5 rounded-[8px] text-[12.5px] transition-colors duration-200 ${v.side === s ? 'font-semibold text-teton-ink' : 'text-[#4E5562]'}`}>
              {SIDE_LABEL[s]}
            </button>
          ))}
        </SegGroup>
      </div>
      <div>
        <p className={`${eb} mb-1.5`}>Take off</p>
        {replaceable.length ? (
          <div className="flex flex-wrap gap-1.5">
            {replaceable.map((sku) => (
              <button key={sku} type="button" aria-pressed={v.replace.includes(sku)} onClick={() => onChange({ ...v, replace: toggle(v.replace, sku) })} className={chip(v.replace.includes(sku))}>
                {label({ sku }).name}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-[#8A919C]">{v.when.length < 2 ? 'Pick the core products first.' : 'Those core products have no items priced from their details for this way to buy.'}</p>
        )}
      </div>
      <div>
        <p className={`${eb} mb-1.5`}>Put on instead</p>
        {generic.length ? (
          <div className="flex flex-wrap gap-1.5">
            {generic.map((r) => (
              <button key={r.sku} type="button" aria-pressed={v.with.includes(r.sku)} onClick={() => onChange({ ...v, with: toggle(v.with, r.sku) })} className={chip(v.with.includes(r.sku))}>
                {r.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-[#8A919C]">Add an item on the Items tab first (only items priced from their details can be combined).</p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={`${btn} border border-[#E4E0D6] bg-white`}>
          Cancel
        </button>
        <button type="button" disabled={!ok} onClick={onAdd} className={`${btn} bg-teton-ink text-white disabled:opacity-40`}>
          Add combination
        </button>
      </div>
    </div>
  );
}
