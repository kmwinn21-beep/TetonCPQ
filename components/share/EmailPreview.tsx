'use client';

/**
 * The Share dialog's live preview of the email a prospect gets: who it's from, the subject, and the email itself,
 * built from the dialog's current fields (the same template the server sends). Desktop or phone width, for any person
 * on the list. The part tied to the field being typed in is outlined.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SegGroup } from '@/components/form/SegGroup';
import { shareEmail, type ShareEmailInput } from '@/lib/email/templates';

export type EmailPart = 'name' | 'intro' | 'note';
interface Person {
  email: string;
  name: string;
}

const MARK_CSS = `[data-part]{transition:outline-color .2s ease,box-shadow .2s ease;outline:2px solid transparent;outline-offset:3px;border-radius:6px}
[data-part].on{outline-color:#3F8CEA;box-shadow:0 0 0 6px rgba(63,140,234,.12)}
@media (prefers-reduced-motion: reduce){[data-part]{transition:none}}
html,body{overflow:hidden}`;

export function EmailPreview({
  people,
  repName,
  replyTo,
  from,
  focus,
  email,
}: {
  people: Person[];
  repName: string;
  replyTo: string;
  from: string;
  focus: EmailPart | null;
  /** Everything else the email needs (as in shareEmail), minus who it's to. */
  email: Omit<ShareEmailInput, 'email' | 'first' | 'repName' | 'baseUrl' | 'marks'>;
}) {
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [who, setWho] = useState(people[0]?.email ?? '');
  useEffect(() => {
    if (!people.some((p) => p.email === who)) setWho(people[0]?.email ?? '');
  }, [people, who]);
  const person = people.find((p) => p.email === who) ?? people[0] ?? { email: 'name@company.com', name: '' };
  const first = person.name.trim().split(/\s+/)[0] || null;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const mail = useMemo(() => shareEmail({ ...email, email: person.email, first, repName, baseUrl: origin, marks: true }), [email, person.email, first, repName, origin]);

  // The email lives in an iframe (its own styles, like an inbox); rewritten in place so it doesn't flash or lose its spot.
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(480);
  const [height, setHeight] = useState(900);
  const width = device === 'phone' ? 375 : 660;
  const scale = device === 'phone' ? Math.min(1, (boxW - 24) / width) : Math.min(1, boxW / width);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(mail.html.replace('</head>', `<style>${MARK_CSS}</style></head>`));
    doc.close();
    const measure = () => setHeight(doc.documentElement.scrollHeight);
    measure();
    doc.querySelectorAll('img').forEach((im) => im.addEventListener('load', measure));
    // Re-apply the outline after a rewrite.
    if (focus) doc.querySelector(`[data-part="${focus}"]`)?.classList.add('on');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mail.html, width]);
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    doc.querySelectorAll('[data-part]').forEach((el) => el.classList.toggle('on', el.getAttribute('data-part') === focus));
    const el = focus ? doc.querySelector<HTMLElement>(`[data-part="${focus}"]`) : null;
    const sc = box.current?.closest<HTMLElement>('[data-preview-scroll]');
    if (el && sc) {
      const y = el.getBoundingClientRect().top * scale + (frame.current!.getBoundingClientRect().top - sc.getBoundingClientRect().top) + sc.scrollTop;
      if (y < sc.scrollTop + 20 || y > sc.scrollTop + sc.clientHeight - 80) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        sc.scrollTo({ top: Math.max(0, y - 60), behavior: reduce ? 'auto' : 'smooth' });
      }
    }
  }, [focus, mail.html, scale]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-3 px-5 pt-4 pb-2.5">
        <div className="min-w-0">
          <p className="text-[15px] font-bold">Email preview</p>
          <p className="text-[12px] text-teton-ui-gray">Updates as you type</p>
        </div>
        <SegGroup className="ml-auto relative inline-flex rounded-[9px] bg-[#ECE9E3] p-[3px] gap-0.5" thumbClass="bg-white shadow-sm rounded-[7px]" label="Preview width">
          {(['desktop', 'phone'] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={device === d} onClick={() => setDevice(d)} className={`relative z-[1] px-3 py-1 rounded-[7px] text-[12px] font-semibold transition-colors duration-200 ${device === d ? 'text-teton-ink' : 'text-teton-ui-gray'}`}>
              {d === 'desktop' ? 'Desktop' : 'Phone'}
            </button>
          ))}
        </SegGroup>
      </div>
      <label className="flex items-center gap-2 px-5 pb-3 text-[12.5px] min-w-0">
        <span className="text-teton-ui-gray whitespace-nowrap">Preview for</span>
        <select className="min-w-0 flex-1 h-8 rounded-[9px] border border-[#D5D9DE] bg-white px-2 text-[12.5px] font-semibold" value={person.email} onChange={(e) => setWho(e.target.value)} disabled={people.length < 2}>
          {people.length ? (
            people.map((p) => (
              <option key={p.email} value={p.email}>
                {p.name.trim() ? `${p.name.trim()} · ${p.email}` : p.email}
              </option>
            ))
          ) : (
            <option value="name@company.com">No one on the list yet</option>
          )}
        </select>
      </label>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-5" data-preview-scroll>
        <div className="rounded-xl border border-[#E3DFD8] bg-white shadow-[0_6px_18px_rgba(0,0,0,.05)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EFECE6] text-[12px] leading-relaxed">
            <p className="text-[14px] font-bold leading-snug break-words">{mail.subject}</p>
            <div className="mt-1.5 flex items-start gap-2 min-w-0">
              <span className="w-[26px] h-[26px] flex-shrink-0 rounded-full bg-teton-ink text-white grid place-items-center text-[10px] font-bold">{repName.trim()[0]?.toUpperCase() ?? 'T'}</span>
              <p className="min-w-0 break-words">
                <b>{repName.trim() || 'Teton'} (Teton)</b> <span className="text-teton-ui-gray">&lt;{from}&gt;</span>
                <br />
                <span className="text-teton-ui-gray">
                  to {person.email} · reply-to {replyTo}
                </span>
              </p>
            </div>
          </div>
          <div ref={box} className="bg-[#F4F1EC] overflow-hidden" style={{ height: height * scale }}>
            <div className={device === 'phone' ? 'mx-auto' : ''} style={{ width: width * scale }}>
              <iframe ref={frame} title="Email preview" className="block border-0 origin-top-left" style={{ width, height, transform: `scale(${scale})` }} sandbox="allow-same-origin" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
