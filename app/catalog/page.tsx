import { getDb } from "@/lib/db/client";
import { getPriceBookSettings, listPriceBookRows } from "@/lib/data/priceBook";
import { PriceBookModule } from "@/components/catalog/PriceBookModule";
import { requirePageUser } from "@/lib/auth/server";
import { getLineup } from "@/lib/data/lineup";
import { allowed } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const user = await requirePageUser();
  const db = await getDb();
  const rows = await listPriceBookRows(db);
  // What they can change comes from roles & permissions.
  const canDelete = allowed(user, "pricebook.delete");
  const canLineup = allowed(user, "pricebook.lineup");
  // Deleted items (to look at and restore).
  const archived = canDelete ? await listPriceBookRows(db, { archived: true }) : [];
  const settings = await getPriceBookSettings(db);
  // Core products.
  const lineup = canLineup ? await getLineup(db) : null;
  return <PriceBookModule rows={rows} canEdit={allowed(user, "pricebook.edit")} canDelete={canDelete} canSettings={canLineup} softwareBilling={settings.softwareBilling} lineup={lineup} archived={archived} />;
}
