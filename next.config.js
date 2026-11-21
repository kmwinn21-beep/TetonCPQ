/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ['@libsql/client', '@sparticuz/chromium', 'puppeteer-core'],
    // The PDF route's headless Chromium (compressed browser files the bundler can't see on its own).
    outputFileTracingIncludes: { '/api/proposals/[versionId]/pdf': ['./node_modules/@sparticuz/chromium/bin/**'] },
  },
};
