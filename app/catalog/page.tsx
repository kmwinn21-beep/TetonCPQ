import { getDb } from "@/lib/db/client";
import { getPriceBookSettings, listPriceBookRows } from "@/lib/data/priceBook";
import { PriceBookModule } from "@/components/catalog/PriceBookModule";
import { requirePageUser } from "@/lib/auth/server";
import { getLineup } from "@/lib/data/lineup";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const user = await requirePageUser();
  const db = await getDb();
  const rows = await listPriceBookRows(db);
  // Deleted items (admins: to look at and restore).
  const archived = user.role === "admin" ? await listPriceBookRows(db, { archived: true }) : [];
  const settings = await getPriceBookSettings(db);
  // Core products: admins only.
  const lineup = user.role === "admin" ? await getLineup(db) : null;
  return <PriceBookModule rows={rows} canEdit={user.role === "admin"} softwareBilling={settings.softwareBilling} lineup={lineup} archived={archived} />;
}
