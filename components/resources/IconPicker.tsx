'use client';

/**
 * A card's icon, in its Settings: previews of the card in both styles (standard and Novelty Mode), and a picker to
 * choose from the icon pack (with a tile tint) or one of your saved images (upload new ones; they're kept for any deal).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SegGroup } from '@/components/form/SegGroup';
import { Collapse } from '@/components/form/fields';
import type { CardIconChoice, Resource } from '@/lib/resources/model';
import { PACK, PACK_GROUPS, TINTS, packIcon } from '@/lib/resources/iconPack';
import { cardImageUrl } from '@/lib/resources/cardImageUrl';
import { PackSvg, autoIcon, cardLook, defaultTint } from './CardIcon';
import { iconOf } from '@/components/share/ProspectNovelty';

interface Saved {
  key: string;
  name: string;
  url: string;
}

/** Shrink a picked image (longest side 256 px), keeping transparency. SVGs are drawn to a bitmap. */
async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error('Couldn’t read that image'));
      i.src = url;
    });
    const w0 = img.naturalWidth || 256;
    const h0 = img.naturalHeight || 256;
    const k = Math.min(1, 256 / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * k));
    c.height = Math.max(1, Math.round(h0 * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const as = (type: string) => new Promise<Blob | null>((ok) => c.toBlob(ok, type, 0.9));
    const webp = await as('image/webp');
    const out = webp && webp.type === 'image/webp' ? webp : await as('image/png');
    if (!out) throw new Error('Couldn’t read that image');
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function IconPicker({ r, edit, onChange }: { r: Resource; edit: boolean; onChange: (icon: CardIconChoice | null) => void }) {
  const choice = r.icon;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'pack' | 'upload'>(choice && 'image' in choice ? 'upload' : 'pack');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('All');
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drop, setDrop] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || saved) return;
    fetch('/api/me/card-images')
      .then((x) => x.json())
      .then((j: { images?: Saved[] }) => setSaved(j.images ?? []))
      .catch(() => setSaved([]));
  }, [open, saved]);

  const tint = choice && 'pack' in choice ? choice.tint : autoIcon(r).tint;
  const curPack = choice && 'pack' in choice ? choice.pack : null;
  const fit = choice && 'image' in choice ? choice.fit : 'fill';
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    // Searching looks across every group.
    return PACK.filter((i) => (s ? i.name.toLowerCase().includes(s) || i.group.toLowerCase().includes(s) : group === 'All' || i.group === group));
  }, [q, group]);

  const what = !choice ? `Automatic · ${packIcon(autoIcon(r).id)?.name ?? 'by type'}` : 'pack' in choice ? `${packIcon(choice.pack)?.name ?? 'Icon'} · ${TINTS[choice.tint]?.name ?? ''}` : saved?.find((s) => s.key === choice.image)?.name ?? 'Your image';

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    if (!f.type.startsWith('image/')) return setErr('Choose an image (PNG, JPG, SVG or WebP)');
    if (f.size > 8 * 1024 * 1024) return setErr('That image is over 8 MB');
    setBusy(true);
    try {
      const blob = await shrink(f);
      const res = await fetch(`/api/me/card-images?name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
      const j = (await res.json()) as { image?: Saved; error?: string };
      if (!res.ok || !j.image) throw new Error(j.error ?? 'Couldn’t save that image');
      setSaved((s) => [j.image!, ...(s ?? [])]);
      onChange({ image: j.image.key, fit });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Couldn’t save that image');
    } finally {
      setBusy(false);
    }
  };
  const forget = async (s: Saved) => {
    if (!window.confirm(`Remove “${s.name}” from your saved images? Cards already using it keep it.`)) return;
    await fetch(`/api/me/card-images?key=${s.key}`, { method: 'DELETE' }).catch(() => {});
    setSaved((x) => (x ?? []).filter((y) => y.key !== s.key));
  };

  const pill = (on: boolean) => `relative z-[1] h-8 px-3.5 rounded-[8px] text-[12.5px] font-semibold transition-colors duration-200 ${on ? 'text-teton-ink' : 'text-teton-ui-gray'}`;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold">Card icon</span>
        <span className="text-[11.5px] text-teton-ui-gray truncate">{what}</span>
      </div>
      <Previews r={r} />
      {edit && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="h-9 px-3.5 rounded-[10px] border border-[#D5D9DE] bg-white text-[13px] font-semibold inline-flex items-center gap-2 hover:border-[#B9BFC7]">
            <span className={`text-[9px] text-[#8A919C] transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} aria-hidden="true">
              ▶
            </span>
            Change icon
          </button>
          {choice && (
            <button type="button" onClick={() => onChange(null)} className="h-9 px-3.5 rounded-[10px] text-[13px] font-semibold text-[#1F5FB5] hover:bg-[#F3F7FD]">
              Reset to automatic
            </button>
          )}
        </div>
      )}
      <Collapse open={open && edit}>
        <div className="mt-2.5 rounded-[13px] border border-[#E3DFD8] bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegGroup className="relative inline-flex rounded-[10px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white shadow-sm rounded-[8px]" label="Icon pack or your image">
              <button type="button" role="radio" aria-checked={tab === 'pack'} onClick={() => setTab('pack')} className={pill(tab === 'pack')}>
                Icon pack
              </button>
              <button type="button" role="radio" aria-checked={tab === 'upload'} onClick={() => setTab('upload')} className={pill(tab === 'upload')}>
                Upload image
              </button>
            </SegGroup>
            {tab === 'pack' && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search icons…" aria-label="Search icons" className="h-9 w-full sm:w-[190px] rounded-[10px] border border-[#D5D9DE] px-3 text-[13px] outline-none focus:border-[#3F8CEA] focus:ring-[3px] focus:ring-[#3F8CEA]/15" />}
          </div>

          {tab === 'pack' ? (
            <div key="pack" className="[animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]">
              <div className="-mx-1 mt-2.5 overflow-x-auto no-scrollbar">
                <SegGroup className="relative inline-flex gap-1 px-1 py-0.5" thumbClass="bg-teton-ink rounded-full" label="Icon group">
                  {['All', ...PACK_GROUPS].map((g) => (
                    <button key={g} type="button" role="radio" aria-checked={group === g} onClick={() => setGroup(g)} className={`relative z-[1] h-7 px-3 rounded-full whitespace-nowrap text-[11.5px] font-semibold transition-colors duration-200 ${group === g ? 'text-white' : 'text-[#5A6270] bg-[#F4F1EB] hover:bg-[#ECE8E0]'}`}>
                      {g}
                    </button>
                  ))}
                </SegGroup>
              </div>
              <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(42px,1fr))] sm:grid-cols-[repeat(auto-fill,46px)] gap-1.5 max-h-[212px] overflow-y-auto overscroll-contain p-0.5" role="radiogroup" aria-label="Icons">
                {list.map((i) => {
                  const on = curPack === i.id;
                  const t = TINTS[on ? tint : choice && 'pack' in choice ? tint : defaultTint(i.id)] ?? TINTS.sand;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={i.name}
                      title={i.name}
                      onClick={() => onChange({ pack: i.id, tint: choice && 'pack' in choice ? choice.tint : defaultTint(i.id) })}
                      className={`aspect-square rounded-[9px] grid place-items-center transition-shadow duration-150 ${on ? 'shadow-[0_0_0_2px_#fff,0_0_0_4px_#1C2430]' : 'hover:shadow-[0_0_0_1.5px_#C9CDD3]'}`}
                      style={{ background: t.bg, color: t.fg }}
                    >
                      <PackSvg icon={i} className="w-[46%] h-[46%]" />
                    </button>
                  );
                })}
                {!list.length && <p className="col-span-full py-4 text-center text-[12px] text-teton-ui-gray">No icons match “{q}”</p>}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                <span className="text-[11.5px] text-teton-ui-gray">Tile (standard cards)</span>
                <div className="flex gap-2" role="radiogroup" aria-label="Tile colour">
                  {Object.entries(TINTS).map(([id, t]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={tint === id}
                      aria-label={t.name}
                      title={t.name}
                      disabled={!curPack}
                      onClick={() => curPack && onChange({ pack: curPack, tint: id })}
                      className={`w-6 h-6 rounded-[7px] border border-black/5 transition-shadow duration-150 disabled:opacity-40 ${tint === id && curPack ? 'shadow-[0_0_0_2px_#fff,0_0_0_4px_#1C2430]' : ''}`}
                      style={{ background: t.bg }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div key="upload" className="[animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]">
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <b className="text-[12.5px]">Your saved images</b>
                <span className="text-[11px] text-teton-ui-gray">Use them on any deal</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2.5" role="radiogroup" aria-label="Saved images">
                {saved === null && <span className="text-[12px] text-teton-ui-gray">Loading…</span>}
                {saved?.map((s) => {
                  const on = choice && 'image' in choice && choice.image === s.key;
                  return (
                    <div key={s.key} className="group relative w-[68px] flex flex-col items-center gap-1">
                      <button type="button" role="radio" aria-checked={!!on} aria-label={s.name} onClick={() => onChange({ image: s.key, fit })} className={`w-[46px] h-[46px] rounded-[11px] overflow-hidden bg-white transition-shadow duration-150 ${on ? 'shadow-[0_0_0_2px_#fff,0_0_0_4px_#1C2430]' : 'shadow-[0_0_0_1px_#E3DFD8] hover:shadow-[0_0_0_1.5px_#B9BFC7]'}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.url} alt="" className="w-full h-full object-cover" />
                      </button>
                      <span className="w-full truncate text-center text-[10.5px] text-[#5A6270]" title={s.name}>
                        {s.name}
                      </span>
                      <button type="button" onClick={() => forget(s)} aria-label={`Remove ${s.name} from saved images`} className="absolute -top-1.5 right-1 w-5 h-5 rounded-full bg-white text-[11px] text-[#6B7380] shadow-[0_1px_3px_rgba(0,0,0,.2)] grid place-items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150 hover:text-[#C2412D]">
                        ✕
                      </button>
                    </div>
                  );
                })}
                {choice && 'image' in choice && saved && !saved.some((s) => s.key === choice.image) && (
                  <div className="w-[68px] flex flex-col items-center gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cardImageUrl(choice.image)} alt="" className="w-[46px] h-[46px] rounded-[11px] object-cover shadow-[0_0_0_2px_#fff,0_0_0_4px_#1C2430]" />
                    <span className="text-[10.5px] text-[#5A6270]">On this card</span>
                  </div>
                )}
              </div>
              <label
                onDragOver={(e) => (e.preventDefault(), setDrop(true))}
                onDragLeave={() => setDrop(false)}
                onDrop={(e) => (e.preventDefault(), setDrop(false), upload(e.dataTransfer.files[0]))}
                className={`mt-3 block cursor-pointer rounded-[12px] border-[1.5px] border-dashed px-3 py-3.5 text-center text-[12.5px] text-[#6B7380] transition-colors duration-150 ${drop ? 'border-[#3F8CEA] bg-[#F3F7FD]' : 'border-[#CFC9BE] bg-[#FBF8F3] hover:border-[#B9B2A6]'}`}
              >
                <b className="text-teton-ink">{busy ? 'Saving…' : 'Drop an image or choose a file'}</b>
                <span className="block text-[11.5px]">PNG, JPG, SVG or WebP · square works best · saved to your images</span>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" className="sr-only" disabled={busy} onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ''))} />
              </label>
              {err && <p className="mt-2 text-[12px] text-[#C2412D]">{err}</p>}
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[12.5px]">
                  Fit
                  <small className="block text-[11px] text-teton-ui-gray">Logos with a clear background look best inside</small>
                </span>
                <SegGroup className="relative inline-flex rounded-[10px] bg-[#F1EEE8] p-[3px] gap-0.5 flex-shrink-0" thumbClass="bg-white shadow-sm rounded-[8px]" label="Image fit">
                  {(['fill', 'fit'] as const).map((f) => (
                    <button key={f} type="button" role="radio" aria-checked={fit === f} disabled={!(choice && 'image' in choice)} onClick={() => choice && 'image' in choice && onChange({ image: choice.image, fit: f })} className={`${pill(fit === f)} disabled:opacity-50`}>
                      {f === 'fill' ? 'Fill' : 'Fit inside'}
                    </button>
                  ))}
                </SegGroup>
              </div>
            </div>
          )}
        </div>
      </Collapse>
    </div>
  );
}

/** The card as the prospect sees it, in both styles. */
function Previews({ r }: { r: Resource }) {
  const look = cardLook(r);
  return (
    <div className="mt-2 flex flex-wrap items-start gap-3 rounded-[12px] border border-[#ECE8DF] bg-[#F6F3EE] p-3">
      <div className="min-w-0 flex-1 basis-[220px]">
        <p className="mb-1.5 text-[9.5px] font-extrabold uppercase tracking-[1.4px] text-[#8A919C]">Standard</p>
        <div className="flex gap-[11px] items-start rounded-[13px] border border-[#E8E4DC] bg-white px-3 py-[11px]">
          <span className="w-[38px] h-[38px] rounded-[10px] grid place-items-center flex-shrink-0 overflow-hidden transition-colors duration-200" style={{ background: look.bg, color: look.fg }}>
            {look.node}
          </span>
          <span className="min-w-0">
            <b className="block text-[13px] leading-snug break-words">{r.title}</b>
            {r.description && <small className="block text-[11.5px] leading-snug text-[#6B7380] mt-0.5 line-clamp-2">{r.description}</small>}
          </span>
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[9.5px] font-extrabold uppercase tracking-[1.4px] text-[#8A919C]">Novelty</p>
        <div className="w-[78px] h-[136px] rounded-[18px] grid place-items-center bg-gradient-to-b from-white to-[#EFEFF2] shadow-[0_0_0_2px_#E4E4E7]">{iconOf(r)}</div>
      </div>
    </div>
  );
}
