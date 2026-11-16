/// <reference lib="webworker" />
import { grade, measure, photoProblems, type AutoGrade, type Pose } from './grading';
import { prepare, render, type Change, type Outline, type Prepared, type Rect, type SiteChange, type SiteZone } from './pipeline';
import type { Pt } from './types';
import type { Sex } from './warp';
import type { ConcernId } from '../data/types';

/**
 * Worker entry of the image engine (docs/PRD.md F4.4): the one-time preparation of a photo and every
 * re-render run here, off the main thread. Pixels never leave the device; this file only talks to its page.
 */
export type WorkerRequest =
  | { type: 'prepare'; data: Uint8ClampedArray; width: number; height: number; landmarks: Pt[]; sex?: Sex }
  | { type: 'render'; id: number; changes: Change[]; sites?: SiteChange[] }
  | { type: 'grade'; pose: Pose | null };

export type WorkerResponse =
  | { type: 'ready'; rect: Rect; available: ConcernId[]; bilateral: ConcernId[]; outlines: Outline[]; zones: SiteZone[]; lipFullness: number; ms: number }
  | { type: 'frame'; id: number; rect: Rect; pixels: Uint8ClampedArray; ms: number }
  | { type: 'grades'; grades: AutoGrade[]; problems: ReturnType<typeof photoProblems>; ms: number }
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
      const { rect, available, bilateral, outlines, zones, lipFullness } = prepared;
      reply({ type: 'ready', rect, available, bilateral, outlines, zones, lipFullness, ms: performance.now() - started });
    } else if (request.type === 'grade' && prepared) {
      const problems = photoProblems(prepared, request.pose);
      reply({ type: 'grades', grades: grade(measure(prepared), problems), problems, ms: performance.now() - started });
    } else if (request.type === 'render' && prepared) {
      const pixels = render(prepared, request.changes, { sites: request.sites ?? [] });
      reply({ type: 'frame', id: request.id, rect: prepared.rect, pixels, ms: performance.now() - started }, [pixels.buffer]);
    }
  } catch (e) {
    reply({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
