import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkerRequest, WorkerResponse } from '../../engine/pipeline.worker';
import type { Photo } from '../../db/types';
import type { Sex } from '../../engine/warp';

/** Long side of the working copy (docs/PRD.md F1.4); smaller on touch devices (SUPERPROMPT, performance). */
const WORK_SIDE = { desktop: 1280, touch: 1024 } as const;

/**
 * Part of the photo the engine works on: the landmark box grown on every side so the forehead up to the
 * hairline, the temples, the jaw and the neck below the chin all stay inside. Fractions of the landmark box.
 * The engine trims this further to its own working box (regions plus a margin).
 */
const CROP_GROW = { side: 0.35, top: 0.5, bottom: 0.7 } as const;

function faceCrop(landmarks: readonly { x: number; y: number }[], width: number, height: number) {
  const xs = landmarks.map((p) => p.x);
  const ys = landmarks.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const bw = x1 - x0;
  const bh = y1 - y0;
  const left = Math.max(0, Math.floor(x0 - bw * CROP_GROW.side));
  const top = Math.max(0, Math.floor(y0 - bh * CROP_GROW.top));
  const right = Math.min(width, Math.ceil(x1 + bw * CROP_GROW.side));
  const bottom = Math.min(height, Math.ceil(y1 + bh * CROP_GROW.bottom));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export type EngineStatus = 'loading' | 'no-photo' | 'no-face' | 'preparing' | 'ready' | 'error';
export type Ready = Extract<WorkerResponse, { type: 'ready' }>;
export type EngineMessage = Exclude<WorkerResponse, { type: 'ready' } | { type: 'error' }>;

/**
 * Prepares the frontal photo in the engine worker (off the main thread, PRD F4.4) and keeps the worker for
 * later requests. `work` holds the working copy; the engine's box starts at `ready.rect.x, ready.rect.y` in it.
 * Pixels never leave the device: the worker only talks to this page.
 */
export function useEngine(photo: Photo | null | undefined, onMessage: (msg: EngineMessage) => void, sex?: Sex) {
  const worker = useRef<Worker | null>(null);
  const work = useRef<HTMLCanvasElement | null>(null);
  /** Where the working copy sits in the decoded photo: photo px = crop + working px / scale. */
  const placement = useRef<{ x: number; y: number; scale: number } | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const [status, setStatus] = useState<EngineStatus>('loading');
  const [ready, setReady] = useState<Ready | null>(null);

  useEffect(() => {
    if (photo === undefined) return;
    if (photo === null) return setStatus('no-photo');
    if (!photo.landmarks) return setStatus('no-face');
    let cancelled = false;
    const w = new Worker(new URL('../../engine/pipeline.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    setStatus('preparing');
    setReady(null);
    const canvas = document.createElement('canvas');
    work.current = canvas;

    w.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (cancelled) return;
      const msg = event.data;
      if (msg.type === 'error') {
        console.error('simulation engine failed');
        return setStatus('error');
      }
      if (msg.type === 'ready') {
        setReady(msg);
        setStatus('ready');
        return;
      }
      handler.current(msg);
    };
    w.onerror = () => !cancelled && setStatus('error');

    void (async () => {
      const bmp = await createImageBitmap(photo.blob);
      if (cancelled) return bmp.close();
      const side = window.matchMedia('(pointer: coarse)').matches ? WORK_SIDE.touch : WORK_SIDE.desktop;
      // The size limit applies to the face and its surroundings, not to the whole photo: the face often fills
      // only a third of the frame, and limiting the whole photo would leave it a few hundred pixels wide.
      const k0 = bmp.width / photo.width;
      const crop = faceCrop(photo.landmarks!, bmp.width / k0, bmp.height / k0);
      const [sx, sy, sw, sh] = [crop.x * k0, crop.y * k0, crop.width * k0, crop.height * k0];
      const scale = Math.min(1, side / Math.max(sw, sh));
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      placement.current = { x: sx, y: sy, scale };
      bmp.close();
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      // Stored landmarks are in pixels of the stored photo; the working copy is a scaled crop of it.
      const k = canvas.width / crop.width;
      const landmarks = photo.landmarks!.map((p) => ({ x: (p.x - crop.x) * k, y: (p.y - crop.y) * k }));
      w.postMessage({ type: 'prepare', data: pixels, width: canvas.width, height: canvas.height, landmarks, sex } satisfies WorkerRequest, [pixels.buffer]);
    })();

    return () => {
      cancelled = true;
      w.terminate();
      worker.current = null;
    };
  }, [photo, sex]);

  const post = useCallback((request: WorkerRequest) => worker.current?.postMessage(request), []);
  return { status, ready, work, placement, post };
}
