/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    // Pages read live data (price book, deals): coming back to a page fetches it again instead of showing the copy
    // from before a change (Next keeps dynamic pages for 30 s by default).
    staleTimes: { dynamic: 0 },
    serverComponentsExternalPackages: ['@libsql/client', '@sparticuz/chromium', 'puppeteer-core'],
    // The PDF route's headless Chromium (compressed browser files the bundler can't see on its own).
    outputFileTracingIncludes: { '/api/proposals/[versionId]/pdf': ['./node_modules/@sparticuz/chromium/bin/**'] },
  },
};
