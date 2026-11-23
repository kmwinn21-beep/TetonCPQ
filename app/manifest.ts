import type { MetadataRoute } from 'next';

/**
 * Web app manifest. Opened from a phone's Home Screen, the whole site is the app (scope "/"), so moving between
 * pages (deals, a deal, its proposal) never drops into the in-app browser bar.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Teton Proposal Generator',
    short_name: 'Proposals',
    description: 'Deal assumptions, ROI model, pricing guardrails and proposals for Teton sales.',
    id: '/',
    start_url: '/deals',
    scope: '/',
    display: 'standalone',
    background_color: '#F2F3F3',
    theme_color: '#1E1E1E',
    icons: [{ src: '/icon.png', sizes: '734x686', type: 'image/png', purpose: 'any' }],
  };
}
