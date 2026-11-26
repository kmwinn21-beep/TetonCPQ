'use client';

/**
 * Products & Pricing: the products on the deal (picked from the price book), each with its list and deal price, and
 * below them only the settings those products need. Implementation is always included and can be credited, not
 * removed. Adding or removing a product writes the draft fields the pricing engine reads (lib/quote/products).
 */
import { useContext, useEffect, useMemo, useState } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { POLICY, SKU, type PriceBook } from '@/lib/pricing/catalog';
import { placeOf } from '@/lib/pricing/markets';
import { scopeOf, type DraftCommunity, type QuoteDraft } from '@/lib/quote/draft';
import { addProducts, applyKit, dealProducts, hasImplementation, KITS, productsForSku, removeBlock, removeProduct, visibleSettings, type DealProduct } from '@/lib/quote/products';
import { usd } from '@/lib/format';
import { Collapse, DerivedField, ReadOnlyContext } from '@/components/form/fields';
import { NumInput } from '@/components/form/NumInput';
import { SwipeSheet, usePhone } from '@/components/form/SwipeSheet';
import { ItemIcon } from '@/components/catalog/ItemIcon';
import { InstallCreditChoice, Seg, Switch, SwitchButton, type FieldName } from './sections';

const money = (n: number | null | undefined) => (n == null || !Number.isFinite(Number(n)) ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
const eyebrow = 'text-[10.5px] font-semibold uppercase tracking-[.14em] text-[#8A919C]';

/** Totals across the communities (for "Applies to"). */
function counts(d: QuoteDraft) {
  const ecallOn = d.commercial.ecall !== 'none';
  const cs = d.communities ?? [];
  const sum = (f: (c: DraftCommunity) => number) => cs.reduce((s, c) => s + (Number(f(c)) || 0), 0);
  return {
    communities: cs.length,
    monitored: sum((c) => scopeOf(c, ecallOn).monitored),
    ecall: sum((c) => scopeOf(c, ecallOn).ecall),
    ecallOnly: sum((c) => scopeOf(c, ecallOn).ecallOnly),
    snf: sum((c) => (scopeOf(c, ecallOn).monitoredByCare.snf)),
    sensors: sum((c) => Number(c.additionalSensors)),
    commonArea: sum((c) => Number(c.commonAreaSensors)),
    pilotBeds: sum((c) => (c.pilot ? c.pilotUnits ?? scopeOf(c, ecallOn).monitored : 0)),
    rooms: sum((c) => scopeOf(c, ecallOn).priced),
  };
}

/** A price on a line or a setting: "$ [ 99 ]". */
function Price({ name, nullable, placeholder, suffix, label, list, pill = true }: { name: FieldName; nullable?: boolean; placeholder?: string; suffix?: string; label: string; list?: number | null; pill?: boolean }) {
  const { control } = useFormContext<QuoteDraft>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const v = field.value as number | null | undefined;
        const off = list != null && v != null && Math.abs(Number(v) - list) > 1e-9;
        return (
          <div className="flex items-center gap-2 min-w-0">
            <NumInput
              value={v}
              onChange={field.onChange}
              onBlur={field.onBlur}
              prefix="$"
              suffix={suffix}
              nullable={nullable}
              placeholder={placeholder}
              min={0}
              invalid={!!fieldState.error}
              aria-label={label}
              className={`${pill ? 'w-[118px]' : 'w-[112px]'} flex-shrink-0 ${off ? '' : '[&_input]:border-dashed'}`}
            />
            {off && pill && (
              <span className="hidden xl:inline-flex h-[22px] items-center px-2 rounded-[7px] bg-[#FBF0D9] text-[#9A6512] text-[11px] font-semibold whitespace-nowrap" title={`List ${money(list)}`}>
                {Number(v) < list! ? '−' : '+'}
                {money(Math.abs(Number(v) - list!))}
              </span>
            )}
          </div>
        );
      }}
    />
  );
}

interface Line {
  key: string;
  sku: string;
  name: string;
  unit: string;
  once: boolean;
  list: number | null;
  field?: FieldName;
  nullable?: boolean;
  placeholder?: string;
  suffix?: string;
  applies: string;
  product?: DealProduct;
  /** Implementation: always included (credit it, don't remove it). */
  locked?: boolean;
  /** Follows from other products (the bundle saving). */
  auto?: string;
  /** Shown instead of a price input. */
  text?: string;
}

function linesOf(d: QuoteDraft, ps: DealProduct[], book: PriceBook): Line[] {
  const k = d.commercial;
  const n = counts(d);
  const L = (sku: string) => book[sku];
  const name = (sku: string, fb: string) => L(sku)?.name ?? fb;
  const list = (sku: string) => L(sku)?.list ?? null;
  const beds = (x: number) => (n.communities ? `${x.toLocaleString('en-US')} beds` : 'all beds');
  const sub = ps.includes('subscription');
  const cx = ps.includes('capex');
  const ec = ps.includes('ecall');
  const ino = k.ecall === 'inovonics';
  const perRoom = k.ecallBilling !== 'device';
  const out: Line[] = [];
  if (sub) out.push({ key: 'sub', sku: SKU.platform, name: name(SKU.platform, 'Teton subscription'), unit: 'per bed / month', once: false, list: list(SKU.platform), field: 'commercial.platformRate', suffix: '/bed', applies: beds(n.monitored), product: 'subscription' });
  if (ps.includes('snf')) out.push({ key: 'snf', sku: SKU.snf, name: name(SKU.snf, 'Skilled nursing'), unit: 'per bed / month', once: false, list: list(SKU.snf), field: 'commercial.snfRate', nullable: true, placeholder: String(k.platformRate), suffix: '/bed', applies: beds(n.snf), product: 'snf' });
  if (ec) {
    const sku = ino ? SKU.ecallInovonics : SKU.ecallBle;
    out.push({ key: 'ecall', sku, name: name(sku, ino ? 'E-Call (Inovonics)' : 'E-Call (Bluetooth)'), unit: `per ${perRoom ? 'room' : 'device'} / month`, once: false, list: list(sku), field: 'commercial.ecallRate', suffix: perRoom ? '/room' : '/dev', applies: beds(n.ecall), product: 'ecall' });
  }
  if (sub && ec) {
    const sku = ino ? SKU.bundleInovonics : SKU.bundleBle;
    out.push({ key: 'bundle', sku, name: 'Bundle saving', unit: `${name(sku, 'Teton One + E-Call')} · off each bed with both, per month`, once: false, list: null, field: `commercial.bundleDiscount.${ino ? 'inovonics' : 'ble'}` as FieldName, nullable: true, placeholder: '0', suffix: '/bed', applies: 'beds with both', auto: 'With subscription + E-Call' });
  }
  if (hasImplementation(ps)) {
    if (sub) out.push({ key: 'impl', sku: SKU.install, name: name(SKU.install, 'Installation & implementation'), unit: 'per bed, one-time', once: true, list: list(SKU.install), field: 'commercial.installRate', applies: beds(n.monitored), locked: true });
    else if (ec && !cx) out.push({ key: 'impl', sku: SKU.install, name: 'E-Call installation & implementation', unit: 'per bed with E-Call only, one-time', once: true, list: null, field: 'commercial.ecallInstallRate', nullable: true, placeholder: '0', applies: beds(n.ecallOnly), locked: true });
    else out.push({ key: 'impl', sku: SKU.install, name: name(SKU.install, 'Installation & implementation'), unit: 'equipment purchase', once: true, list: null, applies: '', locked: true, text: 'Included in the base package' });
  }
  if (ps.includes('sensor')) out.push({ key: 'sensor', sku: SKU.sensor, name: name(SKU.sensor, 'Additional sensor'), unit: 'per sensor, one-time', once: true, list: list(SKU.sensor), field: sub || ec ? 'commercial.sensorPrice' : 'commercial.capex.sensorPrice', applies: `${n.sensors} sensors`, product: 'sensor' });
  if (ps.includes('commonArea')) {
    out.push({ key: 'ca1', sku: SKU.commonAreaSetup, name: name(SKU.commonAreaSetup, 'Common-area sensor setup'), unit: 'per sensor, one-time', once: true, list: list(SKU.commonAreaSetup), field: 'commercial.commonArea.setup', applies: `${n.commonArea} sensors`, product: 'commonArea' });
    out.push({ key: 'ca2', sku: SKU.commonAreaMonthly, name: name(SKU.commonAreaMonthly, 'Common-area sensor'), unit: 'per sensor / month', once: false, list: list(SKU.commonAreaMonthly), field: 'commercial.commonArea.monthly', suffix: '/mo', applies: `${n.commonArea} sensors`, auto: 'With common-area setup' });
  }
  if (cx) {
    out.push({ key: 'capex', sku: SKU.capexBase, name: name(SKU.capexBase, 'Base package (equipment purchase)'), unit: 'per bed, one-time · edge unit + sensor, installed', once: true, list: list(SKU.capexBase), field: 'commercial.capex.basePrice', applies: beds(n.monitored), product: 'capex' });
    const up = k.capex?.softwareBilling === 'upfront';
    const sku = up ? SKU.capexSoftwareUpfront : SKU.capexSoftware;
    out.push({ key: 'capexsw', sku, name: name(sku, 'Software & services'), unit: up ? 'per bed, upfront (4 years)' : 'per bed / month', once: up, list: list(sku), field: up ? 'commercial.capex.softwareUpfront' : 'commercial.capex.softwareRate', suffix: up ? undefined : '/bed', applies: beds(n.monitored), auto: 'With equipment purchase' });
  }
  if (ps.includes('finish')) out.push({ key: 'finish', sku: 'FINISH-CONCEALED-LOW', name: 'Concealed finish', unit: 'per room, quoted pending the site survey', once: true, list: null, applies: `${n.rooms} rooms`, product: 'finish', text: `${money(k.finish?.low)}–${money(k.finish?.high)} / room` });
  return out;
}

export function ProductsPricing({ book }: { book: PriceBook }) {
  const { control, getValues, setValue } = useFormContext<QuoteDraft>();
  const d = useWatch({ control }) as QuoteDraft;
  const readOnly = useContext(ReadOnlyContext);
  const ps = useMemo(() => dealProducts(d), [d]);
  const vis = visibleSettings(ps);
  const lines = linesOf(d, ps, book);
  const [picking, setPicking] = useState(false);
  const [implOpen, setImplOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const k = d.commercial;
  const n = counts(d);
  const pilot = !!d.schedule?.withPilot;

  /** Write a changed draft back to the form (only the parts products touch). */
  const write = (next: QuoteDraft) => {
    const cur = getValues();
    const o = { shouldDirty: true } as const;
    if (JSON.stringify(cur.products) !== JSON.stringify(next.products)) setValue('products', next.products, o);
    if (cur.presentation !== next.presentation) setValue('presentation', next.presentation, o);
    if (JSON.stringify(cur.commercial) !== JSON.stringify(next.commercial)) setValue('commercial', next.commercial, o);
    if (JSON.stringify(cur.schedule) !== JSON.stringify(next.schedule)) setValue('schedule', next.schedule, o);
    if (JSON.stringify(cur.communities) !== JSON.stringify(next.communities)) setValue('communities', next.communities, o);
  };
  const add = (skus: string[]) => {
    let next = getValues();
    for (const s of skus) {
      const m = productsForSku(s);
      if (m) next = addProducts(next, m.add, book, { ecall: m.ecall });
    }
    write(next);
    setErr(null);
  };
  const remove = (p: DealProduct) => {
    try {
      write(removeProduct(getValues(), p));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const hidden = [
    !vis.pilot && 'pilot',
    !vis.ecall && 'E-Call',
    !vis.capex && 'equipment purchase',
    !vis.introRate && 'introductory rate',
    !vis.finish && 'concealed finish',
    !vis.commonArea && 'common areas',
  ].filter(Boolean) as string[];

  if (!ps.length)
    return (
      <>
        <div className="text-center px-4 py-8">
          <span className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-[#EEEBFB] text-[#6E5BD0] grid place-items-center" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 9V3h6l6 6-6 6-6-6z" /><circle cx="5.5" cy="6" r="1" /></svg>
          </span>
          <p className="text-[15px] font-semibold">What’s in this deal?</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-[#6B7380]">
            Add products from the price book. Prices start at list, and <b className="text-teton-ink">implementation is included automatically</b> with the first platform product. Only the settings your products need appear here.
          </p>
          {!readOnly && (
            <>
              <button type="button" onClick={() => setPicking(true)} className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-teton-ink px-4 text-[13px] font-semibold text-white">
                ＋ Add product
              </button>
              <div className="mt-5 grid gap-2.5 sm:grid-cols-3 text-left max-w-3xl mx-auto">
                {KITS.map((kit) => (
                  <button
                    key={kit.id}
                    type="button"
                    onClick={() => write(applyKit(getValues(), kit.id, book))}
                    className={`rounded-xl px-3 py-2.5 text-left transition-colors ${kit.mostUsed ? 'border-[1.5px] border-[#6E5BD0] bg-[#F7F5FE] hover:bg-[#F0ECFD]' : 'border border-dashed border-[#D5D0C6] bg-[#FDFCFA] hover:bg-white'}`}
                  >
                    <b className="block text-[12.5px]">
                      {kit.label}
                      {kit.mostUsed && <span className="ml-1.5 align-[1px] whitespace-nowrap rounded-[5px] bg-[#EEEBFB] px-1.5 py-px text-[10px] font-bold text-[#6E5BD0]">MOST USED</span>}
                    </b>
                    <small className="mt-0.5 block text-[11.5px] leading-snug text-[#8A919C]">{kit.note}</small>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <Picker open={picking} onClose={() => setPicking(false)} book={book} have={ps} system={k.ecall} onAdd={add} />
      </>
    );

  return (
    <div className="space-y-5">
      {/* The products */}
      <div className="rounded-[14px] border border-[#ECE8DF] bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 h-11 bg-[#FBFAF7] border-b border-[#ECE8DF]">
          <p className={eyebrow}>Products</p>
          <span className="text-[12px] text-[#6B7380]">{ps.length + (hasImplementation(ps) ? 1 : 0)} on the deal</span>
          {!readOnly && (
            <button type="button" onClick={() => setPicking(true)} className="ml-auto h-8 rounded-[8px] bg-teton-ink px-3 text-[12px] font-semibold text-white">
              ＋ Add product
            </button>
          )}
        </div>
        <div className="hidden md:grid grid-cols-[28px_minmax(0,2fr)_78px_62px_124px_minmax(76px,.8fr)_26px] gap-3 items-center px-4 h-9 border-b border-[#ECE8DF] text-[10.5px] font-semibold uppercase tracking-[.12em] text-[#8A919C]">
          <span /><span>Product</span><span>Billing</span><span className="text-right">List</span><span>Deal price</span><span>Applies to</span><span />
        </div>
        {lines.map((l) => (
          <div key={l.key}>
            <div
              className={`grid grid-cols-[30px_minmax(0,1fr)_30px] md:grid-cols-[28px_minmax(0,2fr)_78px_62px_124px_minmax(76px,.8fr)_26px] gap-x-3 gap-y-2 items-center px-4 py-2.5 border-b border-[#F1EEE7] ${l.locked ? 'bg-[#FCFBF8]' : ''}`}
            >
              <ItemIcon sku={l.sku} size="w-[28px] h-[28px]" />
              <div className="min-w-0">
                {l.locked && l.field ? (
                  <button type="button" onClick={() => setImplOpen(!implOpen)} aria-expanded={implOpen} aria-controls="impl-credit" className="text-left group flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <b className="text-[13px] font-semibold group-hover:underline underline-offset-2">{l.name}</b>
                    <span className="whitespace-nowrap rounded-[5px] bg-[#EEEBFB] px-1.5 py-px text-[10px] font-bold text-[#6E5BD0]">ALWAYS INCLUDED</span>
                  </button>
                ) : (
                  <b className="block text-[13px] font-semibold">
                    {l.name}
                    {l.locked && <span className="ml-1.5 align-[1px] whitespace-nowrap rounded-[5px] bg-[#EEEBFB] px-1.5 py-px text-[10px] font-bold text-[#6E5BD0]">ALWAYS INCLUDED</span>}
                  </b>
                )}
                <small className="block text-[11.5px] text-[#8A919C] mt-0.5">
                  <span className="font-mono">{book[l.sku]?.itemCode ?? l.sku}</span> · {l.unit}
                  {l.key === 'impl' && l.field && pilot && k.installCreditPct > 0 && <b className="text-[#2F8F5B] font-semibold"> · {Math.round(k.installCreditPct * 100)}% credit on pilot sites</b>}
                </small>
              </div>
              <span className="md:hidden col-start-3 row-start-1 justify-self-end">{action(l)}</span>
              <span className={`max-md:col-start-2 justify-self-start inline-flex h-[22px] items-center rounded-[7px] px-2 text-[11.5px] font-semibold ${l.once ? 'bg-[#FBF0D9] text-[#9A6512]' : 'bg-[#E6F1FC] text-[#2F78C8]'}`}>{l.once ? 'One-time' : 'Monthly'}</span>
              <ListCell l={l} />
              <div className="max-md:col-start-2 min-w-0">
                {l.text ? (
                  <span className="text-[12.5px] text-[#4E5562]">{l.text}</span>
                ) : l.key === 'impl' && pilot && k.installCreditPct > 0 && !implOpen ? (
                  <button type="button" onClick={() => setImplOpen(true)} className="text-[13px] font-bold tabular-nums">
                    <span className="mr-1.5 font-medium text-[#8A919C] line-through">{money(k.installRate)}</span>
                    <span className="text-[#2F8F5B]">{money(k.installRate * (1 - k.installCreditPct))}</span>
                    <span className="ml-1 text-[11px] font-normal text-[#8A919C]">pilot sites</span>
                  </button>
                ) : (
                  l.field && <Price name={l.field} label={`${l.name} deal price`} nullable={l.nullable} placeholder={l.placeholder} suffix={l.suffix} list={l.list} pill={false} />
                )}
              </div>
              <span className="max-md:col-start-2 text-[12px] text-[#6B7380]">{l.applies}</span>
              <span className="max-md:hidden justify-self-end">{action(l)}</span>
            </div>
            {l.key === 'impl' && l.field === 'commercial.installRate' && (
              <Collapse open={implOpen} id="impl-credit">
                <div className="px-4 md:pl-[58px] pb-3 pt-1 bg-[#FCFBF8] border-b border-[#ECE8DF] space-y-2.5">
                  <SettingRow label="Credit on pilot sites" hint="Discount it; implementation is never removed">
                    {pilot ? <InstallCreditChoice /> : <span className="text-[12.5px] text-[#6B7380]">Turn on a pilot below to credit pilot sites.</span>}
                  </SettingRow>
                  {pilot && (
                    <SettingRow label="Clawback" hint="Charged if they don’t convert">
                      <Switch name="commercial.installClawback" label="Clawback if they don’t convert" disabled={!k.installCreditPct} />
                    </SettingRow>
                  )}
                  {pilot && vis.sensor && (
                    <SettingRow label="Credit additional sensors too" hint="Pilot sites only">
                      <Switch name="commercial.sensorCredit" label="Credit additional sensors too" disabled={!k.installCreditPct} />
                    </SettingRow>
                  )}
                  <SettingRow label="Price per bed" hint={`List ${money(book[SKU.install]?.list)}`}>
                    <Price name="commercial.installRate" label="Implementation price per bed" list={book[SKU.install]?.list ?? null} />
                  </SettingRow>
                  {pilot && n.pilotBeds > 0 && (
                    <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-[10px] border border-[#ECE8DF] bg-white px-3 py-2 text-[12px] text-[#6B7380]">
                      <span>List value <b className="tabular-nums text-teton-ink">{usd(n.pilotBeds * k.installRate)}</b></span>
                      <span>Credit <b className="tabular-nums text-[#2F8F5B]">−{usd(n.pilotBeds * k.installRate * k.installCreditPct)}</b></span>
                      <span>They pay <b className="tabular-nums text-teton-ink">{usd(n.pilotBeds * k.installRate * (1 - k.installCreditPct))}</b></span>
                      <span className="sm:ml-auto">{n.pilotBeds} pilot beds × {money(k.installRate)}</span>
                    </div>
                  )}
                </div>
              </Collapse>
            )}
          </div>
        ))}
        {err && <p role="alert" className="mx-4 my-2 rounded-lg bg-[#FDF0EE] px-3 py-2 text-[12px] text-[#B4442C]">{err}</p>}
        {lines.some((l) => l.key === 'impl' && l.field) && !implOpen && (
          <p className="px-4 py-2 text-[11.5px] text-[#6B7380] bg-[#F6F3EE]">🔒 Implementation can’t be removed. Click its name to credit it (for example 100% on pilot sites).</p>
        )}
      </div>

      {/* The settings those products need */}
      <div className="rounded-[14px] border border-[#ECE8DF] bg-white overflow-hidden">
        <Group title="Pricing structure">
          <SettingRow label="What the proposal shows" hint="Set by the products: subscriptions are OpEx, equipment purchase is CapEx">
            <span className="inline-flex h-[24px] items-center rounded-[7px] bg-[#E6F1FC] px-2.5 text-[12px] font-semibold text-[#2F78C8]">
              {d.presentation === 'both' ? 'OpEx + CapEx' : d.presentation === 'capex' ? 'CapEx' : 'OpEx'}
            </span>
          </SettingRow>
        </Group>
        {vis.pilot && (
          <Group title="Pilot" codes={ps.includes('subscription') ? [SKU.platform] : ps.includes('capex') ? [SKU.capexBase] : []} book={book}>
            <SettingRow label="Start with a pilot" hint="Pilot sites are marked per community">
              <Switch name="schedule.withPilot" label="Start with a pilot" />
            </SettingRow>
            {pilot && ps.includes('subscription') && (
              <SettingRow label="Pilot rate per bed / month" hint={`Standard $${POLICY.standardPilotRate}`} note={Number(k.pilotRate) === 0 ? <Tag tone="amber">Free pilot</Tag> : null}>
                <Price name="commercial.pilotRate" label="Pilot rate per bed / month" suffix="/bed" />
              </SettingRow>
            )}
            {pilot && (
              <SettingRow label="Pilot length" hint={`Standard ${POLICY.standardPilotMonths}, then the ${d.schedule.horizonMonths >= 36 ? 36 : d.schedule.horizonMonths}-month term at the deal price`}>
                <Months name="schedule.pilotLengthMonths" />
              </SettingRow>
            )}
            {pilot && vis.ecall && (
              <SettingRow label="E-Call during the pilot" hint="Standard: free">
                <Price name="commercial.ecallPilotRate" label="E-Call during pilot" suffix={k.ecallBilling === 'device' ? '/dev' : '/room'} />
              </SettingRow>
            )}
            {pilot && vis.capex && (
              <SettingRow label="Conversion credit" hint="Off each base package & sensor at pilot sites">
                <Price name="commercial.capex.conversionCredit" label="Conversion credit" nullable placeholder="0" />
              </SettingRow>
            )}
          </Group>
        )}
        {vis.introRate && (
          <Group title="Introductory rate">
            <SettingRow label="Introductory rate" hint="A lower rate for the first months after the pilot">
              <Controller
                control={control}
                name="commercial.specialRate"
                render={({ field }) => (
                  <SwitchButton
                    label="Introductory rate"
                    on={field.value != null}
                    onChange={(on) => {
                      field.onChange(on ? k.platformRate : null);
                      if (on && !k.specialTermMonths) setValue('commercial.specialTermMonths', 6, { shouldDirty: true });
                    }}
                  />
                )}
              />
            </SettingRow>
            {k.specialRate != null && (
              <>
                <SettingRow label="Intro rate per bed / month">
                  <Price name="commercial.specialRate" label="Intro rate per bed / month" suffix="/bed" />
                </SettingRow>
                <SettingRow label="Intro term">
                  <Months name="commercial.specialTermMonths" />
                </SettingRow>
              </>
            )}
          </Group>
        )}
        {vis.ecall && <EcallSettings book={book} />}
        {vis.capex && <CapexSettings />}
        {vis.finish && (
          <Group title="Concealed finish" codes={['FINISH-CONCEALED-LOW', 'FINISH-CONCEALED-HIGH']} book={book}>
            <SettingRow label="Low / room"><Price name="commercial.finish.low" label="Concealed finish low per room" /></SettingRow>
            <SettingRow label="High / room"><Price name="commercial.finish.high" label="Concealed finish high per room" /></SettingRow>
            <SettingRow label="Standard credit / room" hint="Value of the standard install"><Price name="commercial.finish.credit" label="Standard credit per room" /></SettingRow>
            <div className="px-4 py-3">
              <DerivedField
                label="Add-on for the deal"
                value={`${money(n.rooms * Math.max(0, (k.finish.low ?? 0) - (k.finish.credit ?? 0)))} to ${money(n.rooms * Math.max(0, (k.finish.high ?? 0) - (k.finish.credit ?? 0)))}`}
                formula={`${n.rooms} rooms × (concealed price − standard credit)`}
              />
            </div>
          </Group>
        )}
        {d.communities?.some((c) => c.coverage === 'full_facility') && (
          <Group title="Older deal">
            <SettingRow label="Full-facility multiplier" hint="Communities still on full facility">
              <Controller
                control={control}
                name="commercial.fullFacilityMultiplier"
                render={({ field }) => <NumInput value={field.value as number} onChange={field.onChange} onBlur={field.onBlur} suffix="×" min={1} className="w-[118px]" aria-label="Full-facility multiplier" />}
              />
            </SettingRow>
          </Group>
        )}
        {hidden.length > 0 && (
          <p className="flex items-start gap-2 px-4 py-2.5 bg-[#FBFAF7] border-t border-[#ECE8DF] text-[12px] text-[#6B7380]">
            <span aria-hidden="true">ⓘ</span>
            <span>
              <b className="text-teton-ink">{hidden.length} {hidden.length === 1 ? 'setting group' : 'setting groups'} hidden</b> ({hidden.join(', ')}). Add the matching product to show them.
            </span>
          </p>
        )}
      </div>
      <Picker open={picking} onClose={() => setPicking(false)} book={book} have={ps} system={k.ecall} onAdd={add} />
    </div>
  );

  function action(l: Line) {
    if (l.locked)
      return (
        <span className="w-[26px] h-[26px] grid place-items-center text-[#8A919C]" title="Always included: credit it instead of removing it" aria-label="Always included">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>
        </span>
      );
    if (!l.product || readOnly) return l.auto ? <span className="text-[10.5px] text-[#A3A9B2]" title={l.auto}>auto</span> : null;
    const block = removeBlock(d, l.product);
    return (
      <button type="button" onClick={() => remove(l.product!)} title={block ?? `Remove ${l.name}`} aria-label={`Remove ${l.name}`} className="w-[26px] h-[26px] grid place-items-center rounded-[7px] text-[#A3A9B2] hover:bg-[#F6F3EE] hover:text-[#B4442C]">
        ✕
      </button>
    );
  }
}

/** The list price; amber (with the difference on hover) when the deal price is different. */
function ListCell({ l }: { l: Line }) {
  const { control } = useFormContext<QuoteDraft>();
  const v = useWatch({ control, name: (l.field ?? 'customerName') as FieldName }) as unknown;
  if (l.list == null) return <span className="max-md:hidden" />;
  const n = Number(v);
  const off = !!l.field && v != null && Number.isFinite(n) && Math.abs(n - l.list) > 1e-9;
  return (
    <span className={`max-md:hidden text-right tabular-nums ${off ? 'text-[#9A6512] font-semibold' : 'text-[#8A919C]'}`} title={off ? `List ${money(l.list)} · deal ${n < l.list ? '−' : '+'}${money(Math.abs(n - l.list))}` : 'List price'}>
      {money(l.list)}
    </span>
  );
}

function Tag({ tone, children }: { tone: 'amber' | 'green' | 'blue'; children: React.ReactNode }) {
  const t = { amber: 'bg-[#FBF0D9] text-[#9A6512]', green: 'bg-[#E4F4EC] text-[#2F8F5B]', blue: 'bg-[#E6F1FC] text-[#2F78C8]' }[tone];
  return <span className={`inline-flex h-[22px] items-center rounded-[7px] px-2 text-[11.5px] font-semibold ${t}`}>{children}</span>;
}

function Months({ name }: { name: FieldName }) {
  const { control } = useFormContext<QuoteDraft>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => <NumInput value={field.value as number} onChange={field.onChange} onBlur={field.onBlur} suffix="months" min={0} className="w-[130px]" aria-label={String(name)} />}
    />
  );
}

/** A group of settings with an eyebrow header and the SKUs that brought it in. */
function Group({ title, codes = [], book, children }: { title: string; codes?: string[]; book?: PriceBook; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#ECE8DF] last:border-b-0">
      <p className={`${eyebrow} flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-[#F1EEE7]`}>
        {title}
        {codes.map((c) => (
          <span key={c} className="rounded-[6px] bg-[#F0EEE9] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold normal-case tracking-normal text-[#6B6458]" title="Shown because this product is on the deal">
            {book?.[c]?.itemCode ?? c}
          </span>
        ))}
      </p>
      <div className="divide-y divide-[#F1EEE7]">{children}</div>
    </div>
  );
}

/** One setting: name and hint · control · note. */
function SettingRow({ label, hint, note, children }: { label: string; hint?: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(190px,1fr)_minmax(0,1.3fr)_auto] sm:items-center px-4 py-2.5 min-h-[52px]">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{label}</p>
        {hint && <p className="text-[11.5px] text-[#8A919C] mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div className="min-w-0 max-w-full overflow-x-auto">{children}</div>
      {note ? <div className="sm:text-right">{note}</div> : <span className="max-sm:hidden" />}
    </div>
  );
}

function EcallSettings({ book }: { book: PriceBook }) {
  const { control, setValue } = useFormContext<QuoteDraft>();
  const k = useWatch({ control, name: 'commercial' }) as QuoteDraft['commercial'];
  const perRoom = k.ecallBilling !== 'device';
  const unit = perRoom ? 'room' : 'device';
  const listOf = (o: 'ble' | 'inovonics') => (o === 'ble' ? book[SKU.ecallBle]?.list ?? 10 : book[SKU.ecallInovonics]?.list ?? 15);
  const other = k.ecall === 'ble' ? 'inovonics' : 'ble';
  return (
    <Group title="E-Call" codes={[k.ecall === 'inovonics' ? SKU.ecallInovonics : SKU.ecallBle]} book={book}>
      <SettingRow label="System" hint="Per site: tick E-Call in the communities table">
        <Seg
          name="commercial.ecall"
          label="E-Call system"
          options={[['ble', 'Bluetooth'], ['inovonics', 'Inovonics']]}
          onPick={(v) => {
            setValue('commercial.ecallRate', listOf(v as 'ble' | 'inovonics'), { shouldDirty: true });
            setValue('commercial.ecallPilotRate', 0, { shouldDirty: true });
          }}
        />
      </SettingRow>
      <SettingRow label="Monthly fee counted" hint={perRoom ? 'Rate × rooms (a common area with a device counts as a room); devices beyond the rooms are one-time extras.' : 'Rate × every E-Call device; no separate charge for extra devices.'}>
        <Seg name="commercial.ecallBilling" label="E-Call pricing" options={[['room', 'Per room / mo'], ['device', 'Per device / mo']]} />
      </SettingRow>
      {perRoom && (
        <SettingRow label={`Additional ${k.ecall === 'inovonics' ? 'pull-cord' : 'button'}`} hint="Each, one-time · devices beyond the rooms">
          <Price name={k.ecall === 'inovonics' ? 'commercial.ecallDevices.inoPullcord' : 'commercial.ecallDevices.bleButton'} label="Additional device price" list={book[k.ecall === 'inovonics' ? SKU.ecallInoPullcord : SKU.ecallBleButton]?.list ?? null} />
        </SettingRow>
      )}
      <SettingRow label="E-Call installation per bed" hint="One-time, on beds with E-Call only">
        <Price name="commercial.ecallInstallRate" label="E-Call installation per bed" nullable placeholder="0" />
      </SettingRow>
      <SettingRow label="Compare both systems" hint="E-Call-only deals: the business case shows Bluetooth and Inovonics side by side">
        <Switch name="commercial.ecallCompare" label="Compare Bluetooth and Inovonics" />
      </SettingRow>
      {k.ecallCompare && (
        <SettingRow label={`${other === 'ble' ? 'Bluetooth' : 'Inovonics'} per ${unit} / month`} hint={`For the comparison · list $${listOf(other)}`}>
          <Price name="commercial.ecallCompareRate" label="Comparison rate" nullable placeholder={String(listOf(other))} suffix={`/${unit === 'room' ? 'room' : 'dev'}`} />
        </SettingRow>
      )}
    </Group>
  );
}

function CapexSettings() {
  const { control } = useFormContext<QuoteDraft>();
  const k = useWatch({ control, name: 'commercial' }) as QuoteDraft['commercial'];
  const up = k.capex?.softwareBilling === 'upfront';
  return (
    <Group title="Equipment purchase">
      <SettingRow label="Software & services billed" hint="Title passes at install; no install charge or license fee">
        <Seg name="commercial.capex.softwareBilling" label="Software & services billed" options={[['monthly', 'Monthly'], ['upfront', 'Upfront']]} />
      </SettingRow>
      <SettingRow label="Additional sensor" hint="One-time"><Price name="commercial.capex.sensorPrice" label="Equipment purchase additional sensor" /></SettingRow>
      {k.ecall === 'ble' && <SettingRow label="With E-Call per bed" hint="Replaces the base price"><Price name="commercial.capex.bleBasePrice" label="Base with Bluetooth E-Call" /></SettingRow>}
      {k.ecall === 'inovonics' && <SettingRow label="With Inovonics E-Call per bed" hint="Replaces the base price"><Price name="commercial.capex.inovonicsBasePrice" label="Base with Inovonics E-Call" /></SettingRow>}
      {k.ecall !== 'none' && (
        <>
          <SettingRow label="E-Call only per bed" hint="Beds with E-Call only: installed, one-time">
            <Price name={k.ecall === 'inovonics' ? 'commercial.capex.ecallInstallInovonics' : 'commercial.capex.ecallInstallBle'} label="E-Call only per bed" />
          </SettingRow>
          <SettingRow label={up ? 'E-Call software, upfront' : 'E-Call software'} hint="Beds with E-Call only">
            <Price name={up ? 'commercial.capex.ecallSoftwareUpfront' : 'commercial.capex.ecallSoftware'} label="E-Call software" suffix={up ? undefined : '/bed'} />
          </SettingRow>
          <SettingRow label="E-Call renewal per bed" hint={k.ecall === 'ble' ? 'Every 4 years' : 'Every 3 years'}>
            <Price name={k.ecall === 'ble' ? 'commercial.capex.bleRenewal' : 'commercial.capex.inovonicsRenewal'} label="E-Call renewal" />
          </SettingRow>
        </>
      )}
    </Group>
  );
}

/** The items reps can add, in price book order (implementation is added on its own). */
const PICKABLE = [SKU.platform, SKU.snf, SKU.bundleBle, SKU.bundleInovonics, SKU.ecallBle, SKU.ecallInovonics, SKU.sensor, SKU.commonAreaSetup, SKU.capexBase, 'FINISH-CONCEALED-LOW'];

/** The price book, to pick products from: a drawer on the right (a bottom sheet on phones). */
function Picker({ open, onClose, book, have, system, onAdd }: { open: boolean; onClose: () => void; book: PriceBook; have: DealProduct[]; system: string; onAdd: (skus: string[]) => void }) {
  const phone = usePhone();
  const [sel, setSel] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (open) {
      setShown(true);
      setLeaving(false);
      setSel([]);
      setQ('');
      return;
    }
    if (!shown) return;
    setLeaving(true);
    const t = setTimeout(() => (setShown(false), setLeaving(false)), 200);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);
  const onDeal = (sku: string) => {
    const m = productsForSku(sku);
    return !!m && m.add.every((p) => have.includes(p)) && (!m.ecall || m.ecall === system);
  };
  const items = PICKABLE.filter((s) => book[s] || s === 'FINISH-CONCEALED-LOW').filter((s) => !q || `${book[s]?.name ?? ''} ${book[s]?.itemCode ?? ''} ${s}`.toLowerCase().includes(q.toLowerCase()));
  const groups = Array.from(new Set(items.map((s) => `${placeOf(s).category} · ${placeOf(s).sub}`)));
  const label = (s: string) => (s === SKU.commonAreaSetup ? 'Common-area sensors' : s === 'FINISH-CONCEALED-LOW' ? 'Concealed finish' : book[s]?.name ?? s);
  const priceText = (s: string) => {
    const p = book[s];
    if (s === SKU.commonAreaSetup) return `${money(p?.list)} + ${money(book[SKU.commonAreaMonthly]?.list)}/mo`;
    if (s === 'FINISH-CONCEALED-LOW') return `${money(p?.list)}–${money(book['FINISH-CONCEALED-HIGH']?.list)}/room`;
    if (!p) return '';
    const unit = p.pricingModel === 'per_bed_month' ? '/bed/mo' : p.pricingModel === 'per_bed_once' ? '/bed' : p.pricingModel === 'per_unit_month' ? '/mo' : '';
    return `${money(p.list)}${unit}`;
  };
  const toggle = (s: string) => setSel((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));
  const willShow = (() => {
    const add = new Set<DealProduct>();
    sel.forEach((s) => productsForSku(s)?.add.forEach((p) => add.add(p)));
    const v = visibleSettings([...have, ...add]);
    const before = visibleSettings(have);
    const out: string[] = [];
    if (v.pilot && !before.pilot) out.push('Pilot');
    if (v.ecall && !before.ecall) out.push('E-Call');
    if (v.capex && !before.capex) out.push('Equipment purchase');
    if (v.finish && !before.finish) out.push('Concealed finish');
    if (v.introRate && !before.introRate) out.push('Introductory rate');
    return out;
  })();
  const body = (
    <>
      <div className="px-5 pb-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items, SKUs…" aria-label="Search the price book" className="h-9 w-full rounded-[10px] border border-[#E4E0D6] px-3 text-[13px] outline-none focus:border-[#3F8CEA]" />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-3">
        {groups.map((g) => (
          <div key={g}>
            <p className={`${eyebrow} mt-3 mb-1 px-1`}>{g}</p>
            {items
              .filter((s) => `${placeOf(s).category} · ${placeOf(s).sub}` === g)
              .map((s) => {
                const already = onDeal(s);
                const on = already || sel.includes(s);
                return (
                  <button key={s} type="button" disabled={already} onClick={() => toggle(s)} role="checkbox" aria-checked={on} className={`w-full grid grid-cols-[20px_28px_1fr_auto] gap-2.5 items-center px-1.5 py-2 border-b border-[#F3F0EA] text-left ${sel.includes(s) ? 'bg-[#F3F8FE]' : ''} ${already ? 'opacity-55' : 'hover:bg-[#FBFAF7]'}`}>
                    <span className={`w-4 h-4 rounded-[4px] border-[1.5px] grid place-items-center text-[10px] text-white ${on ? 'bg-[#3F8CEA] border-[#3F8CEA]' : 'border-[#C9C4BA]'}`}>{on ? '✓' : ''}</span>
                    <ItemIcon sku={s} size="w-[28px] h-[28px]" />
                    <span className="min-w-0">
                      <b className="block text-[12.5px] font-semibold">{label(s)}</b>
                      <small className="font-mono text-[11px] text-[#8A919C]">{book[s]?.itemCode ?? s}{already ? ' · on the deal' : ''}</small>
                    </span>
                    <span className="text-right text-[12.5px] font-bold tabular-nums whitespace-nowrap">{priceText(s)}</span>
                  </button>
                );
              })}
            {g.startsWith('Platform · Subscriptions') && (
              <div className="w-full grid grid-cols-[20px_28px_1fr_auto] gap-2.5 items-center px-1.5 py-2 border-b border-[#F3F0EA] opacity-60">
                <span className="text-[#8A919C]" aria-hidden="true">🔒</span>
                <ItemIcon sku={SKU.install} size="w-[28px] h-[28px]" />
                <span className="min-w-0">
                  <b className="block text-[12.5px] font-semibold">{book[SKU.install]?.name ?? 'Installation & implementation'}</b>
                  <small className="font-mono text-[11px] text-[#8A919C]">{book[SKU.install]?.itemCode ?? SKU.install} · added automatically</small>
                </span>
                <span className="text-right text-[12.5px] font-bold tabular-nums">{money(book[SKU.install]?.list)}/bed</span>
              </div>
            )}
          </div>
        ))}
      </div>
      {willShow.length > 0 && (
        <p className="mx-5 mb-3 rounded-[10px] bg-[#F6F3EE] px-3 py-2 text-[11.5px] leading-relaxed text-[#6B7380]">
          Adding {sel.length === 1 ? 'this' : 'these'} shows the <b className="text-teton-ink">{willShow.join(', ')}</b> settings. Implementation comes with the first platform product.
        </p>
      )}
      <div className="flex items-center gap-2 border-t border-[#ECE8DF] px-5 py-3 bg-white">
        <p className="flex-1 text-[12px] text-[#6B7380]"><b className="text-teton-ink">{sel.length} selected</b></p>
        <button type="button" onClick={onClose} className="h-9 rounded-[10px] border border-[#E4E0D6] px-3 text-[12.5px] font-semibold">Cancel</button>
        <button
          type="button"
          disabled={!sel.length}
          onClick={() => {
            onAdd(sel);
            onClose();
          }}
          className="h-9 rounded-[10px] bg-teton-ink px-3 text-[12.5px] font-semibold text-white disabled:opacity-40"
        >
          {sel.length > 1 ? `Add ${sel.length} products` : 'Add product'}
        </button>
      </div>
    </>
  );
  if (phone)
    return (
      <SwipeSheet open={open} onClose={onClose} eyebrow="Price book · United States" title="Add products">
        <div className="flex flex-col max-h-[70dvh] -mx-5">{body}</div>
      </SwipeSheet>
    );
  if (!shown) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Add products">
      <div className={`absolute inset-0 bg-[#1C1F24]/20 transition-opacity duration-200 ${leaving ? 'opacity-0' : 'opacity-100'}`} onClick={onClose} />
      <div className={`absolute right-0 top-0 h-full w-[400px] max-w-full bg-white border-l border-[#ECE8DF] shadow-xl flex flex-col ${leaving ? 'drawer-out' : 'drawer-in'}`}>
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-[#5A6270]">PRICE BOOK · UNITED STATES</span>
            <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-[#F1EEE8] text-[#5A6270] grid place-items-center hover:bg-[#E9E4DB]">✕</button>
          </div>
          <p className="mt-2 text-[17px] font-bold">Add products</p>
          <p className="text-[12px] text-[#6B7380]">Prices start at list; change them on the deal.</p>
        </div>
        {body}
      </div>
    </div>
  );
}
