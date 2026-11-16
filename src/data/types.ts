/**
 * Domain types of the simulation → plan flow (docs/PRD.md §9). Filled in by M5–M8.
 * Persistence types (Patient, Photo) stay in src/db/types.ts until they are reconciled in M2.
 * Pure TypeScript: no React, no DOM.
 */
import type { ViewId } from '../capture/views';

export type Grade = 0 | 1 | 2 | 3 | 4;

/** Every clinical value carries one: `draft` is shown with the «تأییدنشده» badge (PRD §3.5). */
export type Status = 'verified' | 'draft';

export type Confidence = 'low' | 'mid' | 'high';

/** The 16 concerns of PRD §6, in table order. */
export const CONCERN_IDS = [
  'forehead-lines',
  'glabellar-lines',
  'crows-feet',
  'tear-trough',
  'midface-volume',
  'nasolabial-fold',
  'marionette',
  'lip-volume',
  'perioral-lines',
  'chin',
  'jawline',
  'masseter',
  'temple',
  'brow',
  'neck',
  'skin-quality',
] as const;
export type ConcernId = (typeof CONCERN_IDS)[number];

export type Unit = 'mL' | 'U' | 'thread' | 'session';

export type AgeOffset = 0 | 5 | 10;

export type PlanTier = 'minimal' | 'recommended' | 'full';

export type FindingSide = 'L' | 'R' | 'both';

export type Review = 'confirmed' | 'edited' | 'rejected' | 'pending';

/**
 * One concern on one side. `autoGrade` and `confidence` are null for the concerns the engine does not grade
 * (shape and volume, owner decision 2026-11-15: «درجهٔ دستی»); the doctor sets `grade` there.
 * Only `confirmed` and `edited` findings feed the simulation (PRD F2.4).
 */
export interface Finding {
  concernId: ConcernId;
  side: FindingSide;
  autoGrade: Grade | null;
  confidence: Confidence | null;
  grade: Grade;
  reviewed: Review;
}

/**
 * Target of the simulation (PRD F3): one of the three offsets, or an approximate target age the doctor types
 * (owner request 2026-11-15, «سن دلخواه»).
 */
export type AgeTarget = { kind: 'offset'; offset: AgeOffset } | { kind: 'custom'; age: number };

export interface SimChange {
  concernId: ConcernId;
  enabled: boolean;
  /** 0..1, capped by the safety ceiling of PRD F3.2. */
  intensity: number;
  mirror: boolean;
  optionId?: string;
}

export interface PlanItem {
  concernId: ConcernId;
  optionId: string;
  est: { min: number; max: number; unit: Unit; perSide: boolean };
  overridden?: { value: number; note?: string };
  cost?: { min: number; max: number };
  session: number;
}

/** PRD F8.3: 1 analysis and storage, 2 cloud render, 3 use of before/after photos. */
export type ConsentScope = 'analysis' | 'cloudRender' | 'beforeAfter';
/** Level-3 use, from narrowest to widest: inside the clinic (and the patient's own copy), teaching, publication. */
export type PhotoUse = 'internal' | 'education' | 'public';

export interface Consent {
  id: string;
  patientId: string;
  scope: ConsentScope;
  detail?: { use: PhotoUse; maskEyes: boolean };
  signedName: string;
  /** Touch signature as a PNG data URL (stored encrypted, like the doctor's sign-off). */
  signature: string;
  signedAt: number;
  revokedAt?: number;
}

export interface Plan {
  id: string;
  patientId: string;
  realAge: number;
  ageOffset: AgeOffset;
  /** Set when the doctor typed a target age instead of picking an offset. */
  targetAge?: number;
  tier: PlanTier;
  changes: SimChange[];
  items: PlanItem[];
  approvedBy?: string;
  approvedAt?: number;
}

/** Photo slot of the before/after gallery (PRD F8). */
export type PhotoKind = 'before' | 'after';
export type GalleryView = ViewId;
