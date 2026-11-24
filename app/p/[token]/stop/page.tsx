import { getDb } from '@/lib/db/client';
import { linkByToken } from '@/lib/data/shareLinks';
import { muteReplies } from '@/lib/data/prospectMail';

export const dynamic = 'force-dynamic';

/** "Stop these emails" from a reply email: no more emails about replies and comments on this proposal. */
export default async function StopEmails({ params, searchParams }: { params: { token: string }; searchParams: { e?: string; s?: string } }) {
  const db = await getDb();
  const l = await linkByToken(db, params.token);
  const ok = !!l && (await muteReplies(db, l, String(searchParams.e ?? ''), String(searchParams.s ?? '')));
  return (
    <main className="min-h-screen bg-[#FBF8F3] flex items-center justify-center px-4" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="w-full max-w-[420px] rounded-[18px] border border-[#ECE7DF] bg-white px-7 py-7 shadow-[0_10px_30px_rgba(0,0,0,.06)]">
        <h1 className="text-[20px] font-semibold text-teton-ink">{ok ? 'You won’t get these emails anymore' : 'That link didn’t work'}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[#5A6270]">
          {ok ? <>No more emails about replies and comments on this proposal. You can still open it and see them there.</> : 'Use the “Stop these emails” link from the email itself.'}
        </p>
        {ok && l && (
          <a className="mt-5 inline-block rounded-[11px] bg-teton-ink px-4 py-2.5 text-[13.5px] font-semibold text-white" href={`/p/${l.token}`}>
            Open the proposal
          </a>
        )}
      </div>
    </main>
  );
}
