// Downloads MediaPipe Tasks Vision + the face and pose models into vendor/ so Yellfie works offline.
// Usage: node scripts/fetch-vendor.mjs   (Node 18+)
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = '1.2.3';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const files = {
  'vendor/mediapipe/vision_bundle.mjs': `${CDN}/vision_bundle.mjs`,
  'vendor/mediapipe/wasm/vision_wasm_internal.js': `${CDN}/wasm/vision_wasm_internal.js`,
  'vendor/mediapipe/wasm/vision_wasm_internal.wasm': `${CDN}/wasm/vision_wasm_internal.wasm`,
  'vendor/models/face_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'vendor/models/pose_landmarker_lite.task': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  'vendor/models/hand_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
};
for (const [rel, url] of Object.entries(files)) {
  const out = join(root, rel);
  process.stdout.write(`↓ ${rel} … `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buf);
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
}
console.log('Done. Yellfie can now run offline.');
