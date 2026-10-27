import { pointInPolygon } from '../analysis/geometry';
import { FACE_OVAL, LEFT_EYE_RING, LIPS_OUTER, LM, RIGHT_EYE_RING } from '../analysis/landmarks';
import type { Landmarks } from '../analysis/types';
import { boxBlur, buildSimPlan, ellipseWeight, sourceOffset } from './warp';

const MAX_SIDE = 1280;

function bilinear(src: Uint8ClampedArray, w: number, h: number, x: number, y: number, c: number): number {
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(y)));
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = src[(y0 * w + x0) * 4 + c]!;
  const b = src[(y0 * w + x1) * 4 + c]!;
  const d = src[(y1 * w + x0) * 4 + c]!;
  const e = src[(y1 * w + x1) * 4 + c]!;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
}

/** Skin mask: inside the face oval, outside eyes, brows and lips; feathered. */
function skinMask(lm: Landmarks, w: number, h: number, scale: number): Float32Array {
  const poly = (ids: readonly number[]) => ids.map((i) => ({ x: lm[i]!.x * scale, y: lm[i]!.y * scale }));
  const oval = poly(FACE_OVAL);
  const holes = [poly(LEFT_EYE_RING), poly(RIGHT_EYE_RING), poly(LIPS_OUTER), poly(LM.browR), poly(LM.browL)];
  const m = new Float32Array(w * h);
  const xs = oval.map((p) => p.x);
  const ys = oval.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map(Math.round) as [number, number, number, number];
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
      const p = { x, y };
      if (pointInPolygon(p, oval) && !holes.some((hp) => hp.length > 2 && pointInPolygon(p, expand(hp, 1.35)))) m[y * w + x] = 1;
    }
  return boxBlur(m, w, h, Math.max(2, Math.round(w / 120)));
}

function expand(pts: { x: number; y: number }[], k: number) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return pts.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
}

/**
 * Renders the approximate target-age image. `lm` is in the source image's pixel space.
 * Runs entirely on-device; returns a JPEG blob.
 */
export async function renderSimulation(
  source: ImageBitmap,
  lm: Landmarks,
  severities: Record<string, number>,
  intensity: number,
): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
  const w = Math.round(source.width * scale);
  const h = Math.round(source.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  const srcData = ctx.getImageData(0, 0, w, h);
  const src = srcData.data;
  const scaled = lm.map((p) => ({ x: p.x * scale, y: p.y * scale }));
  const plan = buildSimPlan(scaled, severities, intensity);

  // 1) geometric warp (backward mapping)
  const warped = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const { dx, dy } = sourceOffset(x, y, plan.controls);
      const o = (y * w + x) * 4;
      if (dx === 0 && dy === 0) {
        warped[o] = src[o]!;
        warped[o + 1] = src[o + 1]!;
        warped[o + 2] = src[o + 2]!;
      } else for (let c = 0; c < 3; c++) warped[o + c] = bilinear(src, w, h, x + dx, y + dy, c);
      warped[o + 3] = 255;
    }

  // 2) tone: shadow lift, line softening and edge-preserving skin smoothing
  const mask = skinMask(lm, w, h, scale);
  const rSmall = Math.max(2, Math.round(w / 160));
  const rLarge = Math.max(4, Math.round(w / 45));
  const channels = [0, 1, 2].map((c) => {
    const ch = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) ch[i] = warped[i * 4 + c]!;
    return ch;
  });
  const small = channels.map((ch) => boxBlur(ch, w, h, rSmall));
  const large = channels.map((ch) => boxBlur(ch, w, h, rLarge));
  const T = 14;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const mk = mask[i]!;
      if (mk <= 0.001) continue;
      let shadow = 0;
      for (const r of plan.shadows) shadow = Math.max(shadow, ellipseWeight(x, y, r) * r.amount);
      let lines = 0;
      for (const r of plan.lineSoftening) lines = Math.max(lines, ellipseWeight(x, y, r) * r.amount);
      for (let c = 0; c < 3; c++) {
        const o = channels[c]![i]!;
        const s = small[c]![i]!;
        const l = large[c]![i]!;
        const edge = Math.exp(-((o - s) ** 2) / (2 * T * T));
        let v = o + (s - o) * Math.min(1, plan.smoothing * 0.75 + lines) * edge * mk;
        v += Math.max(0, l - v) * Math.min(1, shadow * 0.9) * mk;
        warped[i * 4 + c] = v;
      }
    }

  ctx.putImageData(new ImageData(warped, w, h), 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92),
  );
}
