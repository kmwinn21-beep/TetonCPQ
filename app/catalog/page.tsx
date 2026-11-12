import { getDb } from '@/lib/db/client';
import { loadPriceBook } from '@/lib/data/quotes';
import { POLICY } from '@/lib/pricing/catalog';
import { LADDER } from '@/lib/pricing/guardrails';
import { requirePageUser } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

const MODEL_LABEL: Record<string, string> = {
  per_bed_month: 'per bed / month',
  per_bed_once: 'per bed, one-time',
  per_unit_once: 'each, one-time',
  per_unit_month: 'each / month',
  multiplier: '× rooms-only price',
};

export default async function CatalogPage() {
  await requirePageUser();
  const { products } = await loadPriceBook(await getDb());
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Price book</h1>
        <p className="text-sm text-teton-ui-gray">US list prices and pricing policy. New quotes start from these.</p>
      </div>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-teton-almost-white text-left text-xs text-teton-dark-gray">
            <tr>
              <th className="px-4 py-2.5 font-medium">Product</th>
              <th className="px-4 py-2.5 font-medium text-right">List</th>
              <th className="px-4 py-2.5 font-medium">Unit</th>
              <th className="px-4 py-2.5 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.sku} className="border-t border-teton-off-white">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{p.pricingModel === 'multiplier' ? `${p.list}×` : `$${p.list}`}</td>
                <td className="px-4 py-3 text-teton-ui-gray">{MODEL_LABEL[p.pricingModel]}</td>
                <td className="px-4 py-3 text-teton-dark-gray">{p.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2 className="text-base font-semibold mb-3">Policy</h2>
        <ul className="text-sm space-y-1 list-disc pl-5">
          <li>Standard pilot: {POLICY.standardPilotMonths} months at ${POLICY.standardPilotRate}/bed, converting to a {POLICY.serviceTermMonths}-month term with a break at month 3.</li>
          <li>Post-pilot floor ${POLICY.postPilotFloor}/bed (warning). Service-term rate below {POLICY.serviceTermFloorPct * 100}% of list: warning.</li>
          <li>Below {POLICY.hardFloorPct * 100}% of list: route to Deal Desk.</li>
          <li>Free pilot (no subscription and no install): written approval from VP Sales or CEO.</li>
        </ul>
        <h3 className="text-sm font-semibold mt-4 mb-2">Concession ladder — every rung stays paid</h3>
        <ol className="text-sm space-y-2">
          {LADDER.map((r) => (
            <li key={r.rung}>
              <span className="font-medium">Rung {r.rung}: {r.title}.</span> {r.terms}
              <span className="block text-teton-ui-gray">Ask: {r.ask.join('; ')}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
