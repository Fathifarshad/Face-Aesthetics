/// <reference lib="webworker" />
import { prepare, render, type Change, type Outline, type Prepared, type Rect } from './pipeline';
import type { Pt } from './types';
import type { ConcernId } from '../data/types';

/**
 * Worker entry of the image engine (docs/PRD.md F4.4): the one-time preparation of a photo and every
 * re-render run here, off the main thread. Pixels never leave the device; this file only talks to its page.
 */
export type WorkerRequest =
  | { type: 'prepare'; data: Uint8ClampedArray; width: number; height: number; landmarks: Pt[] }
  | { type: 'render'; id: number; changes: Change[] };

export type WorkerResponse =
  | { type: 'ready'; rect: Rect; available: ConcernId[]; bilateral: ConcernId[]; outlines: Outline[]; ms: number }
  | { type: 'frame'; id: number; rect: Rect; pixels: Uint8ClampedArray; ms: number }
  | { type: 'error'; message: string };

let prepared: Prepared | null = null;
const scope = self as unknown as DedicatedWorkerGlobalScope;
const reply = (message: WorkerResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const started = performance.now();
    if (request.type === 'prepare') {
      prepared = prepare(request);
      const { rect, available, bilateral, outlines } = prepared;
      reply({ type: 'ready', rect, available, bilateral, outlines, ms: performance.now() - started });
    } else if (prepared) {
      const pixels = render(prepared, request.changes);
      reply({ type: 'frame', id: request.id, rect: prepared.rect, pixels, ms: performance.now() - started }, [pixels.buffer]);
    }
  } catch (e) {
    reply({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
