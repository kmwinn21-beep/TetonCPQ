/**
 * Pricing guardrails and the concession ladder.
 *
 * Nothing here blocks a quote (v1 has no approval workflow). Each finding says
 * what rule tripped and who would have to approve it; the quote version stores
 * them, and approval_events is where approvals will be recorded once the
 * workflow exists.
 */
import { POLICY } from './catalog';
import type { QuoteDraft } from '@/lib/quote/draft';

export type Severity = 'info' | 'warning' | 'approval';
export type ApproverRole = 'deal_desk' | 'vp_sales_or_ceo';

export interface Finding {
  code:
    | 'FREE_PILOT'
    | 'BELOW_HARD_FLOOR'
    | 'BELOW_POST_PILOT_FLOOR'
    | 'BELOW_SERVICE_TERM_FLOOR'
    | 'PILOT_BELOW_LADDER'
    | 'FULL_CREDIT_WITHOUT_CLAWBACK'
    | 'NONSTANDARD_PILOT_LENGTH'
    | 'ECALL_DISCOUNT'
    | 'COVERAGE_MULTIPLIER_OUT_OF_RANGE';
  severity: Severity;
  message: string;
  requiredApprover?: ApproverRole;
}

export type Rung = 1 | 2 | 3 | 4;

export interface LadderRung {
  rung: Rung;
  title: string;
  terms: string;
  /** What the rep should ask for in return. Draft wording — edit freely. */
  ask: string[];
}

export const LADDER: LadderRung[] = [
  {
    rung: 1,
    title: 'Full list, install upfront',
    terms: '$75 pilot, then list price; installation paid 100% upfront.',
    ask: ['Signed order form with the 36-month service term'],
  },
  {
    rung: 2,
    title: 'Full list, 50% install credit',
    terms: 'Half of installation credited; no clawback.',
    ask: ['Signature by a fixed date', 'Named executive sponsor', 'Agreement to a joint success review at month 3'],
  },
  {
    rung: 3,
    title: 'Full list, full install credit with clawback',
    terms: 'Installation fully credited; credit is clawed back if they don’t convert after the pilot.',
    ask: ['Clawback clause in the order form', 'Written conversion criteria agreed up front', 'Reference call or case study on conversion'],
  },
  {
    rung: 4,
    title: '50% off during pilot, full install credit with clawback',
    terms: 'Pilot subscription at half the standard pilot rate; installation fully credited with clawback.',
    ask: ['Everything on rung 3', 'Multi-site expansion plan with dates', 'Logo / press rights on conversion'],
  },
];

export interface GuardrailResult {
  /** null when the deal sits below the ladder (free pilot or deeper pilot discount). */
  rung: Rung | null;
  rungDetail: LadderRung | null;
  findings: Finding[];
  /** Highest-severity approver any finding needs; null if none. */
  requiredApprover: ApproverRole | null;
}

const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, '')}`;

export function evaluateGuardrails(d: QuoteDraft, listPlatform = 99, listEcall = { ble: 10, inovonics: 15 }): GuardrailResult {
  const k = d.commercial;
  const findings: Finding[] = [];
  const hasPilot = d.schedule.withPilot && d.communities.some((c) => c.pilot);
  const hardFloor = listPlatform * POLICY.hardFloorPct;
  const termFloor = listPlatform * POLICY.serviceTermFloorPct;
  const pilotInstallNet = k.installRate * (1 - k.installCreditPct);

  // --- post-pilot / service-term rates (and any special intro rate) ---
  const rates: Array<[string, number]> = [['Post-pilot rate', k.platformRate]];
  if (k.specialRate != null && k.specialTermMonths > 0) rates.push([`Intro rate (first ${k.specialTermMonths} mo)`, k.specialRate]);
  for (const [label, rate] of rates) {
    if (rate < hardFloor) {
      findings.push({ code: 'BELOW_HARD_FLOOR', severity: 'approval', requiredApprover: 'deal_desk', message: `${label} ${money(rate)} is below the hard floor of ${money(hardFloor)} (50% of list). Route to Deal Desk.` });
    } else if (rate < POLICY.postPilotFloor) {
      findings.push({ code: 'BELOW_POST_PILOT_FLOOR', severity: 'warning', message: `${label} ${money(rate)} is below the post-pilot floor of ${money(POLICY.postPilotFloor)}.` });
    } else if (rate < termFloor) {
      findings.push({ code: 'BELOW_SERVICE_TERM_FLOOR', severity: 'warning', message: `${label} ${money(rate)} is below 90% of list (${money(termFloor)}).` });
    }
  }

  // --- pilot terms and the ladder ---
  let rung: Rung | null = 1;
  if (hasPilot) {
    const freePilot = k.pilotRate === 0 && pilotInstallNet === 0;
    if (freePilot) {
      rung = null;
      findings.push({
        code: 'FREE_PILOT',
        severity: 'approval',
        requiredApprover: 'vp_sales_or_ceo',
        message: 'Free pilot (no subscription and no install) sits below the concession ladder. Needs written approval from the VP of Sales or the CEO.',
      });
    } else if (k.pilotRate < POLICY.standardPilotRate * 0.5) {
      rung = null;
      findings.push({
        code: 'PILOT_BELOW_LADDER',
        severity: 'approval',
        requiredApprover: 'deal_desk',
        message: `Pilot rate ${money(k.pilotRate)} is more than 50% off the standard ${money(POLICY.standardPilotRate)} pilot — below rung 4. Route to Deal Desk.`,
      });
    } else if (k.pilotRate < POLICY.standardPilotRate) {
      rung = 4;
    } else if (k.installCreditPct >= 1 || k.installCreditPct > 0.5) {
      rung = 3;
    } else if (k.installCreditPct > 0) {
      rung = 2;
    }
    if (d.schedule.pilotLengthMonths !== POLICY.standardPilotMonths) {
      findings.push({ code: 'NONSTANDARD_PILOT_LENGTH', severity: 'info', message: `Pilot is ${d.schedule.pilotLengthMonths} months; standard is ${POLICY.standardPilotMonths}.` });
    }
  } else if (k.installCreditPct > 0.5) {
    rung = 3;
  } else if (k.installCreditPct > 0) {
    rung = 2;
  }

  if ((rung === 3 || rung === 4) && k.installCreditPct > 0.5 && !k.installClawback) {
    findings.push({ code: 'FULL_CREDIT_WITHOUT_CLAWBACK', severity: 'warning', message: 'Install credit above 50% should carry a clawback if the customer doesn’t convert.' });
  }

  if (k.ecall !== 'none') {
    const list = listEcall[k.ecall];
    if (k.ecallRate < list) {
      findings.push({ code: 'ECALL_DISCOUNT', severity: 'info', message: `E-Call at ${money(k.ecallRate)} is ${Math.round((1 - k.ecallRate / list) * 100)}% off its ${money(list)} list price.` });
    }
  }

  const [lo, hi] = POLICY.fullFacilityRange;
  if (d.communities.some((c) => c.coverage === 'full_facility') && (k.fullFacilityMultiplier < lo || k.fullFacilityMultiplier > hi)) {
    findings.push({ code: 'COVERAGE_MULTIPLIER_OUT_OF_RANGE', severity: 'warning', message: `Full-facility multiplier ${k.fullFacilityMultiplier}× is outside the usual ${lo}–${hi}× range.` });
  }

  const requiredApprover: ApproverRole | null = findings.some((f) => f.requiredApprover === 'vp_sales_or_ceo')
    ? 'vp_sales_or_ceo'
    : findings.some((f) => f.requiredApprover === 'deal_desk')
      ? 'deal_desk'
      : null;

  return { rung, rungDetail: rung ? LADDER[rung - 1] : null, findings, requiredApprover };
}
