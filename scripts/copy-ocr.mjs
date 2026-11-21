// Copies the OCR engine (tesseract.js worker + wasm core) and English data into public/ocr, so the
// "Fill numbers from plan" reader loads them from this site, not a CDN. Runs after install and before builds.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const out = path.resolve('public/ocr');
mkdirSync(out, { recursive: true });
const dir = (pkg) => path.dirname(require.resolve(`${pkg}/package.json`));
const files = [
  [path.join(dir('tesseract.js'), 'dist/worker.min.js'), 'worker.min.js'],
  [path.join(dir('tesseract.js-core'), 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [path.join(dir('tesseract.js-core'), 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [path.join(dir('@tesseract.js-data/eng'), '4.0.0_best_int/eng.traineddata.gz'), 'eng.traineddata.gz'],
];
for (const [from, to] of files) {
  if (!existsSync(from)) throw new Error(`OCR file missing: ${from}`);
  copyFileSync(from, path.join(out, to));
}
console.log(`OCR files copied to ${out}`);
