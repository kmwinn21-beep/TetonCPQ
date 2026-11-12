'use client';

/**
 * The deal input form. Holds one QuoteDraft in react-hook-form, runs the
 * engine and guardrails on every change (client-side, for the live preview),
 * autosaves the draft, and freezes it as a version on demand — the server
 * recomputes outputs from the stored inputs when it freezes.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { runModel, type ModelInputs, type ModelResult } from '@/lib/model';
import { priceBook, SKU } from '@/lib/pricing/catalog';
import { evaluateGuardrails, type GuardrailResult } from '@/lib/pricing/guardrails';
import type { QuoteDraft } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import type { QuoteEditorData, VersionSummary } from '@/lib/data/quotes';
import { CommunitiesSection } from './CommunitiesSection';
import { GuardrailPanel, KpiPreview, VersionsPanel } from './ResultsRail';
import { CaseSetupSection, CfoSection, ClientSection, MetricsSection, PricingSection, ScheduleSection, ValuationSection } from './sections';

const NAV = [
  ['case', 'Case setup'],
  ['communities', 'Communities'],
  ['pricing', 'Pricing & products'],
  ['schedule', 'Timeline'],
  ['valuation', 'Valuation & margin'],
  ['metrics', 'Improvement metrics'],
  ['revenue', 'Revenue'],
  ['movein', 'Move-in impact'],
  ['falls', 'Falls'],
  ['staffing', 'Night staffing'],
  ['cfo', 'CFO inputs'],
] as const;

type SaveState = 'saved' | 'pending' | 'saving' | 'error';

export function QuoteEditor({ initial }: { initial: QuoteEditorData }) {
  const methods = useForm<QuoteDraft>({ defaultValues: initial.draft, mode: 'onChange' });
  const { control, getValues, register, trigger, formState } = methods;
  const book = useMemo(() => priceBook(initial.products), [initial.products]);

  const values = useWatch({ control }) as QuoteDraft;
  const deferred = useDeferredValue(values);
  const computed = useMemo((): { inputs: ModelInputs | null; result: ModelResult | null; guardrails: GuardrailResult | null; error: string | null } => {
    try {
      if (!deferred.communities?.length) return { inputs: null, result: null, guardrails: null, error: 'Add a community to see results.' };
      const inputs = toModelInputs(deferred);
      return {
        inputs,
        result: runModel(inputs),
        guardrails: evaluateGuardrails(deferred, book[SKU.platform]?.list, { ble: book[SKU.ecallBle]?.list ?? 10, inovonics: book[SKU.ecallInovonics]?.list ?? 15 }),
        error: null,
      };
    } catch (e) {
      return { inputs: null, result: null, guardrails: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [deferred, book]);

  // ---- autosave ----
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const lastSaved = useRef(JSON.stringify(initial.draft));
  useEffect(() => {
    const snapshot = JSON.stringify(values);
    if (snapshot === lastSaved.current) return;
    setSaveState('pending');
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        const res = await fetch(`/api/quotes/${initial.quoteId}/draft`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ draft: JSON.parse(snapshot) }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        lastSaved.current = snapshot;
        setSaveState(JSON.stringify(getValues()) === snapshot ? 'saved' : 'pending');
      } catch {
        setSaveState('error');
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [values, initial.quoteId, getValues]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState !== 'saved') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  // ---- save version ----
  const [versions, setVersions] = useState<VersionSummary[]>(initial.versions);
  const [draftNo, setDraftNo] = useState(initial.draftVersionNo);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [versionError, setVersionError] = useState<string | null>(null);
  const [savingVersion, setSavingVersion] = useState(false);

  async function saveVersion() {
    setVersionError(null);
    if (!(await trigger())) {
      setVersionError('Fix the highlighted fields first.');
      return;
    }
    setSavingVersion(true);
    try {
      const draft = getValues();
      const res = await fetch(`/api/quotes/${initial.quoteId}/versions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note, draft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      lastSaved.current = JSON.stringify(draft);
      setSaveState('saved');
      setVersions(body.editor.versions);
      setDraftNo(body.editor.draftVersionNo);
      setNote('');
      setNoteOpen(false);
    } catch (e) {
      setVersionError(e instanceof Error ? e.message : 'Could not save the version');
    } finally {
      setSavingVersion(false);
    }
  }

  // Flush any unsaved edits before leaving, so results show exactly what's on screen.
  const router = useRouter();
  async function viewResults() {
    const snapshot = JSON.stringify(getValues());
    if (snapshot !== lastSaved.current) {
      setSaveState('saving');
      const res = await fetch(`/api/quotes/${initial.quoteId}/draft`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draft: JSON.parse(snapshot) }) });
      if (!res.ok) {
        setSaveState('error');
        return;
      }
      lastSaved.current = snapshot;
      setSaveState('saved');
    }
    router.push(`/quotes/${initial.quoteId}/results`);
  }

  const statusText: Record<SaveState, string> = { saved: 'All changes saved', pending: 'Unsaved changes…', saving: 'Saving…', error: 'Couldn’t save — retrying on next change' };

  return (
    <FormProvider {...methods}>
      <form onSubmit={(e) => e.preventDefault()} className="max-w-[1600px] mx-auto" noValidate>
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div className="min-w-0 flex-1">
            <Link href="/deals" className="text-xs text-teton-ui-gray hover:underline">← Deals</Link>
            <input
              className="block w-full max-w-xl mt-1 text-2xl font-semibold bg-transparent border-b border-transparent hover:border-teton-pale-gray focus:border-brand-accent focus:outline-none"
              aria-label="Customer name"
              {...register('customerName', { required: 'Customer name is required' })}
            />
            <p className="text-sm text-teton-ui-gray mt-1">
              Draft v{draftNo} · <span className={saveState === 'error' ? 'bg-teton-red/30 rounded px-1 text-teton-ink' : ''}>{statusText[saveState]}</span>
            </p>
          </div>
          <div className="flex items-start gap-2">
            <button type="button" className="btn-secondary" onClick={viewResults} disabled={!values.communities?.length}>View results</button>
            {noteOpen ? (
              <div className="flex flex-wrap items-start gap-2">
                <input autoFocus className="input-field w-72" placeholder="What changed? (e.g. Sent to CFO, 50% install credit)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Version note" />
                <button type="button" className="btn-primary" onClick={saveVersion} disabled={savingVersion}>{savingVersion ? 'Saving…' : `Save v${draftNo}`}</button>
                <button type="button" className="btn-ghost py-2" onClick={() => setNoteOpen(false)}>Cancel</button>
              </div>
            ) : (
              <button type="button" className="btn-primary" onClick={() => setNoteOpen(true)} disabled={!values.communities?.length}>Save version</button>
            )}
          </div>
          {versionError && <p className="w-full text-sm bg-teton-red/30 rounded px-2 py-1">{versionError}</p>}
          {Object.keys(formState.errors).length > 0 && !versionError && (
            <p className="w-full text-sm bg-teton-pale-yellow rounded px-2 py-1">Some fields need attention — they’re highlighted below.</p>
          )}
        </header>

        <div className="grid gap-6 grid-cols-1 xl:grid-cols-[170px_minmax(0,1fr)_340px]">
          <nav className="hidden xl:block" aria-label="Form sections">
            <ul className="sticky top-0 space-y-0.5 text-sm">
              {NAV.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="block px-3 py-1.5 rounded-md text-teton-dark-gray hover:bg-teton-off-white">{label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-6 min-w-0">
            <CaseSetupSection />
            <CommunitiesSection inputs={computed.inputs} result={computed.result} book={book} />
            <PricingSection inputs={computed.inputs} result={computed.result} book={book} />
            <ScheduleSection inputs={computed.inputs} result={computed.result} book={book} />
            <ValuationSection />
            <MetricsSection inputs={computed.inputs} result={computed.result} book={book} />
            <ClientSection inputs={computed.inputs} result={computed.result} book={book} />
            <CfoSection inputs={computed.inputs} result={computed.result} book={book} />
          </div>

          <aside className="space-y-4 xl:sticky xl:top-0 xl:self-start xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto">
            <KpiPreview result={computed.result} error={computed.error} />
            <GuardrailPanel g={computed.guardrails} />
            <VersionsPanel versions={versions} quoteId={initial.quoteId} />
          </aside>
        </div>
      </form>
    </FormProvider>
  );
}
