'use client';

/**
 * Products & Pricing: the rep answers two questions (how the customer buys, and which core products they get) and the
 * price book items follow, each with its list and deal price; below them only the settings those items need.
 * Implementation is always included and can be credited, not removed. Choices write the draft fields the pricing
 * engine reads (lib/quote/products).
 */
import { useContext, useEffect, useMemo, useState } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { POLICY, SKU, type PriceBook } from '@/lib/pricing/catalog';
import { scopeOf, type DraftCommunity, type QuoteDraft } from '@/lib/quote/draft';
import { sharedResidents } from '@/lib/quote/roomTypes';
import { applyChoices, applyKit, changeNote, choicesOf, clearSensors, commonAreaOffered, dealProducts, hasImplementation, hasSensors, KITS, sensorCounts, visibleSettings, type Choices, type DealProduct, type Structure } from '@/lib/quote/products';
import { usd } from '@/lib/format';
import { activeItems, itemQty } from '@/lib/pricing/items';
import { COUNT_LABEL, type CountBasis } from '@/lib/pricing/catalog';
import { BUILTIN_CORES, CONVERTIBLE, isRemoved, lineupOf, offeredFor, removedRoles, ROLE_BY_SKU, sameLineup, SIDES, type Lineup } from '@/lib/pricing/lineup';
import { Collapse, DerivedField, ReadOnlyContext } from '@/components/form/fields';
import { NumInput } from '@/components/form/NumInput';
import { SegGroup } from '@/components/form/SegGroup';
import { usePriceBookLineup } from './LineupContext';
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
    monitoredEcall: sum((c) => scopeOf(c, ecallOn).monitoredEcall),
    // Residents sharing a room (one Edge unit, installation and base package per room).
    shared: sum((c) => sharedResidents(c, ecallOn).monitored),
    sharedEcall: sum((c) => sharedResidents(c, ecallOn).monitoredEcall),
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
  /** Implementation: always included (credit it, don't remove it). */
  locked?: boolean;
  /** Shown instead of a price input. */
  text?: string;
  /** Additional sensors: set by the communities' counts; removed from the ⋯ menu. */
  sensors?: boolean;
  /** The Teton One + E-Call bundle: its price is the subscription + E-Call less the bundle saving. */
  bundle?: 'ble' | 'inovonics';
  /** The SKU reps see, when it isn't in the price book passed in (generic items carry their own). */
  code?: string;
}

/** The price book items on the deal, from the products (and structure) and the communities' counts. */
function linesOf(d: QuoteDraft, ps: DealProduct[], book: PriceBook): Line[] {
  const k = d.commercial;
  const n = counts(d);
  const L = (sku: string) => book[sku];
  const name = (sku: string, fb: string) => L(sku)?.name ?? fb;
  const list = (sku: string) => L(sku)?.list ?? null;
  const any = n.communities > 0;
  const beds = (x: number) => (any ? `${x.toLocaleString('en-US')} beds` : 'all beds');
  // Per room (Edge unit) when residents share rooms; per bed otherwise.
  const roomsOf = (x: number, shared: number) => (shared > 0 ? `${(x - shared).toLocaleString('en-US')} rooms` : beds(x));
  const opexSide = d.presentation !== 'capex';
  const capexSide = d.presentation !== 'opex';
  const sub = ps.includes('subscription');
  const cx = ps.includes('capex');
  const ec = ps.includes('ecall');
  const ino = k.ecall === 'inovonics';
  const perRoom = k.ecallBilling !== 'device';
  // Beds with monitoring but no E-Call, and E-Call without monitoring (shown only when the communities have some).
  const monOnly = Math.max(0, n.monitored - n.monitoredEcall);
  // Items the deal's line-up takes away aren't on the deal (they're free): their lines are left out.
  const removed = removedRoles(d.lineup);
  const out: Line[] = [];
  const ecallLine = (applies: string): Line => {
    const sku = ino ? SKU.ecallInovonics : SKU.ecallBle;
    return { key: 'ecall', sku, name: name(sku, ino ? 'E-Call (Inovonics)' : 'E-Call (Bluetooth)'), unit: `per ${perRoom ? 'room' : 'device'} / month`, once: false, list: list(sku), field: 'commercial.ecallRate', suffix: perRoom ? '/room' : '/dev', applies };
  };
  const subLine = (applies: string): Line => ({ key: 'sub', sku: SKU.platform, name: name(SKU.platform, 'Teton subscription'), unit: 'per bed / month', once: false, list: list(SKU.platform), field: 'commercial.platformRate', suffix: '/bed', applies });

  if (opexSide) {
    // The bundle (unless the line-up turns it off: then the subscription and E-Call are billed separately).
    const bundleOn = !isRemoved(removed, 'bundle', ino ? SKU.bundleInovonics : SKU.bundleBle);
    if (sub && ec && bundleOn) {
      const sku = ino ? SKU.bundleInovonics : SKU.bundleBle;
      out.push({ key: 'bundle', sku, name: name(sku, ino ? 'Teton One + E-Call (Inovonics)' : 'Teton One + E-Call (Bluetooth)'), unit: 'per bed / month', once: false, list: list(sku), applies: beds(any ? n.monitoredEcall : 0), bundle: ino ? 'inovonics' : 'ble' });
      if (any && monOnly > 0) out.push(subLine(`${beds(monOnly)} without E-Call`));
      if (any && n.ecallOnly > 0) out.push(ecallLine(`${beds(n.ecallOnly)} without monitoring`));
    } else if (sub) {
      out.push(subLine(beds(n.monitored)));
      if (ec) out.push(ecallLine(beds(n.ecall)));
    } else if (ec && !cx) out.push(ecallLine(beds(n.ecall)));
    if (ps.includes('snf')) out.push({ key: 'snf', sku: SKU.snf, name: name(SKU.snf, 'Skilled nursing'), unit: 'per bed / month', once: false, list: list(SKU.snf), field: 'commercial.snfRate', nullable: true, placeholder: String(k.platformRate), suffix: '/bed', applies: beds(n.snf) });
  }
  if (capexSide) {
    const up = k.capex?.softwareBilling === 'upfront';
    if (cx && ec) {
      const sku = ino ? SKU.capexBaseInovonics : SKU.capexBaseBle;
      out.push({ key: 'capexEc', sku, name: name(sku, 'Base package + E-Call'), unit: 'per bed, one-time · installed', once: true, list: list(sku), field: ino ? 'commercial.capex.inovonicsBasePrice' : 'commercial.capex.bleBasePrice', applies: any ? roomsOf(n.monitoredEcall, n.sharedEcall) : beds(0) });
    }
    if (cx && (!ec || (any && monOnly > 0))) out.push({ key: 'capex', sku: SKU.capexBase, name: name(SKU.capexBase, 'Base package'), unit: 'per bed, one-time · edge unit + sensor, installed', once: true, list: list(SKU.capexBase), field: 'commercial.capex.basePrice', applies: ec ? `${roomsOf(monOnly, n.shared - n.sharedEcall)} without E-Call` : roomsOf(n.monitored, n.shared) });
    if (ec && (!cx || (any && n.ecallOnly > 0))) {
      const sku = ino ? SKU.capexEcallInstallInovonics : SKU.capexEcallInstallBle;
      const applies = cx ? `${beds(n.ecallOnly)} without monitoring` : beds(n.ecallOnly);
      out.push({ key: 'capexEo', sku, name: name(sku, 'E-Call only installation'), unit: 'per bed, one-time · installed', once: true, list: list(sku), field: ino ? 'commercial.capex.ecallInstallInovonics' : 'commercial.capex.ecallInstallBle', applies });
      const swSku = up ? SKU.capexEcallSoftwareUpfront : SKU.capexEcallSoftware;
      out.push({ key: 'capexEoSw', sku: swSku, name: name(swSku, 'E-Call software'), unit: up ? 'per bed, upfront (4 years)' : 'per bed / month', once: up, list: list(swSku), field: up ? 'commercial.capex.ecallSoftwareUpfront' : 'commercial.capex.ecallSoftware', suffix: up ? undefined : '/bed', applies });
    }
    if (cx) {
      const sku = up ? SKU.capexSoftwareUpfront : SKU.capexSoftware;
      out.push({ key: 'capexsw', sku, name: name(sku, 'Software & services'), unit: `${up ? 'per bed, upfront (4 years)' : 'per bed / month'}${ec ? ' · covers E-Call' : ''}`, once: up, list: list(sku), field: up ? 'commercial.capex.softwareUpfront' : 'commercial.capex.softwareRate', suffix: up ? undefined : '/bed', applies: beds(n.monitored) });
    }
    if (ec) {
      const sku = ino ? SKU.capexInovonicsRenewal : SKU.capexBleRenewal;
      out.push({ key: 'renewal', sku, name: name(sku, 'E-Call renewal'), unit: `per bed, every ${ino ? 3 : 4} years`, once: true, list: list(sku), field: ino ? 'commercial.capex.inovonicsRenewal' : 'commercial.capex.bleRenewal', applies: beds(n.ecall) });
    }
  }
  if (hasImplementation(ps)) {
    if (sub) out.push({ key: 'impl', sku: SKU.install, name: name(SKU.install, 'Installation & implementation'), unit: n.shared > 0 ? 'per room (Edge unit), one-time' : 'per bed, one-time', once: true, list: list(SKU.install), field: 'commercial.installRate', applies: roomsOf(n.monitored, n.shared), locked: true });
    else if (ec && opexSide && !cx) out.push({ key: 'impl', sku: SKU.install, name: 'E-Call installation & implementation', unit: 'per bed with E-Call only, one-time', once: true, list: null, field: 'commercial.ecallInstallRate', nullable: true, placeholder: '0', applies: beds(n.ecallOnly), locked: true });
    else out.push({ key: 'impl', sku: SKU.install, name: name(SKU.install, 'Installation & implementation'), unit: 'equipment purchase', once: true, list: null, applies: '', locked: true, text: 'Included in the base package' });
  }
  if (opexSide && ps.includes('commonArea')) {
    out.push({ key: 'ca2', sku: SKU.commonAreaMonthly, name: name(SKU.commonAreaMonthly, 'Common area sensor'), unit: 'per sensor / month', once: false, list: list(SKU.commonAreaMonthly), field: 'commercial.commonArea.monthly', suffix: '/mo', applies: `${n.commonArea} sensors` });
    out.push({ key: 'ca1', sku: SKU.commonAreaSetup, name: name(SKU.commonAreaSetup, 'Common area setup'), unit: 'per sensor, one-time', once: true, list: list(SKU.commonAreaSetup), field: 'commercial.commonArea.setup', applies: `${n.commonArea} sensors` });
  }
  // Additional sensors follow how the deal is sold: the subscription SKU, the purchase SKU, or a row for each.
  if (hasSensors(d)) {
    const both = opexSide && capexSide;
    const applies = `${n.sensors} ${n.sensors === 1 ? 'sensor' : 'sensors'}`;
    if (opexSide) out.push({ key: 'sensor', sku: SKU.sensor, name: both ? 'Additional sensor · subscription' : name(SKU.sensor, 'Additional sensor'), unit: `per sensor, one-time${both ? ' · OpEx' : ''}`, once: true, list: list(SKU.sensor), field: 'commercial.sensorPrice', applies, sensors: true });
    if (capexSide) out.push({ key: 'sensorCx', sku: SKU.capexSensor, name: both ? 'Additional sensor · purchase' : name(SKU.capexSensor, 'Additional sensor'), unit: `per sensor, one-time${both ? ' · CapEx' : ''}`, once: true, list: list(SKU.capexSensor), field: 'commercial.capex.sensorPrice', applies, sensors: true });
  }
  // Items priced generically (added in the price book): quantity from the communities × the deal price.
  const both = opexSide && capexSide;
  for (const it of activeItems(d)) {
    const qty = (d.communities ?? []).reduce((t, c) => t + itemQty(c, k.ecall !== 'none', it.spec.counted), 0);
    const every = it.spec.billing === 'years' ? `, every ${it.spec.everyYears ?? 1} ${(it.spec.everyYears ?? 1) === 1 ? 'year' : 'years'}` : it.spec.billing === 'once' ? ', one-time' : ' / month';
    out.push({
      key: `item:${it.side}:${it.sku}`,
      sku: it.sku,
      name: both ? `${it.spec.name} · ${it.side === 'capex' ? 'purchase' : 'subscription'}` : it.spec.name,
      unit: `${COUNT_LABEL[it.spec.counted]}${every}`,
      once: it.spec.billing !== 'monthly',
      list: it.spec.list,
      field: `commercial.items.${it.sku}` as FieldName,
      nullable: true,
      placeholder: String(it.spec.list),
      applies: any ? `${qty.toLocaleString('en-US')} ${UNIT_WORD[it.spec.counted][qty === 1 ? 0 : 1]}` : '',
      code: it.spec.code,
    });
  }
  if (!removed.size) return out;
  return out.filter((l) => {
    if (l.key === 'impl') return l.field === 'commercial.installRate' ? !isRemoved(removed, 'install') : l.field === 'commercial.ecallInstallRate' ? !isRemoved(removed, 'ecallInstall') : true;
    if (l.key.startsWith('item:')) return true; // generic: priced by its own details, not a built-in role
    const r = ROLE_BY_SKU[l.sku];
    return !r || !isRemoved(removed, r, l.sku);
  });
}

/** What a generic item's quantity counts, for "Applies to". */
const UNIT_WORD: Record<CountBasis, [string, string]> = { monitoredBeds: ['bed', 'beds'], ecallBeds: ['bed', 'beds'], ecallOnlyBeds: ['bed', 'beds'], monitoredEcallBeds: ['bed', 'beds'], snfBeds: ['bed', 'beds'], rooms: ['room', 'rooms'], commonAreaSensors: ['sensor', 'sensors'], additionalSensors: ['sensor', 'sensors'], perCommunity: ['community', 'communities'] };

/** The bundle's deal price: subscription + E-Call less the bundle saving. Editing it changes the saving. */
function BundlePrice({ sys, list, label }: { sys: 'ble' | 'inovonics'; list: number | null; label: string }) {
  const { control, setValue } = useFormContext<QuoteDraft>();
  const k = useWatch({ control, name: 'commercial' }) as QuoteDraft['commercial'];
  const parts = (Number(k.platformRate) || 0) + (Number(k.ecallRate) || 0);
  const disc = Math.max(0, Number(k.bundleDiscount?.[sys]) || 0);
  const v = Math.round((parts - disc) * 100) / 100;
  const off = list != null && Math.abs(v - list) > 1e-9;
  return (
    <NumInput
      value={v}
      onChange={(x) => {
        const next = Math.max(0, Math.round((parts - (Number(x) || 0)) * 100) / 100);
        setValue(`commercial.bundleDiscount.${sys}` as FieldName, next as never, { shouldDirty: true });
      }}
      prefix="$"
      suffix="/bed"
      min={0}
      max={parts}
      aria-label={label}
      className={`w-[112px] flex-shrink-0 ${off ? '' : '[&_input]:border-dashed'}`}
    />
  );
}

const STRUCTURES: Array<[Structure, string]> = [
  ['subscription', 'Subscription'],
  ['capex', 'Equipment purchase'],
  ['both', 'Both'],
];

/** The two questions: how they buy, and what they're getting (plus options). */
function BuildPanel({ c, onChange, disabled, lineup, extra, onExtra }: { c: Choices; onChange: (next: Choices) => void; disabled: boolean; lineup: Lineup; extra: string[]; onExtra: (ids: string[]) => void }) {
  // Core products added in the price book: cards (or option chips) of their own, picked per deal.
  const customs = lineup.cores.filter((x) => !BUILTIN_CORES.includes(x.id as never));
  const notOffered = (id: string) => !offeredFor(lineup, id, c.structure);
  const flip = (id: string) => onExtra(extra.includes(id) ? extra.filter((x) => x !== id) : [...extra, id]);
  const caOk = commonAreaOffered(c.structure, lineup);
  // Names and notes come from the line-up (admins can rename them in the price book).
  const core = (id: string, name: string, note: string) => {
    const x = lineup.cores.find((y) => y.id === id);
    return { name: x?.name || name, note: x?.note || note };
  };
  const mon = core('monitoring', 'Resident monitoring', 'Teton sensors in resident rooms');
  const ec = core('ecall', 'E-Call', 'Pendants and pull-cords');
  const ca = core('commonArea', 'Common area sensors', 'Dining, halls, lounges; count per community');
  const card = (on: boolean, off = false) =>
    `relative w-full rounded-[12px] border-[1.5px] px-3 py-2.5 text-left transition-colors duration-200 ${off ? 'border-[#ECE8DF] bg-[#FBFAF7] cursor-not-allowed' : on ? 'border-[#3F8CEA] bg-[#F3F8FE]' : 'border-[#E4E0D6] bg-white hover:bg-[#FBFAF7]'}`;
  const tick = (on: boolean) => (
    <span aria-hidden="true" className={`absolute top-2.5 right-2.5 w-[18px] h-[18px] rounded-[5px] border-[1.5px] grid place-items-center text-[11px] text-white transition-colors duration-200 ${on ? 'bg-[#3F8CEA] border-[#3F8CEA]' : 'border-[#C9C4BA] bg-white'}`}>
      {on ? '✓' : ''}
    </span>
  );
  return (
    <div className="px-4 py-3.5 border-b border-[#ECE8DF]">
      <p className={`${eyebrow} mb-2`}>1 · How do they buy?</p>
      <SegGroup label="How do they buy?" className="inline-flex max-w-full rounded-[11px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white">
        {STRUCTURES.map(([v, t]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={c.structure === v}
            disabled={disabled}
            onClick={() => c.structure !== v && onChange({ ...c, structure: v })}
            className={`h-9 sm:h-8 px-3 sm:px-3.5 rounded-[8px] text-[12.5px] whitespace-nowrap transition-colors duration-200 ${c.structure === v ? 'font-semibold text-teton-ink' : 'text-[#4E5562] hover:text-teton-ink'}`}
          >
            {t}
          </button>
        ))}
      </SegGroup>
      <p className={`${eyebrow} mt-4 mb-2`}>2 · What are they getting?</p>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <button type="button" role="checkbox" aria-checked={c.monitoring} disabled={disabled} onClick={() => onChange({ ...c, monitoring: !c.monitoring })} className={card(c.monitoring)}>
          {tick(c.monitoring)}
          <b className="block pr-6 text-[13px]">{mon.name}</b>
          <small className="mt-0.5 block text-[11.5px] leading-snug text-[#6B7380]">{mon.note}</small>
        </button>
        <div className={card(c.ecall !== 'none')}>
          <button type="button" role="checkbox" aria-checked={c.ecall !== 'none'} disabled={disabled} onClick={() => onChange({ ...c, ecall: c.ecall === 'none' ? 'ble' : 'none' })} className="absolute inset-0 rounded-[12px]" aria-label={ec.name} />
          {tick(c.ecall !== 'none')}
          <b className="pointer-events-none relative block pr-6 text-[13px]">{ec.name}</b>
          <small className="pointer-events-none relative mt-0.5 block text-[11.5px] leading-snug text-[#6B7380]">{ec.note}</small>
          <Collapse open={c.ecall !== 'none'}>
            <SegGroup label="E-Call system" className="relative mt-2 inline-flex rounded-[9px] bg-white p-[2px] shadow-[0_0_0_1px_#D3D6DA]" thumbClass="bg-teton-ink">
              {(
                [
                  ['ble', 'Bluetooth'],
                  ['inovonics', 'Inovonics'],
                ] as const
              ).map(([v, t]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={c.ecall === v}
                  disabled={disabled}
                  onClick={() => c.ecall !== v && onChange({ ...c, ecall: v })}
                  className={`h-8 sm:h-7 px-2.5 rounded-[7px] text-[12px] transition-colors duration-200 ${c.ecall === v ? 'font-semibold text-white' : 'text-[#4E5562]'}`}
                >
                  {t}
                </button>
              ))}
            </SegGroup>
          </Collapse>
        </div>
        <button
          type="button"
          role="checkbox"
          aria-checked={caOk && c.commonArea}
          aria-disabled={!caOk}
          disabled={disabled || !caOk}
          onClick={() => onChange({ ...c, commonArea: !c.commonArea })}
          className={card(caOk && c.commonArea, !caOk)}
          title={caOk ? undefined : 'Not offered on equipment purchase'}
        >
          {tick(caOk && c.commonArea)}
          <b className={`block pr-6 text-[13px] ${caOk ? '' : 'text-[#9AA0A8]'}`}>{ca.name}</b>
          <small className="mt-0.5 block text-[11.5px] leading-snug text-[#6B7380]">{caOk ? ca.note : 'Not offered on equipment purchase'}</small>
        </button>
        {customs
          .filter((x) => x.kind === 'core')
          .map((x) => {
            const off = notOffered(x.id);
            const on = !off && extra.includes(x.id);
            return (
              <button key={x.id} type="button" role="checkbox" aria-checked={on} aria-disabled={off} disabled={disabled || off} onClick={() => flip(x.id)} className={card(on, off)} title={off ? `Not offered with ${c.structure === 'capex' ? 'equipment purchase' : 'the subscription'}` : undefined}>
                {tick(on)}
                <b className={`block pr-6 text-[13px] ${off ? 'text-[#9AA0A8]' : ''}`}>{x.name}</b>
                <small className="mt-0.5 block text-[11.5px] leading-snug text-[#6B7380]">{off ? `Not offered with ${c.structure === 'capex' ? 'equipment purchase' : 'the subscription'}` : x.note}</small>
              </button>
            );
          })}
      </div>
      {customs.some((x) => x.kind === 'option' && !notOffered(x.id)) && (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`${eyebrow} mr-1`}>Options</span>
        {customs
          .filter((x) => x.kind === 'option' && !notOffered(x.id))
          .map((x) => {
            const on = extra.includes(x.id);
            return (
              <button key={x.id} type="button" aria-pressed={on} disabled={disabled} onClick={() => flip(x.id)} title={x.note || undefined} className={`h-8 rounded-full px-3 text-[12px] transition-colors duration-200 ${on ? 'border border-teton-ink bg-teton-ink text-white' : 'border border-dashed border-[#C9C4BA] text-[#4E5562] hover:bg-[#FBFAF7]'}`}>
                {on ? `✓ ${x.name}` : `+ ${x.name}`}
              </button>
            );
          })}
      </div>
      )}
    </div>
  );
}

export function ProductsPricing({ book }: { book: PriceBook }) {
  const { control, getValues, setValue } = useFormContext<QuoteDraft>();
  const d = useWatch({ control }) as QuoteDraft;
  const readOnly = useContext(ReadOnlyContext);
  const ps = useMemo(() => dealProducts(d), [d]);
  const choices = useMemo(() => choicesOf(d), [d]);
  // The deal prices with its own copy of the line-up; the price book's may have changed since.
  const dealLineup = lineupOf(d);
  const current = usePriceBookLineup();
  const outdated = current.version > dealLineup.version && !sameLineup(current, dealLineup);
  const vis = visibleSettings(ps, d.presentation);
  const lines = linesOf(d, ps, book);
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
    if (JSON.stringify(cur.lineup ?? null) !== JSON.stringify(next.lineup ?? null)) setValue('lineup', next.lineup, o);
    if (JSON.stringify(cur.extraCores ?? null) !== JSON.stringify(next.extraCores ?? null)) setValue('extraCores', next.extraCores, o);
  };
  const [ask, setAsk] = useState<null | 'sensors'>(null);
  const [toast, setToast] = useState<{ text: string; undo: QuoteDraft } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 12000);
    return () => clearTimeout(t);
  }, [toast]);
  /** Apply new choices; say what changed, with Undo. */
  const choose = (next: Choices) => {
    const before = getValues();
    const a = choicesOf(before);
    write(applyChoices(before, next, book));
    setErr(null);
    const note = changeNote(a, next, book, lineupOf(before));
    setToast(note ? { text: note, undo: before } : null);
  };

  // The concealed finish: an upgrade of the installation (cables behind the wall or above the ceiling), quoted as a
  // range per room after the site survey. Outside the equipment price and the ROI, as before.
  const fin = k.finish ?? { concealed: false, low: 0, high: 0, credit: 0 };
  const finishUpgrade = (
    <div className="px-4 md:pl-[58px] py-2.5 border-b border-[#F1EEE7] bg-[#FCFBF8]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <SwitchButton label="Upgrade to concealed finish" on={choices.finish} disabled={readOnly} onChange={(on) => choose({ ...choices, finish: on })} />
        <span className="min-w-0 flex-1">
          <b className="block text-[12.5px] font-semibold">Upgrade to concealed finish</b>
          <small className="block text-[11.5px] leading-snug text-[#8A919C]">Cables behind the wall or above the ceiling, no raceway · quoted per room after the site survey</small>
        </span>
        {choices.finish && <span className="max-sm:basis-full max-sm:pl-[48px] text-[12.5px] font-semibold tabular-nums whitespace-nowrap">{money(fin.low)}–{money(fin.high)} / room</span>}
      </div>
      <Collapse open={choices.finish}>
        <div className="mt-2.5 grid gap-x-4 gap-y-2.5 sm:grid-cols-3">
          <label className="block">
            <span className="block mb-1 text-[11.5px] font-semibold text-[#4E5562]">Low / room</span>
            <Price name="commercial.finish.low" label="Concealed finish low per room" list={book[SKU.finishConcealedLow]?.list ?? null} pill={false} />
          </label>
          <label className="block">
            <span className="block mb-1 text-[11.5px] font-semibold text-[#4E5562]">High / room</span>
            <Price name="commercial.finish.high" label="Concealed finish high per room" list={book[SKU.finishConcealedHigh]?.list ?? null} pill={false} />
          </label>
          <label className="block">
            <span className="block mb-1 text-[11.5px] font-semibold text-[#4E5562]">Standard install credit / room</span>
            <Price name="commercial.finish.credit" label="Standard credit per room" list={book[SKU.finishStandardCredit]?.list ?? null} pill={false} />
          </label>
        </div>
        <p className="mt-2 text-[12px] text-[#6B7380]">
          Add-on for the deal: <b className="text-teton-ink tabular-nums">{money(n.rooms * Math.max(0, (fin.low ?? 0) - (fin.credit ?? 0)))} to {money(n.rooms * Math.max(0, (fin.high ?? 0) - (fin.credit ?? 0)))}</b> · {n.rooms} rooms × (concealed price − standard credit)
        </p>
      </Collapse>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-[14px] border border-[#ECE8DF] bg-white overflow-hidden">
        <Collapse open={outdated}>
          <div role="status" className="mx-4 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-[#CFE2F8] bg-[#F3F8FE] px-3 py-2.5 text-[12.5px]">
            <span aria-hidden="true">ⓘ</span>
            <span className="flex-1 min-w-[200px]">
              <b>The core products changed in the price book</b> (version {current.version}). This deal still prices with {dealLineup.version ? `version ${dealLineup.version}` : 'the standard line-up'}.
            </span>
            {!readOnly && (
              <button
                type="button"
                className="h-8 rounded-[8px] bg-teton-ink px-3 text-[12px] font-semibold text-white"
                onClick={() => {
                  const before = getValues();
                  setValue('lineup', structuredClone(current), { shouldDirty: true });
                  // Built-in items the price book switched to their own details: keep this deal's price for them.
                  const carried: Record<string, number> = { ...(before.commercial.items ?? {}) };
                  for (const sku of Object.keys(CONVERTIBLE)) {
                    const was = dealLineup.cores.some((x) => SIDES.some((s) => x.sides[s].items.some((e) => e.sku === sku && !e.item)));
                    const now = current.cores.some((x) => SIDES.some((s) => x.sides[s].items.some((e) => e.sku === sku && e.item)));
                    const v = CONVERTIBLE[sku].dealPrice(before.commercial);
                    if (was && now && carried[sku] == null && v != null) carried[sku] = Number(v);
                  }
                  if (JSON.stringify(carried) !== JSON.stringify(before.commercial.items ?? {})) setValue('commercial.items', carried, { shouldDirty: true });
                  setToast({ text: `Updated to the price book’s core products (version ${current.version}). Prices follow it.`, undo: before });
                }}
              >
                Update this deal
              </button>
            )}
          </div>
        </Collapse>
        <BuildPanel
          c={choices}
          onChange={choose}
          disabled={readOnly}
          lineup={dealLineup}
          extra={(d.extraCores ?? []).filter((id) => dealLineup.cores.some((x) => x.id === id))}
          onExtra={(ids) => setValue('extraCores', ids, { shouldDirty: true })}
        />
        <Collapse open={!!toast}>
          {toast && (
            <div role="status" className="mx-4 mt-3 flex items-center gap-3 rounded-[10px] bg-teton-ink px-3 py-2 text-[12.5px] text-white">
              <span aria-hidden="true">⇄</span>
              <span className="flex-1">{toast.text}</span>
              <button type="button" className="font-semibold text-[#9FC7F2] hover:underline" onClick={() => (write(toast.undo), setToast(null))}>Undo</button>
              <button type="button" aria-label="Dismiss" className="text-white/60 hover:text-white" onClick={() => setToast(null)}>✕</button>
            </div>
          )}
        </Collapse>
        {!ps.length && !lines.length ? (
          <div className="px-4 py-6 text-center">
            <p className="text-[13px] text-[#6B7380]">Pick a core product above. Its price book items, and implementation, are added for you.</p>
            {!readOnly && KITS.filter((x) => x.mostUsed).map((kit) => (
              <button key={kit.id} type="button" onClick={() => write(applyKit(getValues(), kit.id, book))} className="mx-auto mt-3 block max-w-md rounded-xl border-[1.5px] border-[#6E5BD0] bg-[#F7F5FE] px-3 py-2.5 text-left transition-colors hover:bg-[#F0ECFD]">
                <b className="block text-[12.5px]">Or start from the most used deal: {kit.label}</b>
                <small className="mt-0.5 block text-[11.5px] leading-snug text-[#8A919C]">{kit.note}</small>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
              <p className={eyebrow}>On the deal · {lines.length}</p>
              <span className="ml-auto text-[11.5px] text-[#8A919C]">Prices start at list; edit any deal price</span>
            </div>
            <div className="hidden md:grid grid-cols-[28px_minmax(0,2fr)_78px_62px_124px_minmax(76px,.8fr)_26px] gap-3 items-center px-4 h-8 border-y border-[#ECE8DF] text-[10.5px] font-semibold uppercase tracking-[.12em] text-[#8A919C]">
              <span /><span>Item</span><span>Billing</span><span className="text-right">List</span><span>Deal price</span><span>Applies to</span><span />
            </div>
            {lines.map((l) => (
              <div key={l.key}>
                <div className={`grid grid-cols-[30px_minmax(0,1fr)_30px] md:grid-cols-[28px_minmax(0,2fr)_78px_62px_124px_minmax(76px,.8fr)_26px] gap-x-3 gap-y-2 items-center px-4 py-2.5 border-b border-[#F1EEE7] ${l.locked ? 'bg-[#FCFBF8]' : ''}`}>
                  <ItemIcon sku={l.sku} item={book[l.sku]} size="w-[28px] h-[28px]" />
                  <div className="min-w-0">
                    {l.locked && l.field ? (
                      <button type="button" onClick={() => setImplOpen(!implOpen)} aria-expanded={implOpen} aria-controls="impl-credit" className="text-left group">
                        <b className="text-[13px] font-semibold group-hover:underline underline-offset-2">{l.name}</b>
                      </button>
                    ) : (
                      <b className="block text-[13px] font-semibold">{l.name}</b>
                    )}
                    <small className="block text-[11.5px] text-[#8A919C] mt-0.5">
                      <span className="font-mono">{book[l.sku]?.itemCode ?? l.code ?? l.sku}</span> · {l.unit}
                      {l.bundle && <> · subscription {money(k.platformRate)} + E-Call {money(k.ecallRate)} − saving</>}
                      {l.key === 'impl' && l.field && pilot && k.installCreditPct > 0 && <b className="text-[#2F8F5B] font-semibold"> · {Math.round(k.installCreditPct * 100)}% credit on pilot sites</b>}
                    </small>
                  </div>
                  <span className="md:hidden col-start-3 row-start-1 justify-self-end">{action(l)}</span>
                  <span className={`max-md:col-start-2 justify-self-start inline-flex h-[22px] items-center rounded-[7px] px-2 text-[11.5px] font-semibold ${l.once ? 'bg-[#FBF0D9] text-[#9A6512]' : 'bg-[#E6F1FC] text-[#2F78C8]'}`}>{l.once ? 'One-time' : 'Monthly'}</span>
                  <ListCell l={l} />
                  <div className="max-md:col-start-2 min-w-0">
                    {l.text ? (
                      <span className="text-[12.5px] text-[#4E5562]">{l.text}</span>
                    ) : l.bundle ? (
                      <BundlePrice sys={l.bundle} list={l.list} label={`${l.name} deal price`} />
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
                {l.key === 'impl' && finishUpgrade}
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
            {!lines.some((l) => l.key === 'impl') && finishUpgrade}
            {err && <p role="alert" className="mx-4 my-2 rounded-lg bg-[#FDF0EE] px-3 py-2 text-[12px] text-[#B4442C]">{err}</p>}
            <Collapse open={!!ask}>
              {ask && (
                <AskPanel
                  d={d}
                  onCancel={() => setAsk(null)}
                  onClearSensors={() => {
                    const r = clearSensors(getValues());
                    write(r.draft);
                    setAsk(null);
                    setErr(r.kept.length ? `Sensors at ${r.kept.join(', ')} come from their floor plan room types; change them in Scope.` : null);
                  }}
                />
              )}
            </Collapse>
            {lines.some((l) => l.key === 'impl' && l.field) && !implOpen && (
              <p className="px-4 py-2 text-[11.5px] text-[#6B7380] bg-[#F6F3EE]">🔒 Implementation can’t be removed. Click its name to credit it (for example 100% on pilot sites).</p>
            )}
          </>
        )}
      </div>

      {/* The settings those items need */}
      {ps.length > 0 && (
        <div className="rounded-[14px] border border-[#ECE8DF] bg-white overflow-hidden">
          {vis.pilot && (
            <Group title="Pilot">
              <SettingRow label="Start with a pilot" hint="Pilot sites are marked per community">
                <Switch name="schedule.withPilot" label="Start with a pilot" />
              </SettingRow>
              {/* Both ways to buy: an equipment purchase's pilot is billed at this rate too (the proposal's pilot section). */}
              {pilot && (
                <SettingRow label="Pilot rate per bed / month" hint={`Standard $${POLICY.standardPilotRate}${!ps.includes('subscription') ? ' · billed during the pilot, before the purchase' : ''}`} note={Number(k.pilotRate) === 0 ? <Tag tone="amber">Free pilot</Tag> : null}>
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
          {vis.ecall && <EcallSettings book={book} opex={d.presentation !== 'capex'} />}
          {vis.capex && <CapexSettings />}
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
        </div>
      )}
    </div>
  );

  function action(l: Line) {
    if (l.locked)
      return (
        <span className="w-[26px] h-[26px] grid place-items-center text-[#8A919C]" title="Always included: credit it instead of removing it" aria-label="Always included">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>
        </span>
      );
    if (l.sensors && !readOnly)
      return (
        <button type="button" onClick={() => setAsk(ask === 'sensors' ? null : 'sensors')} title="Additional sensors are set per community" aria-label="Additional sensor options" aria-expanded={ask === 'sensors'} className="w-[26px] h-[26px] grid place-items-center rounded-[7px] text-[#8A919C] hover:bg-[#F6F3EE] hover:text-teton-ink">
          ⋯
        </button>
      );
    return null;
  }
}

/** Inline question under the items: remove all additional sensors. */
function AskPanel({ d, onCancel, onClearSensors }: { d: QuoteDraft; onCancel: () => void; onClearSensors: () => void }) {
  const btn = 'h-9 rounded-[10px] px-3 text-[12.5px] font-semibold';
  const box = 'mx-4 my-2 rounded-[12px] border border-[#E4D6B5] bg-[#FFFAF0] px-3.5 py-3';
  const c = sensorCounts(d);
  const total = c.reduce((s, x) => s + x.sensors, 0);
  if (!total)
    return (
      <div className={box} role="alertdialog" aria-label="Remove additional sensors">
        <p className="text-[13px] font-semibold">Remove the additional sensor row?</p>
        <p className="mt-0.5 text-[12px] text-[#6B7380]">No communities have additional sensors yet. Set them per community in Communities; the row comes back when they do.</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" className={`${btn} bg-teton-ink text-white`} onClick={onClearSensors}>Remove</button>
          <button type="button" className={`${btn} border border-[#E4E0D6] bg-white`} onClick={onCancel}>Keep it</button>
        </div>
      </div>
    );
  return (
    <div className={box} role="alertdialog" aria-label="Remove all additional sensors">
      <p className="text-[13px] font-semibold">Remove all additional sensors?</p>
      <p className="mt-0.5 text-[12px] text-[#6B7380]">
        {total} {total === 1 ? 'sensor is' : 'sensors are'} set across {c.length} {c.length === 1 ? 'community' : 'communities'} ({c.map((x) => `${x.name} ${x.sensors}`).join(', ')}). This sets them to 0 and removes the row.
        {c.some((x) => x.fromRooms) && ' Communities whose sensors come from floor plan room types keep theirs.'}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" className={`${btn} bg-teton-ink text-white`} onClick={onClearSensors}>Remove and set to 0</button>
        <button type="button" className={`${btn} border border-[#E4E0D6] bg-white`} onClick={onCancel}>Keep them</button>
      </div>
    </div>
  );
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

/** A group of settings with an eyebrow header. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#ECE8DF] last:border-b-0">
      <p className={`${eyebrow} flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-[#F1EEE7]`}>
        {title}
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

function EcallSettings({ book, opex }: { book: PriceBook; opex: boolean }) {
  const { control } = useFormContext<QuoteDraft>();
  const k = useWatch({ control, name: 'commercial' }) as QuoteDraft['commercial'];
  const products = useWatch({ control, name: 'products' }) as DealProduct[] | undefined;
  const perRoom = k.ecallBilling !== 'device';
  const unit = perRoom ? 'room' : 'device';
  const listOf = (o: 'ble' | 'inovonics') => (o === 'ble' ? book[SKU.ecallBle]?.list ?? 10 : book[SKU.ecallInovonics]?.list ?? 15);
  const other = k.ecall === 'ble' ? 'inovonics' : 'ble';
  return (
    <Group title="E-Call">
      {opex && (
        <SettingRow label="Monthly fee counted" hint={perRoom ? 'Rate × rooms (a common area with a device counts as a room); devices beyond the rooms are one-time extras.' : 'Rate × every E-Call device; no separate charge for extra devices.'}>
          <Seg name="commercial.ecallBilling" label="E-Call pricing" options={[['room', 'Per room / mo'], ['device', 'Per device / mo']]} />
        </SettingRow>
      )}
      {opex && perRoom && (
        <SettingRow label={`Additional ${k.ecall === 'inovonics' ? 'pull-cord' : 'button'}`} hint="Each, one-time · devices beyond the rooms">
          <Price name={k.ecall === 'inovonics' ? 'commercial.ecallDevices.inoPullcord' : 'commercial.ecallDevices.bleButton'} label="Additional device price" list={book[k.ecall === 'inovonics' ? SKU.ecallInoPullcord : SKU.ecallBleButton]?.list ?? null} />
        </SettingRow>
      )}
      {opex && (products ?? []).includes('subscription') && (
        <SettingRow label="E-Call installation per bed" hint="One-time, on beds with E-Call only">
          <Price name="commercial.ecallInstallRate" label="E-Call installation per bed" nullable placeholder="0" />
        </SettingRow>
      )}
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
  return (
    <Group title="Equipment purchase">
      <SettingRow label="Software & services billed" hint="Title passes at install; no install charge or license fee">
        <Seg name="commercial.capex.softwareBilling" label="Software & services billed" options={[['monthly', 'Monthly'], ['upfront', 'Upfront']]} />
      </SettingRow>
    </Group>
  );
}

