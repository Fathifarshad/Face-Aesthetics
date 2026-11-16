import { canCloudRender } from '../data/consentGate';
import type { Consent } from '../data/types';

/**
 * Realistic (cloud) render, PRD F4.8–F4.11. The browser preview stays the main simulation; a provider may refine it.
 * This is the only door through which a patient photo may ever leave the device (SUPERPROMPT rule 8), so every call
 * goes through `cloudRender()` below, which asks the clinic switch and the patient's level-2 consent first.
 * Phase 1 has only `MockRenderProvider` (no network); a real model needs the licence review of PRD §10.3.
 */

/** One selected change: its region on the photo (photo pixels) and how strong it is (0–1). */
export type RenderRegion = { id: string; intensity: number; polygon: readonly { x: number; y: number }[] };

export type RenderInput = {
  /** The original photo. */
  photo: Blob;
  /** The browser preview over the whole photo, with the simulation label burned in: the guide for the provider. */
  guide: Blob;
  regions: readonly RenderRegion[];
};

export type RenderResult = {
  image: Blob;
  providerId: string;
  /** True for the stand-in that only returns the guide. */
  mock: boolean;
};

export interface RenderProvider {
  readonly id: string;
  /** Whether `render` sends anything over the network. */
  readonly remote: boolean;
  render(input: RenderInput, signal?: AbortSignal): Promise<RenderResult>;
}

export type RenderRefusal = 'disabled' | 'noConsent';

export class RenderRefusedError extends Error {
  constructor(readonly reason: RenderRefusal) {
    super(`cloud render refused: ${reason}`);
    this.name = 'RenderRefusedError';
  }
}

type ConsentLike = Pick<Consent, 'scope' | 'detail' | 'signedAt' | 'revokedAt'>;

/** Why a render may not run now, or null when it may. */
export function renderBlock(enabled: boolean, consents: readonly ConsentLike[]): RenderRefusal | null {
  if (!enabled) return 'disabled';
  if (!canCloudRender(consents)) return 'noConsent';
  return null;
}

/**
 * The single gate. `consents` must be read right before the call, so a revocation a moment ago counts.
 * Throws `RenderRefusedError` without touching the provider when the switch is off or there is no live consent.
 */
export async function cloudRender(
  provider: RenderProvider,
  input: RenderInput,
  gate: { enabled: boolean; consents: readonly ConsentLike[] },
  signal?: AbortSignal,
): Promise<RenderResult> {
  const blocked = renderBlock(gate.enabled, gate.consents);
  if (blocked) throw new RenderRefusedError(blocked);
  return provider.render(input, signal);
}
