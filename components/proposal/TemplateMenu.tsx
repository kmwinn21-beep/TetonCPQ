'use client';

/**
 * The business case's Template button: pick a persona template (its layout and, optionally, its wording; the deal's
 * figures fill it in), save this business case as a template, or go to the Templates page. Shows which template the
 * business case came from, and whether it has been changed since.
 */
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SegGroup } from '@/components/form/SegGroup';
import type { BcTemplate } from '@/lib/data/bcTemplates';
import { INCLUDE_ALL, matchesTemplate, standardBusinessCase, type ApplyMode, type Include } from '@/lib/proposal/templates';
import type { ProposalLayout } from '@/lib/proposal/layout';
import type { TextEdits } from '@/lib/proposal/text';
import { useProposalText } from './EditableText';

export const PERSONAS = ['CFO', 'Clinical leader', 'Capital partner', 'Operations / ED'] as const;
export const PERSONA_TONE: Record<string, string> = {
  CFO: 'bg-[#E5EEFC] text-[#1F5FB5]',
  'Clinical leader': 'bg-[#FCE8EF] text-[#A23A63]',
  'Capital partner': 'bg-[#E6F4EC] text-[#256B41]',
  'Operations / ED': 'bg-[#FFF1DC] text-[#8A5A00]',
};
export const personaTone = (p: string) => PERSONA_TONE[p] ?? 'bg-[#F1E9FB] text-[#6A3FB0]';
const ICON: Record<string, string> = { CFO: '$', 'Clinical leader': '♥', 'Capital partner': '⌂', 'Operations / ED': '⚙' };

type Doc = { edits: TextEdits; layout: ProposalLayout };

export function TemplateMenu({ versionId }: { versionId: number }) {
  const text = useProposalText();
  const [templates, setTemplates] = useState<BcTemplate[] | null>(null);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<BcTemplate | 'standard' | null>(null);
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<{ doc: Doc; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const r = await fetch('/api/templates', { cache: 'no-store' });
    if (r.ok) setTemplates(((await r.json()) as { templates: BcTemplate[] }).templates);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 10000);
    return () => clearTimeout(t);
  }, [undo]);

  const applied = text.layout.bcTemplate;
  const current = applied ? templates?.find((t) => t.id === applied.id) : undefined;
  const edited = applied && current ? !matchesTemplate({ edits: text.edits, layout: text.layout }, current) : false;

  const apply = async (t: BcTemplate, mode: ApplyMode) => {
    setError(null);
    const before = { edits: text.edits, layout: text.layout };
    text.saveNow();
    const r = await fetch(`/api/versions/${versionId}/template`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ templateId: t.id, mode }) });
    const j = (await r.json().catch(() => ({}))) as Doc & { error?: string };
    if (!r.ok) return setError(j.error ?? 'Couldn’t apply the template');
    text.replace({ edits: j.edits, layout: j.layout });
    setUndo({ doc: before, name: t.name });
    setAsking(null);
    void load();
  };
  // Back to the standard business case: drop its layout and wording changes (the standard format's are kept).
  const toStandard = () => {
    const before = { edits: text.edits, layout: text.layout };
    text.replace(standardBusinessCase(before), true);
    setUndo({ doc: before, name: 'Standard' });
    setAsking(null);
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border whitespace-nowrap transition-colors ${applied ? 'border-[#F5B841] bg-[#F5B841]/15 text-[#FCE3A6]' : 'border-white/30 hover:bg-white/10'}`}
        title="Business case templates"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
        <span className="hidden sm:inline lg:hidden xl:inline" data-hide-at="1">Template:</span>
        <span className="max-w-[10rem] truncate" data-hide-at="3">{applied ? applied.name : 'Standard'}</span>
        {edited && <span className="text-[11px] opacity-80" data-hide-at="2">· edited</span>}
        <svg className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.2 7.2a.75.75 0 011.06 0L10 10.94l3.74-3.74a.75.75 0 111.06 1.06l-4.27 4.27a.75.75 0 01-1.06 0L5.2 8.26a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full mt-1.5 z-50 w-[min(340px,calc(100vw-24px))] rounded-xl bg-white text-teton-ink shadow-[0_14px_34px_rgba(0,0,0,.25)] overflow-hidden [animation:fadeScale_.15s_ease-out] motion-reduce:[animation:none]">
          <p className="px-3 pt-2.5 pb-1 text-[9.5px] font-extrabold uppercase tracking-[1px] text-teton-ui-gray">Templates</p>
          <ul className="max-h-[50vh] overflow-y-auto">
            <li>
              <button type="button" role="menuitem" className={`flex w-full gap-2.5 px-3 py-2 text-left hover:bg-[#F3F7FD] ${!applied ? 'bg-[#F3F7FD]' : ''}`} onClick={() => (setOpen(false), setAsking('standard'))}>
                <span className="w-7 h-7 flex-shrink-0 rounded-lg bg-teton-almost-white flex items-center justify-center text-sm" aria-hidden="true">▤</span>
                <span className="min-w-0">
                  <b className="block text-[12.5px] font-semibold">Standard {!applied && <Tag>Current</Tag>}</b>
                  <span className="block text-[11px] text-teton-ui-gray">The default business case (no template)</span>
                </span>
              </button>
            </li>
            {templates?.map((t) => (
              <li key={t.id}>
                <button type="button" role="menuitem" className={`flex w-full gap-2.5 px-3 py-2 text-left hover:bg-[#F3F7FD] ${applied?.id === t.id ? 'bg-[#F3F7FD]' : ''}`} onClick={() => (setOpen(false), setAsking(t))}>
                  <span className={`w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center text-sm font-bold ${personaTone(t.persona)}`} aria-hidden="true">{ICON[t.persona] ?? '★'}</span>
                  <span className="min-w-0">
                    <b className="block text-[12.5px] font-semibold truncate">
                      {t.name} {applied?.id === t.id && <Tag>{edited ? 'Applied · edited' : 'Applied'}</Tag>}
                      {!t.shared && <span className="ml-1 rounded-full bg-teton-almost-white px-1.5 text-[9.5px] font-bold text-teton-ui-gray">Just me</span>}
                    </b>
                    <span className="block text-[11px] text-teton-ui-gray truncate">
                      {[t.persona, t.description, t.pages ? `${t.pages} pages` : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {templates?.length === 0 && <li className="px-3 py-2 text-xs text-teton-ui-gray">No templates yet. Save this one as the first.</li>}
          </ul>
          <div className="border-t border-teton-off-white py-1">
            {applied && current && edited && (
              <button type="button" className="block w-full px-3 py-1.5 text-left text-[12.5px] font-semibold text-[#1F5FB5] hover:bg-teton-almost-white" onClick={() => (setOpen(false), void apply(current, applied.wording ? 'all' : 'layout'))}>
                ↺ Reset to “{current.name}”
              </button>
            )}
            <button type="button" className="block w-full px-3 py-1.5 text-left text-[12.5px] font-semibold text-[#1F5FB5] hover:bg-teton-almost-white" onClick={() => (setOpen(false), setSaving(true))}>
              ＋ Save this layout as a template…
            </button>
            <Link href="/templates" className="block px-3 py-1.5 text-[12.5px] font-semibold text-[#1F5FB5] hover:bg-teton-almost-white">
              Manage templates →
            </Link>
          </div>
        </div>
      )}
      {asking && (
        <Dialog onClose={() => setAsking(null)} label="Apply a template">
          {asking === 'standard' ? (
            <>
              <h3 className="text-base font-semibold">Back to the standard business case?</h3>
              <p className="mt-1 text-sm text-teton-dark-gray">This version’s business case layout and wording changes are removed. The figures stay this deal’s. You can undo right after.</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={() => setAsking(null)}>Cancel</button>
                <button type="button" className="btn-primary" onClick={toStandard}>Use standard</button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-base font-semibold">Apply “{asking.name}”?</h3>
              <p className="mt-1 text-sm text-teton-dark-gray">
                The business case is formatted from the template using this deal’s figures. {asking.description}
              </p>
              <div className="mt-3 space-y-2">
                <button type="button" className="w-full text-left rounded-xl border border-teton-pale-gray px-3 py-2.5 hover:border-teton-ink hover:bg-teton-almost-white" onClick={() => void apply(asking, 'all')}>
                  <b className="block text-sm">Replace everything</b>
                  <span className="block text-xs text-teton-ui-gray">The template’s pages, sections, tables and wording replace this business case’s.</span>
                </button>
                <button type="button" className="w-full text-left rounded-xl border border-teton-pale-gray px-3 py-2.5 hover:border-teton-ink hover:bg-teton-almost-white" onClick={() => void apply(asking, 'layout')}>
                  <b className="block text-sm">Layout only, keep my wording</b>
                  <span className="block text-xs text-teton-ui-gray">Pages, sections, tables and views from the template; your text edits stay.</span>
                </button>
              </div>
              {error && <p className="mt-2 text-xs text-[#9A2E1C]" role="alert">{error}</p>}
              <div className="mt-3 flex justify-end">
                <button type="button" className="btn-ghost" onClick={() => setAsking(null)}>Cancel</button>
              </div>
            </>
          )}
        </Dialog>
      )}
      {saving && <SaveTemplateDialog versionId={versionId} onClose={() => setSaving(false)} onSaved={() => void load()} />}
      {undo &&
        createPortal(
          <div className="no-print fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 rounded-xl bg-teton-ink text-white px-4 py-2.5 text-sm shadow-xl [animation:fadeScale_.2s_ease-out] motion-reduce:[animation:none]" role="status">
            {undo.name === 'Standard' ? 'Back to the standard business case.' : `Formatted from “${undo.name}”.`}
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={() => {
                text.replace(undo.doc, true);
                setUndo(null);
              }}
            >
              Undo
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

const Tag = ({ children }: { children: React.ReactNode }) => <span className="ml-1 rounded-full bg-[#E5EEFC] px-1.5 text-[9.5px] font-bold text-[#1F5FB5] align-middle">{children}</span>;

export function Dialog({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return createPortal(
    <div className="no-print fixed inset-0 z-[85] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" tabIndex={-1} aria-label="Close" className="absolute inset-0 bg-black/40 [animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]" onClick={onClose} />
      <div className="relative w-full sm:w-[440px] max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white text-teton-ink p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl max-sm:[animation:sheetUp_.25s_ease-out] sm:[animation:fadeScale_.2s_ease-out] motion-reduce:[animation:none]">
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Save the business case on screen as a template: name, persona, what to include, who can use it. */
function SaveTemplateDialog({ versionId, onClose, onSaved }: { versionId: number; onClose: () => void; onSaved: () => void }) {
  const text = useProposalText();
  const [name, setName] = useState('');
  const [persona, setPersona] = useState<string>('CFO');
  const [other, setOther] = useState('');
  const [description, setDescription] = useState('');
  const [include, setInclude] = useState<Include>(INCLUDE_ALL);
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fromVersionId: versionId, name, persona: persona === 'Other' ? other : persona, description, shared, include, edits: text.edits, layout: text.layout }),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: number; error?: string };
    setBusy(false);
    if (!r.ok) return setError(j.error ?? 'Couldn’t save the template');
    setDone(j.id ?? null);
    onSaved();
  };
  const eyebrow = 'block text-[9.5px] font-extrabold uppercase tracking-[1px] text-teton-ui-gray mb-1 mt-3';
  const check = (k: keyof Include, label: string, sub: React.ReactNode) => (
    <label className="flex items-start gap-2 py-1 text-[13px] cursor-pointer">
      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-teton-ink" checked={include[k]} onChange={(e) => setInclude((i) => ({ ...i, [k]: e.target.checked }))} />
      <span>
        {label}
        <span className="block text-[11px] text-teton-ui-gray">{sub}</span>
      </span>
    </label>
  );
  if (done)
    return (
      <Dialog onClose={onClose} label="Template saved">
        <h3 className="text-base font-semibold">Template saved</h3>
        <p className="mt-1 text-sm text-teton-dark-gray">“{name}” is in the Template menu on every deal’s business case{shared ? ' for everyone' : ' for you'}.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Link href={`/templates/${done}`} className="btn-secondary">Open in the editor</Link>
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </Dialog>
    );
  return (
    <Dialog onClose={onClose} label="Save as a template">
      <h3 className="text-base font-semibold">Save as a template</h3>
      <p className="mt-0.5 text-xs text-teton-ui-gray">Saves this business case’s layout and wording. Numbers are never saved: they come from whichever deal uses it.</p>
      <label className={eyebrow} htmlFor="tpl-name">Name</label>
      <input id="tpl-name" className="input-field w-full" value={name} maxLength={80} placeholder="e.g. CFO — financial case" onChange={(e) => setName(e.target.value)} />
      <span className={eyebrow}>Persona</span>
      <div className="flex flex-wrap gap-1.5">
        {[...PERSONAS, 'Other'].map((p) => (
          <button key={p} type="button" aria-pressed={persona === p} className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold transition-colors ${persona === p ? 'bg-teton-ink border-teton-ink text-white' : 'border-teton-pale-gray hover:bg-teton-almost-white'}`} onClick={() => setPersona(p)}>
            {p === 'Other' ? '+ Other' : p}
          </button>
        ))}
      </div>
      {persona === 'Other' && <input className="input-field w-full mt-1.5 drawer-in" value={other} maxLength={40} placeholder="Persona (e.g. Board)" aria-label="Other persona" onChange={(e) => setOther(e.target.value)} />}
      <label className={eyebrow} htmlFor="tpl-desc">Description</label>
      <input id="tpl-desc" className="input-field w-full" value={description} maxLength={300} placeholder="What it leads with, e.g. ROI, payback and cash flow first" onChange={(e) => setDescription(e.target.value)} />
      <span className={eyebrow}>Include</span>
      {check('pages', 'Pages, order and sections', 'Removed and added pages, section order and spacing')}
      {check('tables', 'Tables, figures and views', 'Hidden rows and columns, removed figures, compact tables, view switches')}
      {check('wording', 'Wording', (
        <>
          This deal’s name and counts become placeholders: the customer’s name → <code className="rounded bg-[#E5EEFC] px-1 text-[#1F5FB5]">{'{customer}'}</code>, “3 communities” → <code className="rounded bg-[#E5EEFC] px-1 text-[#1F5FB5]">{'{communities}'}</code>
        </>
      ))}
      {check('customText', 'Added pages’ text', 'Added pages keep their headings either way; tick to keep their body text too')}
      <span className={eyebrow}>Who can use it</span>
      <SegGroup role="group" label="Who can use it" thumbClass="bg-white shadow-sm" className="flex rounded-lg bg-teton-almost-white p-0.5 text-xs">
        {(
          [
            [false, 'Just me'],
            [true, 'Everyone'],
          ] as const
        ).map(([v, label]) => (
          <button key={label} type="button" aria-pressed={shared === v} className={`flex-1 px-2 py-1.5 rounded-md font-semibold transition-colors duration-200 ${shared === v ? 'text-teton-ink' : 'text-teton-ui-gray hover:text-teton-ink'}`} onClick={() => setShared(v)}>
            {label}
          </button>
        ))}
      </SegGroup>
      {error && <p className="mt-2 text-xs text-[#9A2E1C]" role="alert">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary disabled:opacity-40" disabled={!name.trim() || busy || (persona === 'Other' && !other.trim())} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </Dialog>
  );
}
