/**
 * Facts about the 16 concerns of docs/PRD.md §6 that are not treatment data: which have a right and a left side,
 * which the engine grades from the photo, and the reference scale named next to each (PRD F2.5).
 * Pure data: no React, no DOM.
 */
import type { ConcernId, FindingSide, Status } from './types';

/** Concerns with a separate right and left region (src/engine/regions.ts); the rest are one midline region. */
export const BILATERAL: ReadonlySet<ConcernId> = new Set<ConcernId>([
  'crows-feet',
  'tear-trough',
  'midface-volume',
  'nasolabial-fold',
  'marionette',
  'jawline',
  'masseter',
  'temple',
  'brow',
]);

export const sidesOf = (id: ConcernId): FindingSide[] => (BILATERAL.has(id) ? ['R', 'L'] : ['both']);

/**
 * Concerns the engine grades from the photo (PRD F2.3: shadow energy in the region against the cheek). These are
 * lines, folds and hollows: what a frontal photo shows as shading. Volume and shape (lips, chin, jaw, masseter,
 * brow, midface volume, temple) cannot be read that way from one 2D photo; the doctor grades them by hand
 * (owner decision 2026-11-15).
 */
export const AUTO_GRADED: ReadonlySet<ConcernId> = new Set<ConcernId>([
  'forehead-lines',
  'glabellar-lines',
  'crows-feet',
  'tear-trough',
  'nasolabial-fold',
  'marionette',
  'perioral-lines',
  'neck',
  'skin-quality',
]);

/**
 * Reference scale shown beside each concern (PRD F2.5). Names only; the scales' grade descriptions are not
 * reproduced. Official use needs a licence review (PRD §14, docs/TASKS.md). Skin quality has no 0–4 scale.
 */
export const SCALES: { status: Status; source: string; names: Record<ConcernId, string | null> } = {
  status: 'draft', // TODO(clinical): confirm the scale chosen for each concern
  source: 'Scale names from the v1 kit catalogue (src/analysis/catalog.ts, docs/ANALYSIS_SPEC.md); PRD F2.5',
  names: {
    'forehead-lines': 'Merz Aesthetics Scales — Forehead Lines',
    'glabellar-lines': 'Merz Aesthetics Scales — Glabella Lines',
    'crows-feet': 'Merz Aesthetics Scales — Lateral Canthal Lines',
    'tear-trough': 'Allergan Infraorbital Hollows Scale',
    'midface-volume': 'Allergan Mid-Face Volume Deficit Scale',
    'nasolabial-fold': 'Wrinkle Severity Rating Scale (WSRS)',
    marionette: 'Merz Aesthetics Scales — Marionette Lines',
    'lip-volume': 'Allergan Lip Fullness Scale',
    'perioral-lines': 'Merz Aesthetics Scales — Perioral Lines at Rest',
    chin: 'Allergan Chin Retrusion Scale',
    jawline: 'Merz Aesthetics Scales — Jawline',
    masseter: 'Allergan Masseter Muscle Prominence Scale',
    temple: 'Allergan Temple Hollowing Scale',
    brow: 'Merz Brow Positioning Grading Scale',
    neck: 'Merz Aesthetics Scales — Horizontal Neck Lines',
    'skin-quality': null,
  },
};
