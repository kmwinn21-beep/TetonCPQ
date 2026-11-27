'use client';

/**
 * The deal input form. Holds one QuoteDraft in react-hook-form, runs the
 * engine and guardrails on every change (client-side, for the live preview),
 * autosaves the draft, and freezes it as a version on demand — the server
 * recomputes outputs from the stored inputs when it freezes.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { runModel, type ModelInputs, type ModelResult } from '@/lib/model';
import { priceBook, SKU } from '@/lib/pricing/catalog';
import { evaluateGuardrails, type GuardrailResult } from '@/lib/pricing/guardrails';
import { normalizeDraft, type QuoteDraft } from '@/lib/quote/draft';
import { changeLines, diffDrafts } from '@/lib/quote/diff';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import type { QuoteEditorData, VersionSummary } from '@/lib/data/quotes';
import { CommunitiesSection } from './CommunitiesSection';
import { ImplementationSection } from './ImplementationSection';
import { TermsSection } from './TermsSection';
import { ResourcesSection } from './ResourcesSection';
import { RailSlotContext, type RailSlot } from './RailSlot';
import { FloorPlansProvider } from './FloorPlans';
import { KpiPreview, VersionsPanel } from './ResultsRail';
import { carryScope, describeScope, scopeChanges } from '@/lib/quote/scopeWork';
import { NotificationsPanel } from './NotificationsPanel';
import { InputCommentsButton, InputCommentsProvider } from './InputComments';
import { TasksPanel } from './TasksPanel';
import { ScrollRow } from '@/components/form/ScrollRow';
import { SectionsMenu } from './SectionsMenu';
import { AccessContext, useAccess } from './AccessContext';
import { CollaboratorsPanel } from './CollaboratorsPanel';
import { FloorPlansPanel } from './FloorPlansPanel';
import { DealDetailsPanel } from './DealDetailsPanel';
import type { DealAccess } from '@/lib/data/access';
import { CaseSetupSection, CfoSection, ClientSection, MetricsSection, PricingSection, ScheduleSection, ValuationSection } from './sections';
import { revealInvalidSections, SectionsProvider, useSections } from '@/components/form/SectionsContext';
import { Collapse, ReadOnlyContext, SectionGroup } from '@/components/form/fields';
import { usePersistedOpen } from '@/components/Sidebar';
import { canAutoFocus } from '@/lib/client/focus';
import { DealLinkButtons } from './DealLinkButtons';
import { DealNavigator, PageDots } from './DealNavigator';
import { DealMenu } from './DealMenu';
import { ArchivedBanner } from './ArchivedBanner';
import { OPEN_PANEL } from './panelNav';
import { SegGroup } from '@/components/form/SegGroup';
import { AgreementAlert, useDealAgreement } from './AgreementAlert';

type RailTab = 'summary' | 'details' | 'tasks' | 'versions';
const TAB_OF: Record<string, RailTab> = { collaborators: 'details', 'deal-details': 'details', 'floor-plans': 'details', tasks: 'tasks', notifications: 'tasks', 'live-preview': 'summary', 'version-history': 'versions' };

/** Summary · Details · Tasks · Versions over the right panel (Versions shows a dot while there are unsaved changes). */
function RailTabs({ tab, onTab, unsaved }: { tab: RailTab; onTab: (t: RailTab) => void; unsaved: number }) {
  const tabs: Array<[RailTab, string]> = [['summary', 'Summary'], ['details', 'Details'], ['tasks', 'Tasks'], ['versions', 'Versions']];
  return (
    <SegGroup label="Panel" className="relative flex rounded-[11px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white shadow-sm rounded-[8px]">
      {tabs.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={tab === v} onClick={() => onTab(v)} className={`relative z-[1] flex-1 h-8 rounded-[8px] text-[12.5px] transition-colors duration-200 ${tab === v ? 'font-semibold text-teton-ink' : 'text-[#4E5562] hover:text-teton-ink'}`}>
          {l}
          {v === 'versions' && unsaved > 0 && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[#E2A72B] align-middle" aria-label={`${unsaved} unsaved`} />}
        </button>
      ))}
    </SegGroup>
  );
}

const navLink = (active: boolean) => `block px-3 py-1.5 rounded-md hover:bg-teton-off-white ${active ? 'text-teton-ink font-medium' : 'text-teton-dark-gray'}`;

const NAV = [
  ['pricing', 'Products & Pricing'],
  ['communities', 'Communities'],
  ['implplan', 'Implementation'],
  ['resources', 'Resource allocation'],
  ['terms', 'Terms / Notes'],
] as const;

/** Sections inside the collapsible Assumptions group. */
const ASSUMPTIONS_NAV = [
  ['case', 'ROI Case Setup'],
  ['schedule', 'ROI Timeline / Ramp'],
  ['valuation', 'Valuation & margin'],
  ['metrics', 'Improvement metrics'],
  ['revenue', 'Revenue'],
  ['movein', 'Move-in impact'],
  ['falls', 'Falls'],
  ['staffing', 'Night staffing'],
  ['cfo', 'CFO inputs'],
] as const;

type SaveState = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

/** Sections start collapsed; each header shows a one-line summary. */
export function QuoteEditor({ initial, access }: { initial: QuoteEditorData; access: DealAccess }) {
  return (
    <SectionsProvider defaultOpen={false}>
      <AccessContext.Provider value={access}>
        <QuoteEditorBody initial={initial} />
      </AccessContext.Provider>
    </SectionsProvider>
  );
}

function QuoteEditorBody({ initial }: { initial: QuoteEditorData }) {
  const sections = useSections();
  const assumptionsOpen = sections.isOpen('assumptions');
  // The sticky header's height, as --hdr-h on the form (it grows with the unsaved-changes bar).
  const headerRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const h = headerRef.current;
    const f = formRef.current;
    if (!h || !f) return;
    const set = () => f.style.setProperty('--hdr-h', `${h.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(h);
    return () => ro.disconnect();
  }, []);
  // The right panel's tabs (a panel opened from the phone menu switches to its tab).
  const [railTab, setRailTab] = useState<RailTab>('summary');
  useEffect(() => {
    const on = (e: Event) => setRailTab(TAB_OF[(e as CustomEvent<string>).detail] ?? 'summary');
    window.addEventListener(OPEN_PANEL, on);
    return () => window.removeEventListener(OPEN_PANEL, on);
  }, []);
  // The section menu beside the form: collapsed by default, remembered per browser.
  const [navOpen, setNavOpen] = usePersistedOpen('teton.sectionNav.open', true);
  // The rail column can host the Communities editor panel (wide screens only; below xl the rail sits under the form).
  const [railEl, setRailEl] = useState<HTMLDivElement | null>(null);
  const [railActive, setRailActive] = useState(false);
  const [railBeside, setRailBeside] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const on = () => setRailBeside(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const railSlot = useMemo<RailSlot>(() => ({ el: railBeside ? railEl : null, setActive: setRailActive }), [railBeside, railEl]);
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
  const access = useAccess();
  // Edit Inputs or Edit Scope: the draft can change (the server checks what changed against what's allowed).
  const canEdit = access.inputs || access.scope;
  const agreement = useDealAgreement(initial.quoteId);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const lastSaved = useRef(JSON.stringify(initial.draft));
  // The draft revision this tab last saw; the server refuses saves based on an older one.
  const baseRev = useRef<string | null>(initial.draftUpdatedAt);
  const conflicted = useRef(false);
  const putDraft = useCallback(async (snapshot: string): Promise<boolean> => {
    const res = await fetch(`/api/quotes/${initial.quoteId}/draft`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draft: JSON.parse(snapshot), baseUpdatedAt: baseRev.current }),
    });
    if (res.status === 409) {
      conflicted.current = true;
      setSaveState('conflict');
      return false;
    }
    if (!res.ok) {
      setSaveState('error');
      return false;
    }
    baseRev.current = (await res.json()).updatedAt;
    lastSaved.current = snapshot;
    return true;
  }, [initial.quoteId]);
  useEffect(() => {
    const snapshot = JSON.stringify(values);
    if (conflicted.current || !canEdit) return;
    if (snapshot === lastSaved.current) {
      // Edited and then put back before the autosave fired: nothing to save.
      setSaveState((st) => (st === 'pending' ? 'saved' : st));
      return;
    }
    setSaveState('pending');
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        if (await putDraft(snapshot)) setSaveState(JSON.stringify(getValues()) === snapshot ? 'saved' : 'pending');
      } catch {
        setSaveState('error');
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [values, getValues, putDraft, canEdit]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState !== 'saved') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  // ---- save version ----
  const [versions, setVersions] = useState<VersionSummary[]>(initial.versions);
  const latestSaved = versions.filter((v) => v.status !== 'draft').sort((a, b) => b.versionNo - a.versionNo)[0];
  // The version the draft is based on; unsaved changes are measured against it.
  const [active, setActive] = useState<{ id: number | null; inputs: QuoteDraft | null }>({ id: initial.activeVersionId, inputs: initial.activeInputs });
  const activeVersion = versions.find((v) => v.id === active.id) ?? latestSaved;
  const pending = useMemo(() => {
    if (!active.inputs) return [];
    try {
      return changeLines(diffDrafts(normalizeDraft(active.inputs), normalizeDraft(deferred)));
    } catch {
      return [];
    }
  }, [active.inputs, deferred]);
  const [changesOpen, setChangesOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const { reset } = methods;
  /** Load the server's editor state after a save or a Make Active: versions, the active one and (optionally) the draft. */
  const adopt = useCallback(
    (editor: QuoteEditorData, withDraft: boolean) => {
      setVersions(editor.versions);
      setDraftNo(editor.draftVersionNo);
      setActive({ id: editor.activeVersionId, inputs: editor.activeInputs });
      baseRev.current = editor.draftUpdatedAt;
      if (withDraft) {
        lastSaved.current = JSON.stringify(editor.draft);
        reset(editor.draft);
        setSaveState('saved');
      }
    },
    [reset],
  );
  async function removeVersion(v: VersionSummary) {
    setActivating(true);
    setVersionError(null);
    try {
      const res = await fetch(`/api/quotes/${initial.quoteId}/versions/${v.id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      // The draft is untouched; only the list and the active version change.
      adopt(body.editor, false);
    } catch (e) {
      setVersionError(e instanceof Error ? e.message : 'Could not delete that version');
    } finally {
      setActivating(false);
    }
  }
  // Scope work in the draft that isn't in the active version (rooms tagged, rooms, sensors), in words.
  const scopeLost = useMemo(() => {
    if (!active.inputs) return [];
    try {
      return scopeChanges(normalizeDraft(active.inputs), normalizeDraft(deferred)).map(describeScope);
    } catch {
      return [];
    }
  }, [active.inputs, deferred]);
  // Make Active with unsaved changes asks first (and offers to keep the scope work).
  const [activateAsk, setActivateAsk] = useState<VersionSummary | null>(null);
  async function makeActive(v: VersionSummary, confirmed?: 'all' | 'keepScope') {
    if (pending.length && !confirmed) return setActivateAsk(v);
    setActivateAsk(null);
    const before = getValues();
    setActivating(true);
    setVersionError(null);
    try {
      const res = await fetch(`/api/quotes/${initial.quoteId}/versions/${v.id}/activate`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      adopt(body.editor, true);
      // Keep the scope work: the newly active version's inputs with this draft's room types (autosaves).
      if (confirmed === 'keepScope') reset(carryScope(normalizeDraft(body.editor.draft), normalizeDraft(before)));
      setChangesOpen(false);
    } catch (e) {
      setVersionError(e instanceof Error ? e.message : 'Could not make that version active');
    } finally {
      setActivating(false);
    }
  }
  const [draftNo, setDraftNo] = useState(initial.draftVersionNo);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [versionError, setVersionError] = useState<string | null>(null);
  const [savingVersion, setSavingVersion] = useState(false);

  async function saveVersion(noteOverride?: string) {
    setVersionError(null);
    if (Array.isArray(getValues('products')) && !getValues('products')!.length) {
      setVersionError('Add a product in Products & Pricing first.');
      setNoteOpen(false);
      sections.setOpen('pricing', true);
      return;
    }
    if (!(await trigger())) {
      setVersionError('Fix the highlighted fields first.');
      setNoteOpen(false);
      // Fields in collapsed sections are hidden, not removed: open those sections and scroll to the first.
      requestAnimationFrame(() => revealInvalidSections(sections.setOpen));
      return;
    }
    setSavingVersion(true);
    try {
      const draft = getValues();
      const res = await fetch(`/api/quotes/${initial.quoteId}/versions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: noteOverride ?? note, draft, baseUpdatedAt: baseRev.current }),
      });
      const body = await res.json();
      if (res.status === 409) {
        conflicted.current = true;
        setSaveState('conflict');
        throw new Error(body.error);
      }
      if (!res.ok) throw new Error(body.error);
      lastSaved.current = JSON.stringify(draft);
      setSaveState('saved');
      adopt(body.editor, false);
      setNote('');
      setNoteOpen(false);
      setScopePrompt(null);
      setChangesOpen(false);
    } catch (e) {
      setVersionError(e instanceof Error ? e.message : 'Could not save the version');
    } finally {
      setSavingVersion(false);
    }
  }

  /** Back to the active version: the draft takes its inputs again (and autosaves). */
  function discardChanges(keepScope = false) {
    if (!active.inputs) return;
    setVersionError(null);
    const base = normalizeDraft(active.inputs);
    reset(keepScope ? carryScope(base, normalizeDraft(getValues())) : base);
    setChangesOpen(false);
    if (!keepScope) setScopePrompt(null);
  }
  // Closing the floor plan viewer after scope counts changed: offer to save a version (until saved or dismissed).
  const [scopePrompt, setScopePrompt] = useState<string | null>(null);

  // Flush any unsaved edits before leaving, so results show exactly what's on screen.
  const router = useRouter();
  async function viewResults() {
    const snapshot = JSON.stringify(getValues());
    if (snapshot !== lastSaved.current && !conflicted.current) {
      setSaveState('saving');
      if (!(await putDraft(snapshot))) return;
      setSaveState('saved');
    }
    router.push(`/quotes/${initial.quoteId}/results`);
  }

  const statusText: Record<SaveState, string> = { saved: 'All changes saved', pending: 'Unsaved changes…', saving: 'Saving…', error: 'Couldn’t save — retrying on next change', conflict: 'Not saved — changed elsewhere' };

  return (
    <FormProvider {...methods}>
      <FloorPlansProvider quoteId={initial.quoteId} onScopeChange={(t) => canEdit && setScopePrompt(t)}>
      <ReadOnlyContext.Provider value={!access.inputs}>
      <InputCommentsProvider quoteId={initial.quoteId} activeVersionId={activeVersion?.id ?? null} activeVersionNo={activeVersion?.versionNo ?? null} draft={!activeVersion || pending.length > 0}>
      <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="max-w-[1600px] mx-auto [&_section[id]]:scroll-mt-[calc(var(--hdr-h,0px)+16px)]" noValidate>
        {/* Always in view: the page scrolls behind it. Its height feeds --hdr-h, so the menus and panel stick below it. */}
        <header
          ref={headerRef}
          className="sticky -top-4 lg:-top-6 z-30 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-4 -mx-4 px-4 -mt-4 pt-4 lg:-mx-6 lg:px-6 lg:-mt-6 lg:pt-6 pb-3 bg-teton-almost-white/95 backdrop-blur border-b border-teton-off-white"
        >
          <div className="min-w-0 basis-full sm:basis-0 flex-1">
            <Link href="/deals" className="text-xs text-teton-ui-gray hover:underline">← Deals</Link>
            <input
              className="block w-full max-w-xl mt-1 text-2xl font-semibold bg-transparent border-b border-transparent hover:border-teton-pale-gray focus:border-brand-accent focus:outline-none"
              aria-label="Customer name"
              readOnly={!access.inputs}
              {...register('customerName', { required: 'Customer name is required' })}
            />
            <p className="text-sm text-teton-ui-gray mt-1">
              {access.archived && <span className="mr-2 inline-flex h-5 items-center rounded-[5px] bg-[#ECEAE6] px-1.5 text-[10.5px] font-bold tracking-wide text-[#5A6270] align-[1px]">ARCHIVED</span>}
              Draft v{draftNo} · <span className={saveState === 'error' || saveState === 'conflict' ? 'bg-teton-red/30 rounded px-1 text-teton-ink' : ''}>{statusText[saveState]}</span>
            </p>
            {saveState === 'conflict' && (
              <div role="alert" className="mt-2 flex flex-wrap items-center gap-3 rounded-lg bg-teton-red/30 px-3 py-2 text-sm">
                <span>This deal was changed in another tab or by someone else since you opened it. Edits made here since then weren’t saved, so nothing was overwritten.</span>
                <button type="button" className="btn-primary py-1" onClick={() => window.location.reload()}>Reload latest</button>
              </div>
            )}
          </div>
          {/* Phones: the buttons scroll sideways (with ‹ › when there are more) instead of widening the page. */}
          <ScrollRow className="w-full sm:w-auto" label="Deal actions">
            <InputCommentsButton />
            <button type="button" className="btn-secondary" onClick={viewResults} disabled={!values.communities?.length} aria-label="View results"><span className="sm:hidden">Results</span><span className="hidden sm:inline">View results</span></button>
            {/* Proposals are made from saved versions: the latest one. */}
            {activeVersion ? (
              <Link href={`/proposal/${activeVersion.id}`} className="btn-secondary whitespace-nowrap text-center" title={`The proposal for v${activeVersion.versionNo}, the active version`}>
                <span className="sm:hidden">Proposal</span><span className="hidden sm:inline">View proposal</span>
              </Link>
            ) : (
              <button type="button" className="btn-secondary whitespace-nowrap" disabled title="Save a version first: proposals are made from saved versions">
                <span className="sm:hidden">Proposal</span><span className="hidden sm:inline">View proposal</span>
              </button>
            )}
            <DealLinkButtons quoteId={initial.quoteId} />
            {!noteOpen && (
              <>
                {pending.length > 0 && (
                  <button type="button" className="btn-secondary whitespace-nowrap" aria-expanded={changesOpen} aria-controls="pending-changes" onClick={() => setChangesOpen(!changesOpen)}>
                    View changes ({pending.length})
                  </button>
                )}
                {canEdit && <button type="button" className="btn-primary" onClick={() => setNoteOpen(true)} disabled={!values.communities?.length} aria-label="Save version"><span className="sm:hidden">Save</span><span className="hidden sm:inline">Save version</span></button>}
              </>
            )}
            <DealMenu quoteId={initial.quoteId} dealName={values.customerName ?? ''} />
          </ScrollRow>
          {noteOpen && (
            <div className="flex w-full sm:w-auto flex-wrap items-start gap-2 drawer-in">
              <input autoFocus={canAutoFocus()} className="input-field w-full sm:w-72" placeholder={`Proposal name (optional) — v${draftNo}`} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Proposal name" maxLength={80} />
              <button type="button" className="btn-primary" onClick={() => void saveVersion()} disabled={savingVersion}>{savingVersion ? 'Saving…' : `Save v${draftNo}`}</button>
              <button type="button" className="btn-ghost py-2" onClick={() => setNoteOpen(false)}>Cancel</button>
            </div>
          )}
          {versionError && <p className="w-full text-sm bg-teton-red/30 rounded px-2 py-1">{versionError}</p>}
          {access.archived && <ArchivedBanner quoteId={initial.quoteId} info={access.archived} canUnarchive={access.isOwner || access.isAdmin} />}
          {!access.inputs && !access.archived && (
            <div className="w-full flex items-center gap-2 rounded-lg bg-teton-pale-yellow border border-[#F0D58A] px-3 py-2 text-sm" role="status">
              <span aria-hidden="true">🔒</span>
              <span>
                {access.scope ? (
                  <><b>You can edit the scope.</b> Room types (Scope Mode and the room type cards) are yours to change; the rest of the deal is view only.</>
                ) : (
                  <><b>View only.</b> {access.owner?.name ?? 'The owner'} owns this deal. Ask them to add you as a collaborator to make changes. You can still add floor plan notes and comments.</>
                )}
              </span>
            </div>
          )}
          {/* Unsaved changes since the active version, like the proposal's change bar. */}
          {pending.length > 0 && (
            <div className="w-full rounded-lg bg-teton-pale-yellow px-3 py-2 text-sm drawer-in" role="status">
              <p>
                <span className="inline-block w-2 h-2 rounded-full bg-[#E2A72B] mr-2 align-middle" aria-hidden="true" />
                <b>{pending.length} unsaved {pending.length === 1 ? 'change' : 'changes'}</b> since {activeVersion ? (activeVersion.changeNote || `v${activeVersion.versionNo}`) : 'the last version'}. {pending.length === 1 ? 'Save a version to keep it, or it’ll be discarded.' : 'Save a version to keep them, or they’ll be discarded.'}
              </p>
              <Collapse open={changesOpen} id="pending-changes">
                <ul className="list-disc pl-9 pt-1.5 space-y-0.5 text-[13px] text-teton-dark-gray">
                  {pending.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </Collapse>
            </div>
          )}
          {Object.keys(formState.errors).length > 0 && !versionError && (
            <p className="w-full text-sm bg-teton-pale-yellow rounded px-2 py-1">Some fields need attention — they’re highlighted below.</p>
          )}
        </header>
        <AgreementAlert ag={agreement.data} act={agreement.act} canEdit={access.inputs} />

        {/* The inputs and the right panel share the room 1.75 : 1, so both widen when the menus collapse. */}
        <div
          className={`grid gap-6 grid-cols-1 transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none ${
            navOpen ? 'xl:grid-cols-[230px_minmax(0,1.75fr)_minmax(300px,1fr)]' : 'xl:grid-cols-[32px_minmax(0,1.75fr)_minmax(300px,1fr)]'
          }`}
        >
          <nav className="hidden xl:block min-w-0" aria-label="Form sections">
            <div className="sticky top-[calc(var(--hdr-h,0px)+8px)] text-sm">
              <button
                type="button"
                onClick={() => setNavOpen(!navOpen)}
                aria-expanded={navOpen}
                aria-controls="form-section-menu"
                aria-label={navOpen ? 'Collapse the section menu' : 'Expand the section menu'}
                title={navOpen ? 'Collapse the menu' : 'Sections'}
                className="mb-1 flex items-center gap-2 h-8 px-2 rounded-md text-teton-ui-gray hover:bg-teton-off-white hover:text-teton-ink"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={navOpen ? 'M11 19l-7-7 7-7m8 14l-7-7 7-7' : 'M4 6h16M4 12h16M4 18h10'} />
                </svg>
                <span className={`text-xs font-medium whitespace-nowrap overflow-hidden transition-[opacity,max-width] duration-300 ${navOpen ? 'opacity-100 max-w-[8rem]' : 'opacity-0 max-w-0'}`}>Sections</span>
              </button>
              <div
                id="form-section-menu"
                className={`transition-[opacity,transform] duration-300 ease-out ${navOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'}`}
                {...((navOpen ? {} : { inert: '' }) as Record<string, string>)}
              >
              <DealNavigator
                isOpen={sections.isOpen}
                onGo={(id) => {
                  sections.setOpen(id, true);
                  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 60);
                }}
                assumptions={ASSUMPTIONS_NAV}
                assumptionsOpen={assumptionsOpen}
                onToggleAssumptions={() => sections.setOpen('assumptions', !assumptionsOpen)}
                onGoAssumption={(id) => {
                  sections.setOpen(id, true);
                  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), assumptionsOpen ? 16 : 320);
                  sections.setOpen('assumptions', true);
                }}
              />
              </div>
            </div>
          </nav>

          <div className="relative space-y-4 min-w-0">
            {/* Phones: Expand all on the left, and ☰ (jump to a section or panel card) on the right. */}
            <div className="flex items-center justify-between sm:justify-end -mb-1">
              <button type="button" className="btn-ghost max-sm:-ml-2" onClick={() => sections.setAll(!sections.allOpen)} aria-label={sections.allOpen ? 'Collapse all sections' : 'Expand all sections'}>
                {sections.allOpen ? 'Collapse all' : 'Expand all'}
              </button>
              <SectionsMenu
                inputs={NAV}
                assumptions={ASSUMPTIONS_NAV}
                onInput={(id, inGroup) => {
                  sections.setOpen(id, true);
                  if (inGroup) sections.setOpen('assumptions', true);
                  // Wait for the Assumptions group to expand when it was closed.
                  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), inGroup && !assumptionsOpen ? 340 : 60);
                }}
              />
            </div>
            <PricingSection inputs={computed.inputs} result={computed.result} book={book} />
            <RailSlotContext.Provider value={railSlot}>
              <CommunitiesSection inputs={computed.inputs} result={computed.result} book={book} />
            </RailSlotContext.Provider>
            <ImplementationSection inputs={computed.inputs} result={computed.result} book={book} />
            <ResourcesSection inputs={computed.inputs} result={computed.result} book={book} />
            <TermsSection inputs={computed.inputs} result={computed.result} book={book} />
            <SectionGroup id="assumptions" title="Assumptions" summary="ROI case, ROI timeline, valuation, improvement metrics, client revenue, move-in, falls, night staffing and CFO inputs">
              <CaseSetupSection />
              <ScheduleSection inputs={computed.inputs} result={computed.result} book={book} />
              <ValuationSection />
              <MetricsSection inputs={computed.inputs} result={computed.result} book={book} />
              <ClientSection inputs={computed.inputs} result={computed.result} book={book} />
              <CfoSection inputs={computed.inputs} result={computed.result} book={book} />
            </SectionGroup>
            <PageDots ids={[...NAV, ['assumptions', 'Assumptions']]} />
          </div>

          <aside className="space-y-4 min-w-0">
            {/* The panel scrolls with the page. This spacer is the "Expand all" row over the form (same element and size),
                so Collaborators' top edge lines up with the first section's. */}
            <div className="hidden xl:flex justify-end -mb-1 invisible" aria-hidden="true">
              <button type="button" tabIndex={-1} className="btn-ghost">Expand all</button>
            </div>
            {/* The Communities editor panel renders here on wide screens, in place of the results. */}
            <div ref={setRailEl} className={railActive && railBeside ? '' : 'hidden'} />
            <div className={railActive && railBeside ? 'hidden' : 'space-y-4 rail-back'}>
              <RailTabs tab={railTab} onTab={setRailTab} unsaved={pending.length} />
              <div className={railTab === 'details' ? 'space-y-4' : 'hidden'}>
              <CollaboratorsPanel />
              <DealDetailsPanel quoteId={initial.quoteId} prospectUpdated={!!agreement.data?.open && (agreement.data.open.payload.entity.status === 'updated' || agreement.data.open.payload.signatory.status === 'updated')} />
              <FloorPlansPanel />
              </div>
              <div className={railTab === 'tasks' ? 'space-y-4' : 'hidden'}>
              <TasksPanel quoteId={initial.quoteId} />
              <NotificationsPanel />
              </div>
              <div className={railTab === 'summary' ? 'space-y-4' : 'hidden'}>
              <KpiPreview result={computed.result} error={computed.error} draft={deferred} inputs={computed.inputs} book={book} />
              </div>
              <div className={railTab === 'versions' ? 'space-y-4' : 'hidden'}>
              <VersionsPanel
                agreement={agreement.data}
                versions={versions}
                quoteId={initial.quoteId}
                activeId={active.id}
                busy={activating}
                onMakeActive={(v) => void makeActive(v)}
                onDelete={removeVersion}
                readOnly={!access.inputs}
                unsaved={
                  pending.length && active.inputs
                    ? {
                        draftNo,
                        changes: pending,
                        inv: computed.result?.kpis.totalInvestment12 ?? null,
                        net: computed.result?.kpis.netBenefit12 ?? null,
                        was: activeVersion ? { inv: activeVersion.totalInvestment12, net: activeVersion.netBenefit12 } : null,
                        saving: savingVersion,
                        onSave: () => void saveVersion(),
                        onDiscard: () => discardChanges(false),
                        scopeLost,
                        onDiscardKeepScope: () => discardChanges(true),
                      }
                    : null
                }
              />
              </div>
            </div>
          </aside>
        </div>
      </form>
      </InputCommentsProvider>
      {/* After scoping: save it as a version so the proposal includes it. */}
      {scopePrompt && pending.length > 0 && (
        <div className="fixed inset-x-3 bottom-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[min(640px,calc(100vw-2rem))] z-40 rounded-xl bg-teton-near-black text-white shadow-xl px-4 py-3 text-sm drawer-in" role="status">
          <p>
            <b>Scope updated:</b> {scopePrompt}. Save it as v{draftNo} so the proposal includes it?
          </p>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button type="button" className="rounded-md border border-white/30 px-3 py-1.5 text-xs hover:bg-white/10" onClick={() => setScopePrompt(null)}>Later</button>
            <button type="button" className="rounded-md bg-white text-teton-ink px-3 py-1.5 text-xs font-semibold disabled:opacity-50" disabled={savingVersion} onClick={() => void saveVersion('Scope update')}>
              {savingVersion ? 'Saving…' : `Save as v${draftNo}`}
            </button>
          </div>
        </div>
      )}
      {/* Make Active with unsaved changes: name what goes, and offer to keep the scope work. */}
      {activateAsk && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true" aria-label="Make active" onClick={() => setActivateAsk(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl [animation:fadeScale_.2s_ease-out] motion-reduce:[animation:none]" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold">Make {activateAsk.changeNote || `v${activateAsk.versionNo}`} active?</p>
            <p className="mt-1 text-sm text-teton-dark-gray">
              Your {pending.length} unsaved {pending.length === 1 ? 'change' : 'changes'} will be discarded.
            </p>
            {scopeLost.length > 0 && (
              <div className="mt-2 rounded-lg bg-[#FFF6DD] border border-[#E9C46A] px-3 py-2 text-sm">
                <p className="font-medium text-[#7A5200]">That includes scope work:</p>
                <ul className="list-disc pl-5 text-[13px] text-teton-dark-gray">
                  {scopeLost.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
            )}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost py-1.5 text-sm" onClick={() => setActivateAsk(null)}>Cancel</button>
              {scopeLost.length > 0 && (
                <button type="button" className="btn-secondary py-1.5 text-sm" onClick={() => void makeActive(activateAsk, 'keepScope')}>Keep scope work</button>
              )}
              <button type="button" className="py-1.5 px-3 rounded-md bg-[#C2412D] text-white text-sm font-medium" onClick={() => void makeActive(activateAsk, 'all')}>
                {scopeLost.length ? 'Discard everything' : 'Make active'}
              </button>
            </div>
          </div>
        </div>
      )}
      </ReadOnlyContext.Provider>
      </FloorPlansProvider>
    </FormProvider>
  );
}
