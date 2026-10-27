import { detectImage } from '../analysis/landmarker';
import type { Point, Pose } from '../analysis/types';
import { faceStats, toGray } from './imageStats';
import { evaluateQc, type QcResult } from './qc';
import type { ViewDef } from './views';

const MAX_SIDE = 1600;

export type Processed = {
  blob: Blob;
  width: number;
  height: number;
  landmarks: Point[] | null;
  pose: Pose | null;
  qc: QcResult;
  detectorError: boolean;
};

/**
 * Normalises orientation and size, re-encodes as JPEG (drops EXIF/GPS metadata),
 * detects landmarks on-device and runs the quality checks for the target view.
 */
export async function processPhoto(file: Blob, view: ViewDef): Promise<Processed> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();

  let detection = null;
  let detectorError = false;
  try {
    detection = await detectImage(canvas);
  } catch (e) {
    console.error('landmark detection failed', e);
    detectorError = true;
  }

  // Stats on a downscaled copy keep QC fast.
  const qs = Math.min(1, 480 / Math.max(canvas.width, canvas.height));
  const small = document.createElement('canvas');
  small.width = Math.round(canvas.width * qs);
  small.height = Math.round(canvas.height * qs);
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(canvas, 0, 0, small.width, small.height);
  const img = sctx.getImageData(0, 0, small.width, small.height);
  const gray = toGray(img.data, img.width, img.height);
  const lmSmall = detection?.landmarks?.map((p) => ({ x: p.x * qs, y: p.y * qs })) ?? null;
  const stats = faceStats(gray, lmSmall);

  const qc = evaluateQc(
    {
      faces: detection?.faces ?? 0,
      pose: detection?.pose ?? null,
      faceHeightRatio: stats.faceHeightRatio,
      faceLum: stats.faceLum,
      cheekDiff: stats.cheekDiff,
      blur: stats.blur,
      backlight: stats.backlight,
    },
    view,
  );

  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.92),
  );
  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    landmarks: detection?.landmarks ?? null,
    pose: detection?.pose ?? null,
    qc,
    detectorError,
  };
}
