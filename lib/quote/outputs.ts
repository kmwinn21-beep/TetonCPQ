/**
 * What a saved version stores: model outputs (without traces) and the upfront
 * price, plus its price lines and guardrails. Pure, so the proposal page can
 * compute a preview in the browser exactly the way a save computes it.
 */
import { runModel, type ModelResult } from '@/lib/model';
import { computeCapex, isEquipmentCapex, type CapexResult } from '@/lib/pricing/capex';
import { SKU, type PriceBook } from '@/lib/pricing/catalog';
import { evaluateGuardrails, type GuardrailResult } from '@/lib/pricing/guardrails';
import { buildPriceLines, type PriceLine } from '@/lib/pricing/lines';
import type { QuoteDraft } from './draft';
import { toModelInputs } from './toModelInputs';

export type StoredOutputs = Omit<ModelResult, 'traces'> & { capex?: Omit<CapexResult, 'trace'> };

export function computeOutputs(draft: QuoteDraft, book: PriceBook): { outputs: StoredOutputs; guardrails: GuardrailResult; lines: PriceLine[] } {
  const inputs = toModelInputs(draft);
  const { traces: _traces, ...model } = runModel(inputs);
  const { trace: _capexTrace, ...capex } = computeCapex(draft);
  const outputs: StoredOutputs = { ...model, capex };
  const guardrails = evaluateGuardrails(draft, book[SKU.platform]?.list ?? 99, {
    ble: book[SKU.ecallBle]?.list ?? 10,
    inovonics: book[SKU.ecallInovonics]?.list ?? 15,
  });
  return { outputs, guardrails, lines: buildPriceLines(draft, inputs, book) };
}

/**
 * The equipment-purchase figures for a version: the stored ones, or (for a
 * version saved before equipment-purchase pricing) computed from its inputs.
 */
export function capexFor(outputs: { capex?: unknown } | null | undefined, draft: QuoteDraft): Omit<CapexResult, 'trace'> {
  if (isEquipmentCapex(outputs?.capex)) return outputs!.capex as Omit<CapexResult, 'trace'>;
  const { trace: _t, ...c } = computeCapex(draft);
  return c;
}
