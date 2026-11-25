'use client';

/**
 * Your profile: photo, title, phone, scheduling link, LinkedIn, a short bio, and how they show on shared links — with a
 * live preview of how prospects see you (as the main contact, on someone else's deal, and in emails).
 */
import { useRef, useState } from 'react';
import type { Profile } from '@/lib/data/profiles';
import { PersonPhoto } from '@/components/resources/Person';

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative w-[38px] h-[22px] flex-shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none ${on ? 'bg-[#3F8CEA]' : 'bg-[#D5D9DE]'}`}>
      <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none ${on ? 'translate-x-4' : ''}`} />
    </button>
  );
}

/** Center-crop and shrink a picked image to a 480 px square JPEG. */
async function squareJpeg(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const s = Math.min(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = c.height = 480;
  c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 480, 480);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that image'))), 'image/jpeg', 0.86));
}

export function ProfileForm({ initial }: { initial: Profile }) {
  const [p, setP] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));
  const changed = JSON.stringify({ ...p, photoUrl: null }) !== JSON.stringify({ ...saved, photoUrl: null });
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch('/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) });
    const j = (await r.json().catch(() => ({}))) as { profile?: Profile; error?: string };
    setBusy(false);
    if (!r.ok || !j.profile) return setError(j.error ?? 'Couldn’t save. Try again.');
    setP(j.profile);
    setSaved(j.profile);
    setNotice('Profile saved');
    setTimeout(() => setNotice(null), 2500);
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setPhotoBusy(true);
    setError(null);
    try {
      const blob = await squareJpeg(f);
      const r = await fetch('/api/profile/photo', { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: blob });
      const j = (await r.json()) as { profile?: Profile; error?: string };
      if (!r.ok || !j.profile) throw new Error(j.error ?? 'Couldn’t upload the photo');
      set({ photoUrl: j.profile.photoUrl });
      setSaved((s) => ({ ...s, photoUrl: j.profile!.photoUrl }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t upload the photo');
    }
    setPhotoBusy(false);
  };
  const removePhoto = async () => {
    setPhotoBusy(true);
    const r = await fetch('/api/profile/photo', { method: 'DELETE' });
    if (r.ok) set({ photoUrl: null });
    setPhotoBusy(false);
  };
  const card = 'rounded-2xl border border-[#E6E8EB] bg-white px-5 py-4';
  const h = 'mb-3 text-[10.5px] font-extrabold uppercase tracking-[1.6px] text-teton-ui-gray';
  const lbl = 'mb-1.5 block text-[12px] font-semibold';
  const field = 'w-full h-10 rounded-[10px] border border-[#D5D9DE] px-3 text-[13px] outline-none focus:border-[#3F8CEA] focus:ring-[3px] focus:ring-[#3F8CEA]/15';
  const hint = 'mt-1 block text-[11.5px] text-teton-ui-gray';
  const opt = <span className="font-normal text-teton-ui-gray">(optional)</span>;
  const phone = p.showPhone ? p.phone : null;
  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1 className="text-2xl font-bold">Your profile</h1>
      <p className="mt-1 text-[13.5px] text-teton-ui-gray">What prospects see on a shared link’s Resources tab and in the emails you send. Teammates see it when you’re added to their deals.</p>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] items-start">
        <div className="space-y-4 min-w-0">
          <section className={card}>
            <p className={h}>Photo</p>
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
              <PersonPhoto name={p.name} photoUrl={p.photoUrl} size={104} />
              <div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="h-9 px-3.5 rounded-[10px] bg-teton-ink text-white text-[13px] font-semibold disabled:opacity-50" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
                    {photoBusy ? 'Uploading…' : p.photoUrl ? 'Change photo' : 'Upload a photo'}
                  </button>
                  {p.photoUrl && (
                    <button type="button" className="h-9 px-3.5 rounded-[10px] border border-[#D5D9DE] text-[13px] font-semibold" disabled={photoBusy} onClick={() => void removePhoto()}>
                      Remove
                    </button>
                  )}
                </div>
                <p className={hint}>A clear, friendly headshot works best. It’s cropped to a square from the middle.</p>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
              </div>
            </div>
          </section>
          <section className={card}>
            <p className={h}>About you</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label>
                <span className={lbl}>Name</span>
                <input className={`${field} bg-[#F6F7F9] text-teton-ui-gray`} value={p.name} readOnly />
                <span className={hint}>An admin can change it under Users.</span>
              </label>
              <label>
                <span className={lbl}>Title</span>
                <input className={field} value={p.title ?? ''} maxLength={120} onChange={(e) => set({ title: e.target.value })} placeholder="Senior Account Executive" />
              </label>
              <label>
                <span className={lbl}>Email</span>
                <input className={`${field} bg-[#F6F7F9] text-teton-ui-gray`} value={p.email} readOnly />
                <span className={hint}>Your sign-in email; replies to your emails come here.</span>
              </label>
              <label>
                <span className={lbl}>Phone</span>
                <input className={field} value={p.phone ?? ''} maxLength={40} inputMode="tel" onChange={(e) => set({ phone: e.target.value })} placeholder="(502) 555-0142" />
              </label>
            </div>
            <label className="mt-3 block">
              <span className={lbl}>Scheduling link {opt}</span>
              <input className={field} value={p.schedulingUrl ?? ''} onChange={(e) => set({ schedulingUrl: e.target.value })} placeholder="https://calendly.com/you/30min" />
              <span className={hint}>Calendly, HubSpot Meetings, Google or Outlook booking pages. Powers “Book a meeting”.</span>
            </label>
            <label className="mt-3 block">
              <span className={lbl}>LinkedIn {opt}</span>
              <input className={field} value={p.linkedin ?? ''} onChange={(e) => set({ linkedin: e.target.value })} placeholder="linkedin.com/in/you" />
            </label>
            <label className="mt-3 block">
              <span className={lbl}>Short bio {opt}</span>
              <textarea className={`${field} h-auto min-h-[70px] py-2 resize-y`} maxLength={600} value={p.bio ?? ''} onChange={(e) => set({ bio: e.target.value })} placeholder="A line or two about you" />
            </label>
          </section>
          <section className={card}>
            <p className={h}>On shared links</p>
            {(
              [
                ['showPhone', 'Show my phone number to prospects', null],
                ['bookDefault', 'Show “Book a meeting” by default', 'Needs a scheduling link'],
                ['emailOnOpen', 'Email me when a prospect opens a resource', 'The first time each person opens each one'],
              ] as const
            ).map(([k, t, sub], i) => (
              <div key={k} className={`flex items-center justify-between gap-3 py-2.5 text-[13px] ${i ? 'border-t border-[#F1EEE7]' : ''}`}>
                <span>
                  {t}
                  {sub && <small className="block text-[11.5px] text-teton-ui-gray">{sub}</small>}
                </span>
                <Switch on={p[k]} onChange={(v) => set({ [k]: v } as Partial<Profile>)} label={t} />
              </div>
            ))}
          </section>
          {error && (
            <p role="alert" className="rounded-[9px] bg-[#FDF0EE] px-3 py-2 text-[12.5px] text-[#B4442C]">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            {notice && <span role="status" className="mr-auto text-[12.5px] font-medium text-[#256B41] [animation:fadeIn_.2s_ease-out]">✓ {notice}</span>}
            <button type="button" className="h-10 px-4 rounded-[10px] border border-[#D5D9DE] text-[13px] font-semibold disabled:opacity-50" disabled={!changed || busy} onClick={() => setP({ ...saved, photoUrl: p.photoUrl })}>
              Undo changes
            </button>
            <button type="button" className="h-10 px-4 rounded-[10px] bg-teton-ink text-white text-[13px] font-semibold disabled:opacity-50" disabled={!changed || busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </div>
        {/* How prospects see you. */}
        <aside className="lg:sticky lg:top-5 rounded-2xl border border-[#E6E8EB] bg-[#FBF8F3] px-4 py-4">
          <p className={h}>How prospects see you</p>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[1px] text-teton-ui-gray">As the main point of contact</p>
          <div className="grid grid-cols-[96px_1fr] gap-3.5 rounded-2xl border border-[#E8E4DC] bg-white p-3.5">
            <PersonPhoto name={p.name} photoUrl={p.photoUrl} size={96} square />
            <div className="min-w-0">
              <span className="inline-block rounded-full bg-[#FDF0EE] px-2 py-0.5 text-[10.5px] font-semibold text-[#B4442C]">Your main point of contact</span>
              <p className="mt-1 text-[16px] font-semibold">{p.name}</p>
              <p className="text-[12px] text-[#5A6270]">{p.title || 'Your title'} · Teton</p>
              <p className="mt-1.5 text-[11.5px] break-words">✉ {p.email}{phone ? ` · ☏ ${phone}` : ''}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="h-7 px-2.5 rounded-lg bg-teton-ink text-white text-[11.5px] font-semibold inline-flex items-center">✉ Email</span>
                {p.bookDefault && p.schedulingUrl && <span className="h-7 px-2.5 rounded-lg border border-[#D5D9DE] text-[11.5px] font-semibold inline-flex items-center">📅 Book a meeting</span>}
              </div>
            </div>
          </div>
          <p className="mt-3.5 mb-1.5 text-[10px] font-bold uppercase tracking-[1px] text-teton-ui-gray">On someone else’s deal</p>
          <div className="flex gap-3 rounded-2xl border border-[#E8E4DC] bg-white p-3.5">
            <PersonPhoto name={p.name} photoUrl={p.photoUrl} size={48} />
            <div className="min-w-0 text-[12px]">
              <p className="text-[13.5px] font-semibold">{p.name}</p>
              <p className="text-[#5A6270]">{p.title || 'Your title'}</p>
              <p className="mt-1 text-[#5A6270]">Their line for that deal goes here.</p>
              <p className="mt-1 break-words">✉ {p.email}{phone ? ` · ☏ ${phone}` : ''}</p>
            </div>
          </div>
          <p className="mt-3.5 mb-1.5 text-[10px] font-bold uppercase tracking-[1px] text-teton-ui-gray">In emails</p>
          <div className="flex items-center gap-2.5 rounded-xl border border-[#ECEEF1] bg-white px-3 py-2.5 text-[12px]">
            <span className="text-[10.5px] font-semibold uppercase tracking-[.6px] text-teton-ui-gray">Sent by:</span>
            <PersonPhoto name={p.name} photoUrl={p.photoUrl} size={26} />
            <span className="min-w-0 truncate">{p.name}{p.title ? ` · ${p.title}` : ''} · Teton</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
