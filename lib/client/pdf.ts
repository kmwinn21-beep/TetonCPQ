'use client';

/**
 * pdf.js, loaded on first use (it's large), with its worker. Scripts inside a
 * PDF never run: eval is off (the fix for CVE-2024-4367 on this version).
 */
type PdfJs = typeof import('pdfjs-dist');
let lib: Promise<PdfJs> | null = null;

export function pdfjs(): Promise<PdfJs> {
  if (!lib) {
    lib = import('pdfjs-dist').then((m) => {
      m.GlobalWorkerOptions.workerPort = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url));
      return m;
    });
  }
  return lib;
}

export async function openPdf(url: string) {
  const m = await pdfjs();
  return m.getDocument({ url, isEvalSupported: false, enableXfa: false, withCredentials: true }).promise;
}
