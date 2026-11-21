/**
 * A headless Chromium for making proposal PDFs: the serverless build (@sparticuz/chromium) on Vercel, or a
 * local Chrome elsewhere (CHROME_PATH, else the usual install places).
 */
import { existsSync } from 'node:fs';
import type { Browser } from 'puppeteer-core';

const LOCAL = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean) as string[];

export async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import('puppeteer-core');
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true, defaultViewport: { width: 1280, height: 900 } });
  }
  const executablePath = LOCAL.find((p) => existsSync(p));
  if (!executablePath) throw Object.assign(new Error('No Chrome found to make the PDF (set CHROME_PATH)'), { status: 500 });
  return puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'], defaultViewport: { width: 1280, height: 900 } });
}
