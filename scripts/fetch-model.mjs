import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'models');
const out = join(dir, 'face_landmarker.task');

if (existsSync(out) && !process.argv.includes('--force')) {
  console.log('[fetch-model] model already present:', out);
  process.exit(0);
}
mkdirSync(dir, { recursive: true });
console.log('[fetch-model] downloading', MODEL_URL);
const res = await fetch(MODEL_URL);
if (!res.ok || !res.body) {
  console.error('[fetch-model] download failed:', res.status, res.statusText);
  process.exit(1);
}
await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
console.log('[fetch-model] saved', out);
