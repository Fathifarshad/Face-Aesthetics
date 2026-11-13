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

export interface Finding {
  concernId: ConcernId;
  side: 'L' | 'R' | 'both';
  autoGrade: Grade;
  confidence: Confidence;
  grade: Grade;
  reviewed: 'confirmed' | 'edited' | 'rejected' | 'pending';
}

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

export type ConsentScope = 'analysis' | 'cloudRender' | 'beforeAfter';

export interface Consent {
  id: string;
  patientId: string;
  scope: ConsentScope;
  detail?: { use: 'internal' | 'education' | 'public'; maskEyes: boolean };
  signedName: string;
  signature: Blob;
  signedAt: number;
  revokedAt?: number;
}

export interface Plan {
  id: string;
  patientId: string;
  realAge: number;
  ageOffset: AgeOffset;
  tier: PlanTier;
  changes: SimChange[];
  items: PlanItem[];
  approvedBy?: string;
  approvedAt?: number;
}

/** Photo slot of the before/after gallery (PRD F8). */
export type PhotoKind = 'before' | 'after';
export type GalleryView = ViewId;
