import { getDb } from "@/lib/db/client";
import { getPriceBookSettings, listPriceBookRows } from "@/lib/data/priceBook";
import { SoftwareBillingDefault } from "@/components/catalog/SoftwareBillingDefault";
import { PriceBookModule } from "@/components/catalog/PriceBookModule";
import { POLICY } from "@/lib/pricing/catalog";
import { LADDER } from "@/lib/pricing/guardrails";
import { requirePageUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const user = await requirePageUser();
  const db = await getDb();
  const rows = await listPriceBookRows(db);
  const settings = await getPriceBookSettings(db);
  return (
    <PriceBookModule
      rows={rows}
      canEdit={user.role === "admin"}
      policy={
        <>
          <SoftwareBillingDefault
            initial={settings.softwareBilling}
            canEdit={user.role === "admin"}
          />
          <div className="card">
            <h2 className="text-base font-semibold mb-3">Policy</h2>
            <ul className="text-sm space-y-1 list-disc pl-5">
              <li>
                Standard pilot: {POLICY.standardPilotMonths} months at $
                {POLICY.standardPilotRate}/bed, converting to a{" "}
                {POLICY.serviceTermMonths}-month term with a break at month 3.
              </li>
              <li>
                Post-pilot floor ${POLICY.postPilotFloor}/bed (warning).
                Service-term rate below {POLICY.serviceTermFloorPct * 100}% of
                list: warning.
              </li>
              <li>
                Below {POLICY.hardFloorPct * 100}% of list: route to Deal Desk.
              </li>
              <li>
                Free pilot (no subscription and no install): written approval
                from VP Sales or CEO.
              </li>
            </ul>
            <h3 className="text-sm font-semibold mt-4 mb-2">
              Concession ladder — every rung stays paid
            </h3>
            <ol className="text-sm space-y-2">
              {LADDER.map((r) => (
                <li key={r.rung}>
                  <span className="font-medium">
                    Rung {r.rung}: {r.title}.
                  </span>{" "}
                  {r.terms}
                  <span className="block text-teton-ui-gray">
                    Ask: {r.ask.join("; ")}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </>
      }
    />
  );
}
