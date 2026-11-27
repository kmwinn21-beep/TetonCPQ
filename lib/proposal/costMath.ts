/**
 * The math behind the business case's cost lines (installation and additional
 * sensors), from the price lines. Shared by the proposal and the inputs page's
 * live preview.
 */
import { lineTotal, type PriceLine } from '@/lib/pricing/lines';
import { SKU } from '@/lib/pricing/catalog';
import { count, usd } from '@/lib/format';

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
/** The pilot install credit (installation and common-area setup lines carry it). */
const isInstallCredit = (l: PriceLine) => !!l.concessionCode?.startsWith('INSTALL_CREDIT');

/** "119 beds × $400" (+ more groups when rates differ by community), from one-time install lines. */
export function installMath(ls: PriceLine[]): { gross: number; credit: number; text: string } {
  const install = ls.filter((l) => l.billing === 'one_time' && l.sku === SKU.install && !isInstallCredit(l));
  // Only installation's own credit: the common-area setup credit shares the install credit's code (see commonAreaColumns).
  const credit = -sum(ls.filter((l) => isInstallCredit(l) && l.sku === SKU.install).map(lineTotal));
  const groups = new Map<number, number>();
  install.forEach((l) => groups.set(l.unitNet, (groups.get(l.unitNet) ?? 0) + l.qty));
  const parts = Array.from(groups.entries()).map(([unit, qty]) => `${count(qty)} beds × ${usd(unit, { cents: !Number.isInteger(unit) })}`);
  const gross = sum(install.map(lineTotal));
  const text = (parts.join(' + ') || 'No installation') + (credit > 0 ? ` − ${usd(credit)} pilot credit` : '');
  return { gross, credit, text };
}

/** "50 sensors × $300", from one-time sensor lines. */
/**
 * "50 sensors × $300", at list price, less any discount shown as a credit ("− $15,000 pilot credit"
 * when the discounted sensors are all at pilot sites), so free or discounted sensors read like the install credit.
 */
export function sensorMath(ls: PriceLine[], isPilot: (position: number | null | undefined) => boolean = () => false): { total: number; text: string } {
  const sensors = ls.filter((l) => l.billing === 'one_time' && l.sku === SKU.sensor && l.qty > 0 && !l.concessionCode?.startsWith('SENSOR_CREDIT'));
  // The pilot install credit applied to sensors (its own price line).
  const sensorCredit = ls.filter((l) => l.concessionCode?.startsWith('SENSOR_CREDIT'));
  const groups = new Map<number, number>();
  sensors.forEach((l) => {
    const unit = Math.max(l.unitList, l.unitNet);
    groups.set(unit, (groups.get(unit) ?? 0) + l.qty);
  });
  const parts = Array.from(groups.entries()).map(([unit, qty]) => `${count(qty)} ${qty === 1 ? 'sensor' : 'sensors'} × ${usd(unit)}`);
  const discounted = sensors.filter((l) => l.unitList > l.unitNet);
  const credit = sum(discounted.map((l) => l.qty * (l.unitList - l.unitNet))) - sum(sensorCredit.map(lineTotal));
  const credited = [...discounted, ...sensorCredit];
  const label = credited.length && credited.every((l) => isPilot(l.communityPosition)) ? 'pilot credit' : 'credit';
  const text = (parts.join(' + ') || 'None included') + (credit > 0 ? ` − ${usd(credit)} ${label}` : '');
  return { total: sum([...sensors, ...sensorCredit].map(lineTotal)), text };
}


/**
 * A cost line as table columns: units, price per unit (a range when it varies,
 * e.g. full-facility sites), the conversion credit per unit and how many units
 * it covers (pilot sites only), and the total after credits.
 */
export interface ColumnRow {
  units: number;
  minPer: number;
  maxPer: number;
  creditMin: number;
  creditMax: number;
  creditUnits: number;
  total: number;
}

function columns(gross: PriceLine[], credits: PriceLine[]): ColumnRow {
  const per = gross.map((l) => l.unitNet);
  const cr = credits.map((l) => -l.unitNet);
  return {
    units: sum(gross.map((l) => l.qty)),
    minPer: per.length ? Math.min(...per) : 0,
    maxPer: per.length ? Math.max(...per) : 0,
    creditMin: cr.length ? Math.min(...cr) : 0,
    creditMax: cr.length ? Math.max(...cr) : 0,
    creditUnits: sum(credits.map((l) => l.qty)),
    total: sum([...gross, ...credits].map(lineTotal)),
  };
}

/** Installation: beds × price per bed, less the pilot install credit on pilot beds. */
export const installColumns = (ls: PriceLine[]) =>
  columns(
    ls.filter((l) => l.billing === 'one_time' && l.sku === SKU.install && !isInstallCredit(l) && l.qty > 0),
    ls.filter((l) => isInstallCredit(l) && l.sku === SKU.install && l.qty > 0),
  );

/** Common-area sensor setup: sensors × setup price, less the pilot install credit on pilot sites (like installation). */
export const commonAreaColumns = (ls: PriceLine[]) =>
  columns(
    ls.filter((l) => l.billing === 'one_time' && l.sku === SKU.commonAreaSetup && !isInstallCredit(l) && l.qty > 0),
    ls.filter((l) => isInstallCredit(l) && l.sku === SKU.commonAreaSetup && l.qty > 0),
  );

/** Additional sensors: sensors × price, less the sensor credit at pilot sites. */
export const sensorColumns = (ls: PriceLine[]) =>
  columns(
    ls.filter((l) => l.billing === 'one_time' && l.sku === SKU.sensor && l.qty > 0 && !l.concessionCode?.startsWith('SENSOR_CREDIT')),
    ls.filter((l) => l.concessionCode?.startsWith('SENSOR_CREDIT') && l.qty > 0),
  );
