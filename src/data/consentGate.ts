import type { Consent, ConsentScope, PhotoUse } from './types';

/**
 * The single rule for what may leave the clinic (PRD F8.3, F8.4, F8.6). Every shareable output asks here:
 * the client package, the report, and a gallery export. A revoked consent counts as none from that moment.
 *
 * Owner decision 2026-11-16: level 3 "internal" also covers the patient's own copy (client package, report),
 * so a patient who declines teaching use still gets their own photos.
 */

type ConsentLike = Pick<Consent, 'scope' | 'detail' | 'signedAt' | 'revokedAt'>;

/** Where a photo is going. */
export type SharePurpose = 'patient' | PhotoUse;

const USE_RANK: Record<PhotoUse, number> = { internal: 0, education: 1, public: 2 };
const NEEDED: Record<SharePurpose, number> = { patient: 0, internal: 0, education: 1, public: 2 };

/** The latest signed, not revoked consent of a scope. */
export function activeConsent<T extends ConsentLike>(consents: readonly T[], scope: ConsentScope): T | null {
  const live = consents.filter((c) => c.scope === scope && !c.revokedAt).sort((a, b) => b.signedAt - a.signedAt);
  return live[0] ?? null;
}

/** Level 1: photos may be taken, analysed and kept in the clinic file. */
export const canCapture = (consents: readonly ConsentLike[]): boolean => !!activeConsent(consents, 'analysis');

/** Level 2: a photo may go to a cloud renderer (used from M10). */
export const canCloudRender = (consents: readonly ConsentLike[]): boolean => !!activeConsent(consents, 'cloudRender');

/** Level 3 as signed: the widest use and whether the eyes are covered; null when there is none. */
export function photoUse(consents: readonly ConsentLike[]): { use: PhotoUse; maskEyes: boolean } | null {
  const c = activeConsent(consents, 'beforeAfter');
  return c ? (c.detail ?? { use: 'internal', maskEyes: true }) : null;
}

/** May a patient photo (or an image made from one, such as the simulation) go to this purpose? */
export function canShare(consents: readonly ConsentLike[], purpose: SharePurpose): boolean {
  const u = photoUse(consents);
  return !!u && USE_RANK[u.use] >= NEEDED[purpose];
}

/** Purposes a gallery export may be made for, narrowest first. */
export function exportPurposes(consents: readonly ConsentLike[]): PhotoUse[] {
  const u = photoUse(consents);
  if (!u) return [];
  return (Object.keys(USE_RANK) as PhotoUse[]).filter((p) => USE_RANK[p] <= USE_RANK[u.use]);
}

/** Eyes are covered on every shared copy when the patient asked for it. */
export const mustMaskEyes = (consents: readonly ConsentLike[]): boolean => photoUse(consents)?.maskEyes ?? true;
