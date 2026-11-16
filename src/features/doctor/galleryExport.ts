import { alignTransform } from '../../capture/align';
import type { Photo } from '../../db/types';
import { L_EYE_LOWER, L_EYE_UPPER, R_EYE_LOWER, R_EYE_UPPER } from '../../engine/landmarks';
import { cssToken } from '../../lib/tokens';

/**
 * Shareable before/after image (PRD F8.3–F8.5): the two photos side by side at the same scale, the "after"
 * photo aligned on the outer eye corners of the "before" one, each half labelled with its date, and the eyes
 * covered when the patient's level-3 consent asks for it. The caller checks the consent first (consentGate).
 */

const MAX_HEIGHT = 1200;
const EYE_SETS = [R_EYE_UPPER, R_EYE_LOWER, L_EYE_UPPER, L_EYE_LOWER];

type Box = { x: number; y: number; w: number; h: number };

/** One bar across both eyes, in the photo's own pixels, with a margin so no part of an eye shows. */
export function eyeBar(landmarks: Photo['landmarks']): Box | null {
  if (!landmarks) return null;
  const pts = EYE_SETS.flat().map((i) => landmarks[i]);
  if (pts.some((p) => !p)) return null;
  const xs = pts.map((p) => p!.x);
  const ys = pts.map((p) => p!.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const w = x1 - x0;
  const h = y1 - y0;
  const mx = w * 0.12;
  const my = Math.max(h * 0.9, w * 0.08);
  return { x: x0 - mx, y: y0 - my, w: w + 2 * mx, h: h + 2 * my };
}

/** True when every photo has the landmarks an eye bar needs. */
export const canMaskEyes = (...photos: Photo[]): boolean => photos.every((p) => !!eyeBar(p.landmarks));

export async function composeBeforeAfter({
  before,
  after,
  maskEyes,
  labels,
}: {
  before: Photo;
  after: Photo;
  maskEyes: boolean;
  labels: { before: string; after: string };
}): Promise<Blob> {
  if (maskEyes && !canMaskEyes(before, after)) throw new Error('eyes-not-found');
  const scale = Math.min(1, MAX_HEIGHT / before.height);
  const w = Math.round(before.width * scale);
  const h = Math.round(before.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = cssToken('photo');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // [a, b, c, d, e, f] that maps the photo's own pixels into its half of the canvas.
  const align = alignTransform(before, after);
  const fit = Math.min(w / after.width, h / after.height);
  const halves: { photo: Photo; offset: number; m: number[] }[] = [
    { photo: before, offset: 0, m: [scale, 0, 0, scale, 0, 0] },
    {
      photo: after,
      offset: w,
      m: align
        ? align.map((v, i) => v * scale + (i === 4 ? w : 0))
        : [fit, 0, 0, fit, w + (w - after.width * fit) / 2, (h - after.height * fit) / 2],
    },
  ];

  for (const { photo, offset, m } of halves) {
    const bmp = await createImageBitmap(photo.blob);
    ctx.save();
    ctx.beginPath();
    ctx.rect(offset, 0, w, h);
    ctx.clip();
    ctx.setTransform(m[0]!, m[1]!, m[2]!, m[3]!, m[4]!, m[5]!);
    ctx.drawImage(bmp, 0, 0, photo.width, photo.height);
    bmp.close();
    const bar = maskEyes ? eyeBar(photo.landmarks) : null;
    if (bar) {
      ctx.fillStyle = cssToken('photo');
      ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
    }
    ctx.restore();
  }

  // Labels on top of each half.
  const font = Math.max(14, Math.round(w / 26));
  const barH = Math.round(font * 2);
  ctx.font = `600 ${font}px Vazirmatn, Tahoma, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  for (const [text, x] of [
    [labels.before, w / 2],
    [labels.after, w + w / 2],
  ] as const) {
    ctx.fillStyle = cssToken('bg', 0.72);
    ctx.fillRect(x - w / 2, 0, w, barH);
    ctx.fillStyle = cssToken('paper');
    ctx.fillText(text, x, barH / 2, w - font);
  }
  ctx.fillStyle = cssToken('paper', 0.6);
  ctx.fillRect(w - 1, 0, 2, h);

  return new Promise<Blob>((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error('encode failed'))), 'image/jpeg', 0.92));
}
