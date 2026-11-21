'use client';

/**
 * Notes on tagged rooms (Scope Mode badges) and the card that shows a badge's
 * details on hover. One note can sit on many rooms; its author edits it for all
 * of them or for one room only, and its author or an admin deletes it.
 */
import { useCallback, useEffect, useState } from 'react';
import type { TagNote } from '@/lib/data/tagNotes';
import { productsOf, type DraftCommunity } from '@/lib/quote/draft';
import { badgeOf, bedKeyOf, careLabel, type RoomMark, type RoomType } from '@/lib/quote/roomTypes';
import { count } from '@/lib/format';
import { SegGroup } from '@/components/form/SegGroup';
import { AuthorPill, type Me } from './PlanNotes';
import { Badge } from './ScopeViewer';

export const NOTE_DOT = '#F0B429';

export function useTagNotes(quoteId: number) {
  const [notes, setNotes] = useState<TagNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/quotes/${quoteId}/tag-notes`;
  const reload = useCallback(async () => {
    const r = await fetch(base, { cache: 'no-store' });
    if (r.ok) setNotes((await r.json()).notes ?? []);
  }, [base]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const call = async (url: string, method: string, body?: unknown) => {
    setError(null);
    const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) {
      const msg = (await r.json().catch(() => ({}))).error ?? 'Something went wrong';
      setError(msg);
      throw new Error(msg);
    }
    await reload();
  };
  return {
    notes,
    error,
    /** The notes on one tagged room. */
    of: (markId: string) => notes.filter((n) => n.markIds.includes(markId)),
    create: (markIds: string[], body: string) => call(base, 'POST', { markIds, body }),
    update: (id: number, body: string, only?: string) => call(`${base}/${id}`, 'PATCH', { body, ...(only ? { only } : {}) }),
    remove: (id: number) => call(`${base}/${id}`, 'DELETE'),
  };
}
export type TagNotesApi = ReturnType<typeof useTagNotes>;

const day = (iso: string) => {
  const d = new Date(iso.includes('T') || iso.length === 10 ? iso : `${iso.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(iso.length === 10 ? { timeZone: 'UTC' } : {}) });
};

/** Room numbers (or a count) of the other rooms a note is on. */
function others(n: TagNote, markId: string, labelOf: (id: string) => string | null) {
  const rest = n.markIds.filter((id) => id !== markId);
  const labels = rest.map(labelOf).filter(Boolean) as string[];
  return { n: rest.length, labels: labels.length === rest.length && rest.length <= 6 ? labels.join(', ') : '' };
}

/** A note's amber box (read-only). */
export function NoteBox({ note, markId, labelOf, children }: { note: TagNote; markId: string; labelOf: (id: string) => string | null; children?: React.ReactNode }) {
  const o = others(note, markId, labelOf);
  return (
    <div className="rounded-lg border border-[#F3DC9A] bg-[#FFF8E6] px-2.5 py-2 text-[11.5px] text-teton-ink">
      {o.n > 0 && <p className="text-[9.5px] font-bold uppercase tracking-wider text-[#8A6A12] mb-0.5">Shared with {count(o.n + 1)} rooms</p>}
      <p className="whitespace-pre-wrap break-words">{note.body}</p>
      <div className="flex items-center gap-1.5 mt-1 text-[10.5px] text-[#8A6A12]">
        <AuthorPill person={note.author} />
        <span>{day(note.updatedAt)}</span>
        {o.labels && <span className="ml-auto truncate">also {o.labels}</span>}
      </div>
      {children}
    </div>
  );
}

/** What a badge is: room type, room number, care, page, sensors, products, totals, notes, who tagged it. */
export function TagCard({
  type,
  index,
  mark,
  community,
  taggedOfType,
  notes,
  labelOf,
  onEdit,
}: {
  type: RoomType;
  index: number;
  mark: RoomMark;
  community: Partial<DraftCommunity> | null;
  taggedOfType: number;
  notes: TagNote[];
  labelOf: (id: string) => string | null;
  /** Phones: open the edit popover from the card. */
  onEdit?: () => void;
}) {
  const b = badgeOf(type, index);
  const p = productsOf(community ?? {})[bedKeyOf(type)];
  const sensors = Math.max(1, Number(type.sensors) || 1);
  return (
    <div className="rounded-xl border border-teton-off-white bg-white p-3 text-xs shadow-[0_12px_36px_rgba(0,0,0,.2)]" role="tooltip">
      <div className="flex items-start gap-2">
        <Badge color={b.color} text={b.initials} size={24} />
        <div className="min-w-0">
          <p className="font-semibold text-[13px] truncate">{type.name || 'Room type'}{mark.label ? ` · Room ${mark.label}` : ''}</p>
          <p className="text-[11px] text-teton-ui-gray truncate">{careLabel(type)} · Page {mark.page}</p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 mt-2.5 text-[11.5px]">
        <dt className="text-teton-ui-gray">Sensors</dt>
        <dd>{sensors} per room</dd>
        <dt className="text-teton-ui-gray">Products</dt>
        <dd className="flex flex-wrap gap-1">
          <span className={`rounded-full px-1.5 text-[10.5px] font-semibold ${p.monitoring ? 'bg-[#E6F4EC] text-[#2B7A4B]' : 'bg-teton-off-white text-teton-ui-gray line-through'}`}>Resident monitoring</span>
          <span className={`rounded-full px-1.5 text-[10.5px] font-semibold ${p.ecall ? 'bg-[#E6F4EC] text-[#2B7A4B]' : 'bg-teton-off-white text-teton-ui-gray line-through'}`}>E-Call</span>
        </dd>
        <dt className="text-teton-ui-gray">Room type</dt>
        <dd>{count(taggedOfType)} room{taggedOfType === 1 ? '' : 's'} tagged · {count(taggedOfType * sensors)} sensors</dd>
      </dl>
      {notes.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {notes.map((n) => <NoteBox key={n.id} note={n} markId={mark.id} labelOf={labelOf} />)}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-teton-off-white text-[10.5px] text-teton-ui-gray">
        <span>{mark.by ? `Tagged by ${mark.by}${mark.at ? ` · ${day(mark.at)}` : ''}` : mark.at ? `Tagged ${day(mark.at)}` : 'Tagged room'}</span>
        {onEdit ? (
          <button type="button" className="btn-secondary py-0.5 px-2 text-[11px]" onClick={onEdit}>Edit</button>
        ) : (
          <span>Click to edit</span>
        )}
      </div>
    </div>
  );
}

/**
 * The notes section of a tagged room's popover: others' notes read-only (an admin can delete them), the viewer's
 * own note editable (for every room it's on, or this room only), or a box to add one.
 */
export function TagNoteSection({ api, markId, me, labelOf }: { api: TagNotesApi; markId: string; me: Me | null; labelOf: (id: string) => string | null }) {
  const notes = api.of(markId);
  const mine = notes.find((n) => n.mine);
  const theirs = notes.filter((n) => n !== mine);
  const [body, setBody] = useState(mine?.body ?? '');
  const [only, setOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setBody(mine?.body ?? '');
    setOnly(false);
  }, [mine?.id, mine?.body]);
  const shared = mine ? mine.markIds.length : 0;
  const dirty = body.trim() !== (mine?.body ?? '');
  const save = async () => {
    setBusy(true);
    try {
      if (mine) await api.update(mine.id, body.trim(), only && shared > 1 ? markId : undefined);
      else if (body.trim()) await api.create([markId], body.trim());
    } catch {
      /* shown below */
    } finally {
      setBusy(false);
    }
  };
  const eyebrow = 'block text-[9.5px] font-semibold uppercase tracking-wider text-teton-ui-gray mt-2 mb-1';
  return (
    <div>
      {theirs.map((n) => (
        <div key={n.id} className="mt-2">
          <NoteBox note={n} markId={markId} labelOf={labelOf}>
            {n.canDelete && (
              <button type="button" className="mt-1 text-[10.5px] text-[#B23A26] underline" onClick={() => void api.remove(n.id).catch(() => {})}>
                Delete note{n.markIds.length > 1 ? ` (all ${n.markIds.length} rooms)` : ''}
              </button>
            )}
          </NoteBox>
        </div>
      ))}
      <label className={`${eyebrow} flex items-center justify-between`} htmlFor={`tn-${markId}`}>
        <span>{theirs.length ? 'Your note' : 'Note'}</span>
        {shared > 1 && <span className="normal-case tracking-normal font-medium text-[#8A6A12]">Shared with {shared} rooms</span>}
      </label>
      <textarea
        id={`tn-${markId}`}
        className="input-field py-1.5 text-xs min-h-[3.25rem] resize-y"
        value={body}
        maxLength={2000}
        placeholder={me ? 'Add a note about this room…' : 'Add a note…'}
        onChange={(e) => setBody(e.target.value)}
      />
      {shared > 1 && dirty && (
        <SegGroup label="Apply the change to" thumbClass="bg-white" className="grid grid-cols-2 mt-1.5 rounded-lg bg-teton-off-white p-0.5 text-[11px] drawer-in">
          <button type="button" role="radio" aria-checked={!only} className={`py-1 ${!only ? 'font-semibold text-teton-ink' : 'text-teton-ui-gray'}`} onClick={() => setOnly(false)}>Change for all {shared}</button>
          <button type="button" role="radio" aria-checked={only} className={`py-1 ${only ? 'font-semibold text-teton-ink' : 'text-teton-ui-gray'}`} onClick={() => setOnly(true)}>Only this room</button>
        </SegGroup>
      )}
      {api.error && <p className="mt-1 text-[10.5px] text-[#9A2E1C]">{api.error}</p>}
      {dirty && (
        <div className="flex justify-end gap-1.5 mt-1.5 drawer-in">
          <button type="button" className="btn-ghost py-0.5 text-[11px]" onClick={() => setBody(mine?.body ?? '')}>Cancel</button>
          <button type="button" className="btn-primary py-0.5 text-[11px] disabled:opacity-40" disabled={busy} onClick={() => void save()}>
            {mine && !body.trim() ? (only && shared > 1 ? 'Remove from this room' : 'Delete note') : 'Save note'}
          </button>
        </div>
      )}
    </div>
  );
}
