import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { getVersion } from '@/lib/data/quotes';
import { requireApiUser } from '@/lib/auth/server';
import { launchBrowser } from '@/lib/server/pdfBrowser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A cold start unpacks Chromium; a long proposal takes a few seconds more.
export const maxDuration = 60;

/**
 * The proposal as a PDF file, made by a headless Chrome from the same page the browser prints (its saved
 * wording, layout and format, with each format's own page size and margins). Phones get a real file to share
 * or print, without the browser's print margins and headers.
 */
export async function GET(req: Request, { params }: { params: { versionId: string } }) {
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    await requireApiUser();
    const id = idParam(params.versionId);
    const v = await getVersion(await getDb(), id);
    if (!v || v.status === 'draft') throw Object.assign(new Error('Proposal not found'), { status: 404 });
    const origin = new URL(req.url).origin;
    browser = await launchBrowser();
    const page = await browser.newPage();
    // Open the page as the person asking (their session), so access and content are what they'd see.
    const cookie = req.headers.get('cookie');
    if (cookie) await page.setExtraHTTPHeaders({ cookie });
    const res = await page.goto(`${origin}/proposal/${id}`, { waitUntil: 'networkidle0', timeout: 45000 });
    if (!res || !res.ok()) throw Object.assign(new Error('The proposal page could not be opened'), { status: 502 });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, format: 'letter', margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    const name = `Teton proposal - ${v.inputs.customerName || 'Customer'} (v${v.versionNo}).pdf`;
    const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    return new Response(Buffer.from(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (e) {
    // Access and not-found errors go back as they are; anything else (the browser failing) is logged, with a plain message.
    const status = (e as { status?: number })?.status;
    if (status && status < 500) return jsonError(e);
    console.error('[proposal pdf]', e);
    return Response.json({ error: 'Couldn’t make the PDF just now. Please try again in a moment.' }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}
