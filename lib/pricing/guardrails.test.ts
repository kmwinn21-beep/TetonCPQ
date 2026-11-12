import { describe, expect, it } from 'vitest';
import { defaultDraft } from '@/lib/quote/draft';
import { priceBook } from './catalog';
import { evaluateGuardrails } from './guardrails';

const draft = () => defaultDraft('Test SL', priceBook(), new Date(Date.UTC(2026, 10, 12)));
const codes = (r: ReturnType<typeof evaluateGuardrails>) => r.findings.map((f) => f.code);

describe('concession ladder', () => {
  it('standard deal is rung 1 with no findings', () => {
    const r = evaluateGuardrails(draft());
    expect(r.rung).toBe(1);
    expect(r.findings).toEqual([]);
  });
  it('50% install credit is rung 2', () => {
    const d = draft();
    d.commercial.installCreditPct = 0.5;
    expect(evaluateGuardrails(d).rung).toBe(2);
  });
  it('full install credit is rung 3 and wants a clawback', () => {
    const d = draft();
    d.commercial.installCreditPct = 1;
    expect(evaluateGuardrails(d).rung).toBe(3);
    expect(codes(evaluateGuardrails(d))).toContain('FULL_CREDIT_WITHOUT_CLAWBACK');
    d.commercial.installClawback = true;
    expect(codes(evaluateGuardrails(d))).not.toContain('FULL_CREDIT_WITHOUT_CLAWBACK');
  });
  it('half-price pilot is rung 4', () => {
    const d = draft();
    d.commercial.pilotRate = 37.5;
    d.commercial.installCreditPct = 1;
    d.commercial.installClawback = true;
    expect(evaluateGuardrails(d).rung).toBe(4);
  });
  it('free pilot (no subscription, no install) is below the ladder and needs VP Sales / CEO', () => {
    const d = draft();
    d.commercial.pilotRate = 0;
    d.commercial.installCreditPct = 1;
    const r = evaluateGuardrails(d);
    expect(r.rung).toBeNull();
    expect(r.requiredApprover).toBe('vp_sales_or_ceo');
    expect(codes(r)).toContain('FREE_PILOT');
  });
  it('$0 pilot subscription but paid install is not a free pilot — still below rung 4', () => {
    const d = draft();
    d.commercial.pilotRate = 0;
    const r = evaluateGuardrails(d);
    expect(codes(r)).toEqual(['PILOT_BELOW_LADDER']);
    expect(r.requiredApprover).toBe('deal_desk');
  });
});

describe('rate floors', () => {
  const at = (rate: number) => {
    const d = draft();
    d.commercial.platformRate = rate;
    return evaluateGuardrails(d);
  };
  it('$99 list: no finding', () => expect(codes(at(99))).toEqual([]));
  it('$89.05: below 90% of list ($89.10) — soft warning', () => expect(codes(at(89.05))).toEqual(['BELOW_SERVICE_TERM_FLOOR']));
  it('$85: below the $89 post-pilot floor — warning', () => expect(codes(at(85))).toEqual(['BELOW_POST_PILOT_FLOOR']));
  it('$45: below the 50% hard floor — Deal Desk', () => {
    const r = at(45);
    expect(codes(r)).toEqual(['BELOW_HARD_FLOOR']);
    expect(r.requiredApprover).toBe('deal_desk');
  });
  it('intro rate is checked too', () => {
    const d = draft();
    d.commercial.specialRate = 80;
    d.commercial.specialTermMonths = 6;
    expect(codes(evaluateGuardrails(d))).toEqual(['BELOW_POST_PILOT_FLOOR']);
  });
});
