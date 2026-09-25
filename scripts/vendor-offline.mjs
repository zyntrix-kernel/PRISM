// Vendors the hand-tracking runtime for fully-offline use:
// - MediaPipe wasm binaries (copied from the installed npm package)
// - hand_landmarker.task model (downloaded once from the MediaPipe model hub)
// Output: public/wasm/ + public/models/ (gitignored, rebuilt by this script).
// Usage: npm run package:usb  (vendors, then builds dist/)
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, '..');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const wasmSrc = path.join(repo, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDest = path.join(repo, 'public', 'wasm');
const modelDest = path.join(repo, 'public', 'models', 'hand_landmarker.task');

await mkdir(wasmDest, { recursive: true });
await mkdir(path.dirname(modelDest), { recursive: true });

const files = await readdir(wasmSrc);
for (const f of files) {
  await copyFile(path.join(wasmSrc, f), path.join(wasmDest, f));
  console.log('wasm:', f);
}

let needModel = true;
if (existsSync(modelDest)) {
  const sizeMB = (await stat(modelDest)).size / 1048576;
  needModel = sizeMB < 5; // re-download if suspiciously small
  if (!needModel) console.log(`model: cached (${sizeMB.toFixed(1)} MB)`);
}
if (needModel) {
  console.log('model: downloading…');
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Model download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { writeFile } = await import('node:fs/promises');
  await writeFile(modelDest, buf);
  console.log(`model: saved (${(buf.length / 1048576).toFixed(1)} MB)`);
}
console.log('Offline vendor complete: public/wasm + public/models');
