/**
 * Separable box blur on one channel, three passes (close to a Gaussian). Written by hand because
 * `ctx.filter` is not dependable in Safari (docs/PRD.md F4.4). Edges repeat the border pixel, so a
 * uniform image stays exactly uniform.
 */
function pass(src: Float32Array, dst: Float32Array, tmp: Float32Array, w: number, h: number, r: number): void {
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(w - 1, Math.max(0, k))]!;
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / n;
      acc += src[row + Math.min(w - 1, x + r + 1)]! - src[row + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x]!;
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!;
    }
  }
}

/** Returns a blurred copy; `radius` is the box radius of each of the three passes, in pixels. */
export function boxBlur3(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.round(radius);
  if (r < 1) return src.slice();
  const a = new Float32Array(src.length);
  const b = new Float32Array(src.length);
  const tmp = new Float32Array(src.length);
  pass(src, a, tmp, w, h, r);
  pass(a, b, tmp, w, h, r);
  pass(b, a, tmp, w, h, r);
  return a;
}
