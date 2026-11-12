import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { getExportHtml } from '@/lib/data/quotes';

/** The proposal exactly as it was when it was recorded as sent. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const html = await getExportHtml(await getDb(), idParam(params.id));
    if (!html) return new Response('Not found', { status: 404 });
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // A stored snapshot: never execute scripts from it.
        'content-security-policy': "script-src 'none'; object-src 'none'; base-uri 'none'",
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
