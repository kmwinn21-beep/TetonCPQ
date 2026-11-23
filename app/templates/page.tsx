import { getDb } from '@/lib/db/client';
import { listTemplates } from '@/lib/data/bcTemplates';
import { requirePageUser } from '@/lib/auth/server';
import { TemplatesList } from '@/components/templates/TemplatesList';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const user = await requirePageUser();
  const templates = await listTemplates(await getDb(), user);
  return (
    <div className="max-w-5xl mx-auto">
      <TemplatesList initial={templates} />
    </div>
  );
}
