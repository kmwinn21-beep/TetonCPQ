import { getDb } from "@/lib/db/client";
import { getPriceBookSettings, listPriceBookRows } from "@/lib/data/priceBook";
import { PriceBookModule } from "@/components/catalog/PriceBookModule";
import { requirePageUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const user = await requirePageUser();
  const db = await getDb();
  const rows = await listPriceBookRows(db);
  const settings = await getPriceBookSettings(db);
  return <PriceBookModule rows={rows} canEdit={user.role === "admin"} softwareBilling={settings.softwareBilling} />;
}
