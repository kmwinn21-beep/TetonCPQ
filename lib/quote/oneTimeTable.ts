/**
 * One-time charges by community, for the Pricing check: installation and extra sensors at the deal's prices, the
 * pilot credits on each, and what's due. Read from the deal's price lines, so it matches what's billed.
 */
import { SKU } from '@/lib/pricing/catalog';
import { lineTotal, type PriceLine } from '@/lib/pricing/lines';
import { scopeOf, type QuoteDraft } from './draft';

export interface OneTimeRow {
  community: string;
  /** Residents (billed beds). */
  beds: number;
  /** Rooms installed (one installation per room; fewer than beds when residents share rooms). */
  installs: number;
  install: number;
  installCredit: number;
  installDue: number;
  sensors: number;
  sensorAmount: number;
  sensorCredit: number;
  sensorDue: number;
  total: number;
}

export interface OneTimeTable {
  rows: OneTimeRow[];
  total: OneTimeRow;
  /** One price used for every installation / extra sensor (shown in the header), else null. */
  installPrice: number | null;
  installCreditEach: number | null;
  sensorPrice: number | null;
  sensorCreditEach: number | null;
  /** Some community installs fewer rooms than it has beds (shared rooms): show the rooms column. */
  showInstalls: boolean;
}

const isInstall = (l: PriceLine) => l.sku === SKU.install && !/credit/i.test(l.description);
const isInstallCredit = (l: PriceLine) => l.sku === SKU.install && /credit/i.test(l.description);
const isSensor = (l: PriceLine) => l.sku === SKU.sensor && !/credit/i.test(l.description);
const isSensorCredit = (l: PriceLine) => l.sku === SKU.sensor && /credit/i.test(l.description);
const sum = (ls: PriceLine[]) => ls.reduce((s, l) => s + lineTotal(l), 0);
const one = (vs: number[]) => (vs.length && vs.every((v) => Math.abs(v - vs[0]) < 0.005) ? vs[0] : null);

/** Null when the deal has no installation or extra sensor charges (e.g. equipment purchase only). */
export function oneTimeTable(draft: QuoteDraft, lines: PriceLine[]): OneTimeTable | null {
  if (!lines.some((l) => isInstall(l) || isSensor(l))) return null;
  const ecallOn = draft.commercial.ecall !== 'none';
  const rows: OneTimeRow[] = draft.communities.map((c, i) => {
    const ls = lines.filter((l) => l.communityPosition === i);
    const install = sum(ls.filter(isInstall));
    const installCredit = sum(ls.filter(isInstallCredit));
    const sensorAmount = sum(ls.filter(isSensor));
    const sensorCredit = sum(ls.filter(isSensorCredit));
    return {
      community: c.name || `Community ${i + 1}`,
      beds: scopeOf(c, ecallOn).priced,
      installs: ls.filter(isInstall).reduce((s, l) => s + l.qty, 0),
      install,
      installCredit,
      installDue: install + installCredit,
      sensors: ls.filter(isSensor).reduce((s, l) => s + l.qty, 0),
      sensorAmount,
      sensorCredit,
      sensorDue: sensorAmount + sensorCredit,
      total: install + installCredit + sensorAmount + sensorCredit,
    };
  });
  const keys = ['beds', 'installs', 'install', 'installCredit', 'installDue', 'sensors', 'sensorAmount', 'sensorCredit', 'sensorDue', 'total'] as const;
  const total = { community: 'Total' } as OneTimeRow;
  for (const k of keys) total[k] = rows.reduce((s, r) => s + r[k], 0);
  return {
    rows,
    total,
    installPrice: one(lines.filter(isInstall).map((l) => l.unitNet)),
    installCreditEach: one(lines.filter(isInstallCredit).map((l) => l.unitNet)),
    sensorPrice: one(lines.filter(isSensor).map((l) => l.unitNet)),
    sensorCreditEach: one(lines.filter(isSensorCredit).map((l) => l.unitNet)),
    showInstalls: rows.some((r) => r.installs !== r.beds),
  };
}
