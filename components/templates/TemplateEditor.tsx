'use client';

/**
 * Template editor: the business case laid out by a template, edited with the same controls as on a deal (move,
 * remove and add pages and sections, edit wording, hide rows, view switches). Preview data is a sample deal or any
 * deal with a saved version; nothing is saved to that deal. Changes save to the template as you go.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BcTemplate } from '@/lib/data/bcTemplates';
import type { QuoteDraft } from '@/lib/quote/draft';
import type { StoredOutputs } from '@/lib/quote/outputs';
import type { PriceLine } from '@/lib/pricing/lines';
import { DEFAULT_LAYOUT, type ProposalLayout } from '@/lib/proposal/layout';
import { PLACEHOLDERS } from '@/lib/proposal/templates';
import { ProposalTextProvider, useProposalText } from '@/components/proposal/EditableText';
import { ValueLabelsProvider, RemovedPanel } from '@/components/proposal/ProposalSections';
import { BusinessCaseDocument } from '@/components/proposal/BusinessCase';
import { SegGroup } from '@/components/form/SegGroup';
import { PERSONAS, personaTone } from '@/components/proposal/TemplateMenu';

export function TemplateEditor({ template, deals, preview }: { template: BcTemplate; deals: Array<{ quoteId: number; name: string }>; preview: { source: number | null; draft: QuoteDraft; outputs: StoredOutputs; lines: PriceLine[] } }) {
  const layout = { ...structuredClone(DEFAULT_LAYOUT), ...template.layout, format: 'businessCase' } as ProposalLayout;
  return (
    <ProposalTextProvider versionId={0} saveUrl={`/api/templates/${template.id}`} initial={template.edits} initialLayout={layout} editable={template.canEdit}>
      <ValueLabelsProvider>
        <Editor template={template} deals={deals} preview={preview} />
      </ValueLabelsProvider>
    </ProposalTextProvider>
  );
}

function Editor({ template, deals, preview }: { template: BcTemplate; deals: Array<{ quoteId: number; name: string }>; preview: { source: number | null; draft: QuoteDraft; outputs: StoredOutputs; lines: PriceLine[] } }) {
  const router = useRouter();
  const text = useProposalText();
  const [meta, setMeta] = useState({ name: template.name, persona: template.persona, description: template.description, shared: template.shared });
  const [metaState, setMetaState] = useState<'saved' | 'saving' | 'error'>('saved');
  const isOwner = template.canDelete;
  const saveMeta = async (patch: Partial<typeof meta>) => {
    const next = { ...meta, ...patch };
    setMeta(next);
    if (!next.name.trim()) return;
    setMetaState('saving');
    const r = await fetch(`/api/templates/${template.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
    setMetaState(r.ok ? 'saved' : 'error');
  };
  const state = text.state === 'error' || metaState === 'error' ? 'error' : text.state === 'saving' || metaState === 'saving' ? 'saving' : 'saved';
  const eyebrow = 'block text-[9.5px] font-extrabold uppercase tracking-[1px] text-teton-ui-gray mb-1';
  return (
    <div className="-m-4 lg:-m-6">
      {/* Top bar: back, name, persona, preview data, save state. */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-teton-off-white bg-white/95 backdrop-blur px-4 lg:px-6 py-3">
        <Link href="/templates" className="text-sm text-teton-ui-gray hover:underline">← Templates</Link>
        <input
          className="min-w-0 flex-1 sm:flex-none sm:w-64 text-lg font-semibold bg-transparent border-b border-transparent hover:border-teton-pale-gray focus:border-brand-accent focus:outline-none"
          value={meta.name}
          readOnly={!template.canEdit}
          aria-label="Template name"
          maxLength={80}
          onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
          onBlur={() => meta.name.trim() && meta.name !== template.name && void saveMeta({ name: meta.name })}
        />
        {meta.persona && <span className={`rounded-full px-2 py-px text-[10.5px] font-bold ${personaTone(meta.persona)}`}>{meta.persona}</span>}
        <label className="flex items-center gap-2 text-xs text-teton-ui-gray sm:ml-4">
          Preview data
          <select
            className="input-field py-1 text-[13px] max-w-[16rem]"
            value={preview.source ?? ''}
            onChange={(e) => router.push(`/templates/${template.id}${e.target.value ? `?deal=${e.target.value}` : ''}`)}
          >
            <option value="">Sample deal (3 communities)</option>
            {deals.map((d) => (
              <option key={d.quoteId} value={d.quoteId}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <span className={`ml-auto text-xs ${state === 'error' ? 'text-[#9A2E1C]' : 'text-teton-ui-gray'}`} role="status">
          {!template.canEdit ? 'View only (a private template)' : state === 'saving' ? 'Saving…' : state === 'error' ? text.error ?? 'Couldn’t save' : 'All changes saved'}
        </span>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)_260px]">
        {/* Left: pages and sections that were removed, to add back. */}
        <aside className="hidden xl:block border-r border-teton-off-white bg-white p-3 xl:sticky xl:top-[57px] xl:self-start xl:max-h-[calc(100dvh-57px)] xl:overflow-y-auto">
          {template.canEdit ? <RemovedPanel /> : <p className="text-xs text-teton-ui-gray">This template is private to {template.owner.name}. Duplicate it from the Templates page to make your own.</p>}
          <p className="mt-3 text-[11px] text-teton-ui-gray">Hover a page for move / remove, or between pages to add one.</p>
        </aside>
        <div className="proposal-page min-w-0 bg-teton-almost-white py-4">
          <div className="relative max-w-[8.5in] mx-auto">
            <BusinessCaseDocument draft={preview.draft} outputs={preview.outputs} lines={preview.lines} versionNo={1} savedAt={null} />
          </div>
        </div>
        {/* Right: details. */}
        <aside className="border-t xl:border-t-0 xl:border-l border-teton-off-white bg-white p-4 space-y-4 xl:sticky xl:top-[57px] xl:self-start">
          <div>
            <span className={eyebrow}>Persona</span>
            <div className="flex flex-wrap gap-1.5">
              {[...PERSONAS].map((p) => (
                <button key={p} type="button" disabled={!template.canEdit} aria-pressed={meta.persona === p} className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold transition-colors disabled:cursor-default ${meta.persona === p ? 'bg-teton-ink border-teton-ink text-white' : 'border-teton-pale-gray hover:bg-teton-almost-white'}`} onClick={() => void saveMeta({ persona: p })}>
                  {p}
                </button>
              ))}
            </div>
            {!PERSONAS.includes(meta.persona as (typeof PERSONAS)[number]) && meta.persona && <p className="mt-1 text-xs text-teton-ui-gray">Persona: {meta.persona}</p>}
          </div>
          <div>
            <label className={eyebrow} htmlFor="tpl-description">Description</label>
            <textarea
              id="tpl-description"
              className="input-field w-full text-[13px] resize-none"
              rows={2}
              maxLength={300}
              readOnly={!template.canEdit}
              value={meta.description}
              placeholder="What it leads with"
              onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))}
              onBlur={() => meta.description !== template.description && void saveMeta({ description: meta.description })}
            />
          </div>
          <div>
            <span className={eyebrow}>Placeholders</span>
            <p className="text-xs text-teton-dark-gray leading-relaxed">
              Type these in any text; each deal shows its own:{' '}
              {PLACEHOLDERS.map(([k, label]) => (
                <code key={k} className="mr-1 rounded bg-[#E5EEFC] px-1 text-[11px] text-[#1F5FB5]" title={label}>
                  {`{${k}}`}
                </code>
              ))}
            </p>
          </div>
          <div>
            <span className={eyebrow}>Who can use it</span>
            <SegGroup role="group" label="Who can use it" thumbClass="bg-white shadow-sm" className="flex rounded-lg bg-teton-almost-white p-0.5 text-xs">
              {(
                [
                  [false, 'Just me'],
                  [true, 'Everyone'],
                ] as const
              ).map(([v, label]) => (
                <button key={label} type="button" disabled={!isOwner} aria-pressed={meta.shared === v} className={`flex-1 px-2 py-1.5 rounded-md font-semibold transition-colors duration-200 disabled:cursor-default ${meta.shared === v ? 'text-teton-ink' : 'text-teton-ui-gray hover:text-teton-ink'}`} onClick={() => void saveMeta({ shared: v })}>
                  {label}
                </button>
              ))}
            </SegGroup>
            {!isOwner && <p className="mt-1 text-[11px] text-teton-ui-gray">Only {template.owner.name} can change this.</p>}
          </div>
          <div>
            <span className={eyebrow}>Usage</span>
            <p className="text-xs text-teton-dark-gray">
              {template.usage ? `Used in ${template.usage} business case${template.usage === 1 ? '' : 's'}.` : 'Not used yet.'} Changes here don’t alter business cases already formatted from it.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
