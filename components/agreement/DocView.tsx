'use client';

/**
 * An agreement round as a page: its paragraphs with tracked insertions (green, underlined) and deletions (red, struck
 * through), each change numbered so the list beside it can point to it. Shared by Teton's workspace and the prospect's
 * Agreement tab. Automatic numbering in the Word file isn't shown (Word doesn't store it as text).
 */
import type { Paragraph } from '@/lib/agreement/docx';

export interface DocChange {
  id: number;
  cid: string;
  kind: string;
  paragraph: number | null;
  decision: 'accepted' | 'rejected' | null;
}

const changeNo = (changes: DocChange[]) => new Map(changes.map((c, i) => [c.cid, i + 1]));

export function DocView({ paragraphs, partOf, changes, selected, onSelect, compact = false }: { paragraphs: Paragraph[]; /** Word's change marks → change ids (c1…). */ partOf?: Record<string, string>; changes: DocChange[]; selected?: number | null; onSelect?: (changeId: number) => void; compact?: boolean }) {
  const nos = changeNo(changes);
  const keyToCid = new Map(Object.entries(partOf ?? {}));
  const byCid = new Map(changes.map((c) => [c.cid, c]));
  const untrackedAt = new Map<number, DocChange[]>();
  for (const c of changes) if (c.kind === 'untracked' && c.paragraph != null) untrackedAt.set(c.paragraph, [...(untrackedAt.get(c.paragraph) ?? []), c]);

  return (
    <div className={`bg-white rounded-md shadow-[0_2px_12px_rgba(15,23,32,.08)] ${compact ? 'px-5 py-5 text-[13.5px]' : 'px-6 sm:px-10 py-8 text-[14.5px]'} leading-[1.7] text-[#1d232b]`} style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}>
      {paragraphs.length === 0 && <p className="text-teton-ui-gray text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>This file has no text.</p>}
      {paragraphs.map((p) => {
        const text = p.segments.map((s) => s.text).join('');
        if (!text.trim()) return <div key={p.idx} className="h-3" aria-hidden="true" />;
        const marks: number[] = [];
        return (
          <p key={p.idx} className={`whitespace-pre-wrap mb-3 ${p.heading ? 'font-semibold text-center uppercase tracking-[1.2px] text-[13px] mb-5' : ''} ${p.table ? 'pl-3 border-l-2 border-[#EFEAE2]' : ''}`} style={p.heading ? { fontFamily: 'Inter, sans-serif' } : undefined}>
            {p.segments.map((s, i) => {
              if (!s.change) return <span key={i}>{s.text}</span>;
              const cid = keyToCid.get(s.change);
              const c = cid ? byCid.get(cid) : undefined;
              const no = cid ? nos.get(cid) : undefined;
              const sel = c && selected === c.id;
              const decided = c?.decision;
              // Show the outcome once decided: a rejected insertion and an accepted deletion fade out.
              const gone = (s.kind === 'ins' && decided === 'rejected') || (s.kind === 'del' && decided === 'accepted');
              const showNo = no != null && !marks.includes(no) && !(c?.kind === 'replace' && s.kind === 'del');
              if (showNo) marks.push(no);
              return (
                <span key={i}>
                  <span
                    role={onSelect && c ? 'button' : undefined}
                    tabIndex={onSelect && c ? 0 : undefined}
                    onClick={() => c && onSelect?.(c.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && c && (e.preventDefault(), onSelect?.(c.id))}
                    className={`${s.kind === 'ins' ? 'bg-[#E3F4E8] text-[#1F6B3A] underline decoration-[1.5px] underline-offset-2' : 'bg-[#FBE6E1] text-[#B4442C] line-through'} ${gone ? 'opacity-35' : ''} ${sel ? 'outline outline-2 outline-[#3F8CEA] outline-offset-1 rounded-sm' : ''} ${onSelect && c ? 'cursor-pointer' : ''} transition-opacity duration-200`}
                  >
                    {s.text}
                  </span>
                  {showNo && (
                    <sup className={`ml-0.5 inline-grid place-items-center w-4 h-4 rounded-full text-[9px] font-extrabold text-white align-[3px] ${decided === 'accepted' ? 'bg-[#1F6B3A]' : decided === 'rejected' ? 'bg-[#B4442C]' : 'bg-[#E8664A]'}`} style={{ fontFamily: 'Inter, sans-serif' }}>
                      {no}
                    </sup>
                  )}
                </span>
              );
            })}
            {(untrackedAt.get(p.idx) ?? []).map((c) => (
              <button
                key={c.cid}
                type="button"
                onClick={() => onSelect?.(c.id)}
                title="Changed here without Track Changes"
                className={`ml-1 inline-grid place-items-center min-w-4 h-4 px-1 rounded-full text-[9px] font-extrabold align-[3px] border border-dashed border-[#B5762A] text-[#8A5A00] bg-[#FFF3D6] ${selected === c.id ? 'outline outline-2 outline-[#3F8CEA]' : ''}`}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                {nos.get(c.cid)}
              </button>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** A change's words: "thirty-six (36) → twenty-four (24)", with the deleted text struck through. */
export function ChangeText({ c }: { c: { kind: string; deleted: string; inserted: string } }) {
  return (
    <span className="text-[13px] leading-snug" style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}>
      {c.deleted && <del className="bg-[#FBE6E1] text-[#B4442C]">{c.deleted}</del>}
      {c.deleted && c.inserted && ' '}
      {c.inserted && <ins className="bg-[#E3F4E8] text-[#1F6B3A] no-underline">{c.inserted}</ins>}
    </span>
  );
}

export const kindLabel = (k: string) => (k === 'replace' ? 'Replaced' : k === 'ins' ? 'Inserted' : k === 'del' ? 'Deleted' : 'Changed without Track Changes');
