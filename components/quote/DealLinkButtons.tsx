'use client';

/**
 * Beside "View proposal" on the deal page, once the deal has a shared link: "Copy Proposal Link" (the public link to
 * the clipboard) and, when its Resources tab is on, "Deal Room" (opens the deal room editor).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';

export function DealLinkButtons({ quoteId }: { quoteId: number }) {
  const [link, setLink] = useState<{ token: string; versionId: number } | null>(null);
  const [room, setRoom] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void fetch(`/api/quotes/${quoteId}/share`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { link?: { token: string; versionId: number } | null; roomEnabled?: boolean; canEdit?: boolean } | null) => {
        setLink(j?.link ?? null);
        // The editor opens for people who can change the deliverables.
        setRoom(!!j?.roomEnabled && j?.canEdit !== false);
      });
  }, [quoteId]);
  if (!link) return null;
  const copy = async () => {
    const url = `${window.location.origin}/p/${link.token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy the link:', url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <>
      <button type="button" className={`btn-secondary whitespace-nowrap transition-colors duration-200 motion-reduce:transition-none ${copied ? '!bg-[#2E9E5B] !text-white !border-[#2E9E5B]' : ''}`} onClick={() => void copy()} title="Copy the public link to the proposal">
        {copied ? '✓ Copied' : (
          <>
            <span className="sm:hidden">Copy link</span>
            <span className="hidden sm:inline">Copy Proposal Link</span>
          </>
        )}
      </button>
      {room && (
        <Link href={`/proposal/${link.versionId}?resources=1`} className="btn-secondary whitespace-nowrap text-center" title="Open the deal room editor">
          Deal Room
        </Link>
      )}
    </>
  );
}
