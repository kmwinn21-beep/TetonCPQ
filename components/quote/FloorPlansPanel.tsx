'use client';

/**
 * Right panel: Floor Plans. Every community from the Communities section, whether it has a floor plan, a button
 * to open each plan in the viewer, and + Floor plan to upload one (a community without one also takes a dropped
 * file). Collapsed to start. Plans are removed from the community details panel, not here.
 */
import { useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Collapse } from '@/components/form/fields';
import type { QuoteDraft } from '@/lib/quote/draft';
import { normalizeRoomTypes } from '@/lib/quote/roomTypes';
import { count } from '@/lib/format';
import { useFloorPlans, type FloorPlanItem } from './FloorPlans';
import { useAccess } from './AccessContext';
import { panelElId, usePanelOpener } from './panelNav';

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const kind = (p: FloorPlanItem) => (p.mime === 'application/pdf' ? 'PDF' : (p.mime.split('/')[1] ?? 'IMG').toUpperCase().replace('JPEG', 'JPG').slice(0, 4));

export function FloorPlansPanel() {
  const fp = useFloorPlans();
  const acc = useAccess();
  const communities = (useWatch<QuoteDraft>({ name: 'communities' }) as QuoteDraft['communities'] | undefined) ?? [];
  const [open, setOpen] = useState(false);
  usePanelOpener('floor-plans', setOpen);
  if (!fp || !communities.length) return null;
  const canUpload = acc.inputs || acc.scope;
  const withPlan = communities.filter((c) => fp.plans.some((p) => p.communityId === c.id)).length;
  const tone = withPlan === communities.length ? 'bg-teton-pale-green text-[#256B41]' : withPlan === 0 ? 'bg-teton-red/30 text-[#9A2E1C]' : 'bg-[#FFF1DC] text-[#8A5A00]';
  // Rooms tagged on each plan (Scope Mode badges).
  const tagged = new Map<number, number>();
  for (const c of communities) for (const t of normalizeRoomTypes(c.roomTypes)) for (const m of t.marks ?? []) tagged.set(m.plan, (tagged.get(m.plan) ?? 0) + 1);
  const totalTagged = fp.plans.reduce((s, p) => s + (tagged.get(p.id) ?? 0), 0);
  return (
    <section className="card" aria-label="Floor plans" id={panelElId('floor-plans')}>
      <button type="button" className="w-full flex items-center gap-2 text-left" aria-expanded={open} aria-controls="floor-plans-panel" onClick={() => setOpen((o) => !o)}>
        <svg className={`w-4 h-4 flex-shrink-0 text-teton-ui-gray transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M7.2 4.2a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L11.92 10 7.2 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
        <h2 className="text-sm font-semibold flex-1">Floor Plans</h2>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${tone}`}>
          {withPlan} of {communities.length} {communities.length === 1 ? 'community' : 'communities'}
        </span>
      </button>
      <Collapse open={open} id="floor-plans-panel">
        <ul className="pt-2 divide-y divide-teton-off-white">
          {communities.map((c, i) => (
            <CommunityRow key={c.id} id={c.id} name={c.name || `Community ${i + 1}`} place={[c.city, c.market].filter(Boolean).join(', ')} plans={fp.plans.filter((p) => p.communityId === c.id)} tagged={tagged} canUpload={canUpload} />
          ))}
        </ul>
        {fp.plans.length > 0 && (
          <p className="mt-1 pt-2.5 border-t border-teton-off-white text-xs text-teton-ui-gray">
            {count(totalTagged)} room{totalTagged === 1 ? '' : 's'} tagged across {fp.plans.length} plan{fp.plans.length === 1 ? '' : 's'}
          </p>
        )}
      </Collapse>
    </section>
  );
}

function CommunityRow({ id, name, place, plans, tagged, canUpload }: { id: string; name: string; place: string; plans: FloorPlanItem[]; tagged: Map<number, number>; canUpload: boolean }) {
  const fp = useFloorPlans()!;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const busy = fp.uploading.filter((u) => u.communityId === id);
  const pick = () => input.current?.click();
  const addBtn = (primary: boolean) =>
    canUpload && (
      <button type="button" className={`${primary ? 'btn-primary' : 'btn-secondary'} py-1 px-2.5 text-xs whitespace-nowrap`} onClick={pick} aria-label={`Add a floor plan to ${name}`}>
        + Floor plan
      </button>
    );
  return (
    <li className="py-2.5">
      <div className="flex items-baseline gap-1.5 min-w-0">
        <b className="text-[13px] font-semibold truncate">{name}</b>
        {place && <span className="text-[11.5px] text-teton-ui-gray truncate">{place}</span>}
        <span className={`ml-auto flex-shrink-0 text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${plans.length ? 'bg-teton-pale-green text-[#256B41]' : 'bg-teton-red/30 text-[#9A2E1C]'}`}>
          {plans.length ? `${plans.length} plan${plans.length === 1 ? '' : 's'}` : 'Missing'}
        </span>
        {/* With a plan already: add another from this row (the same size as the pill). */}
        {plans.length > 0 && canUpload && (
          <button type="button" className="flex-shrink-0 self-center rounded-full border border-teton-pale-gray bg-white px-2 py-0.5 text-[10.5px] font-semibold text-teton-dark-gray hover:bg-teton-almost-white" onClick={pick} aria-label={`Add a floor plan to ${name}`}>
            + Floor plan
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept="application/pdf,image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          if (e.target.files?.length) fp.upload(id, e.target.files);
          e.target.value = '';
        }}
      />
      {plans.map((p) => {
        const n = tagged.get(p.id) ?? 0;
        return (
          <div key={p.id} className="mt-1.5 flex items-center gap-2 rounded-lg bg-teton-almost-white px-2 py-1.5 drawer-in">
            <span className={`w-7 h-8 flex-shrink-0 rounded border border-teton-off-white bg-white flex items-center justify-center text-[8px] font-extrabold ${p.mime === 'application/pdf' ? 'text-[#B23A26]' : 'text-[#1F6FB0]'}`}>{kind(p)}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium truncate" title={p.name}>{p.name}</span>
              <span className="block text-[10.5px] text-teton-ui-gray">{kb(p.size)} · {n ? `${count(n)} room${n === 1 ? '' : 's'} tagged` : 'no rooms tagged yet'}</span>
            </span>
            <button type="button" className="btn-secondary py-1 px-2.5 text-xs" onClick={() => fp.openViewer(id, { planId: p.id })} aria-label={`Open ${p.name}`}>
              Open
            </button>
          </div>
        );
      })}
      {busy.map((u) => (
        <div key={u.key} className={`mt-1.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] ${u.error ? 'bg-teton-red/30' : 'bg-teton-off-white text-teton-dark-gray'}`}>
          <span className="truncate flex-1">{u.error ? `${u.name}: ${u.error}` : `Uploading ${u.name}`}</span>
          {u.error ? (
            <button type="button" aria-label="Dismiss" className="font-bold" onClick={() => fp.dismiss(u.key)}>×</button>
          ) : (
            <span className="tabular-nums">{u.pct}%</span>
          )}
        </div>
      ))}
      {plans.length === 0 &&
        !busy.length && (
          <div
            className={`mt-1.5 flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-2 transition-colors duration-200 ${over ? 'border-[#3F8CEA] bg-[#F5F9FF]' : 'border-[#F0C2B5] bg-[#FFF8F5]'}`}
            onDragOver={(e) => {
              if (!canUpload) return;
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              if (canUpload && e.dataTransfer.files.length) fp.upload(id, e.dataTransfer.files);
            }}
          >
            <span className="flex-1 text-[11.5px] text-[#9A2E1C]">
              ⚠ No floor plan yet: needed for accurate pricing.{canUpload ? ' Drop a PDF or image here, or' : ''}
            </span>
            {addBtn(true)}
          </div>
        )}
    </li>
  );
}
