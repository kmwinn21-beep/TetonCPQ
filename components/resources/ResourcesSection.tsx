'use client';

/**
 * The Share dialog's "Resources tab" section: on or off, what's on it, how it's being used, and the way into the
 * Resources editor (and its Activity view).
 */
import { useCallback, useEffect, useState } from 'react';
import type { Activity } from '@/lib/data/dealRooms';
import type { Profile } from '@/lib/data/profiles';
import type { Resource, RoomSettings } from '@/lib/resources/model';
import { PersonPhoto } from './Person';
import { ResourcesEditor } from './ResourcesEditor';
import { fmtDur } from './ActivityView';

export function ResourcesSection({ quoteId, versionId, linkUrl, canEdit }: { quoteId: number; versionId: number; linkUrl: string | null; canEdit: boolean }) {
  const [d, setD] = useState<{ settings: RoomSettings; resources: Resource[]; profiles: Profile[] } | null>(null);
  const [a, setA] = useState<Activity | null>(null);
  const [open, setOpen] = useState<false | 'edit' | 'activity'>(false);
  const load = useCallback(() => {
    void fetch(`/api/quotes/${quoteId}/resources?version=${versionId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setD(j));
    void fetch(`/api/quotes/${quoteId}/resources/activity?days=90`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { activity?: Activity } | null) => j?.activity && setA(j.activity));
  }, [quoteId, versionId]);
  useEffect(load, [load]);
  if (!d) return null;
  const s = d.settings;
  const counts = (['file', 'video', 'embed', 'link', 'onepager', 'floorplan'] as const)
    .map((k) => [k, d.resources.filter((r) => r.kind === k && !r.hidden).length] as const)
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${({ file: 'document', video: 'video', embed: 'video', link: 'link', onepager: 'one pager', floorplan: 'floor plan' } as const)[k]}${n === 1 ? '' : 's'}`);
  const team = [s.contactUserId, ...s.team.map((t) => t.userId)].map((id) => d.profiles.find((p) => p.userId === id)).filter((p): p is Profile => !!p);
  const visited = a ? a.people.filter((p) => Object.keys(a.cells).some((k) => k.endsWith(`|${p.email}`))).length : 0;
  const save = async (enabled: boolean) => {
    setD((x) => (x ? { ...x, settings: { ...x.settings, enabled } } : x));
    await fetch(`/api/quotes/${quoteId}/resources`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) });
  };
  return (
    <div className="mt-2 rounded-xl border border-teton-off-white">
      <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-2">
        <span className="text-[13px] font-semibold">{s.tabName} tab</span>
        <span className="min-w-0 truncate text-[11.5px] text-teton-ui-gray">{['Your Team', ...counts].join(', ')}</span>
        <button type="button" role="switch" aria-checked={s.enabled} aria-label={`Show the ${s.tabName} tab`} disabled={!canEdit} onClick={() => void save(!s.enabled)} className={`ml-auto relative w-[34px] h-5 flex-shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none ${s.enabled ? 'bg-[#3F8CEA]' : 'bg-[#D5D9DE]'}`}>
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none ${s.enabled ? 'translate-x-[14px]' : ''}`} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 px-3.5 pb-3">
        <span className="flex">
          {team.slice(0, 5).map((p, i) => (
            <span key={p.userId} className={i ? '-ml-1.5' : ''}>
              <PersonPhoto name={p.name} photoUrl={p.photoUrl} size={24} className="border-2 border-white" />
            </span>
          ))}
        </span>
        {a && a.people.length > 0 && (
          <button type="button" className="text-[12px] font-semibold text-[#256B41] hover:underline" onClick={() => setOpen('activity')}>
            {visited ? `${visited} of ${a.people.length} visited · ${fmtDur(a.totalTime)} spent` : 'No visits yet'}
          </button>
        )}
        <button type="button" className="ml-auto inline-flex items-center h-8 px-3 rounded-[9px] bg-teton-ink text-white text-[12.5px] font-semibold hover:bg-black" onClick={() => setOpen('edit')}>
          {canEdit ? `Edit ${s.tabName}` : `View ${s.tabName}`} →
        </button>
      </div>
      {open && <ResourcesEditor quoteId={quoteId} versionId={versionId} linkUrl={linkUrl} startWithActivity={open === 'activity'} onClose={() => (setOpen(false), load())} />}
    </div>
  );
}
