import type { Bi } from '../analysis/catalog';
import type { Finding, Point, Pose } from '../analysis/types';
import type { QcResult } from '../capture/qc';
import type { Tier } from '../plan/data/treatments';
import type { Intake } from '../plan/intake';
import type { Sealed, WrappedKey } from './crypto';
import type { AgeTarget, ConcernId, Finding as DomainFinding } from '../data/types';

export type Sex = 'female' | 'male' | 'other';
export type CaseStatus = 'draft' | 'awaiting-signoff' | 'signed' | 'follow-up';
export type PhotoPhase = 'before' | 'after';

export type Patient = {
  id: string;
  code: string;
  fileNo: string;
  displayName: string;
  birthYear: number;
  sex: Sex;
  phone?: string;
  ethnicityNorm: string;
  createdAt: number;
};

export type Consents = { photography: boolean; analysis: boolean; storage: boolean; educational: boolean; patientApp: boolean };

export type Case = {
  id: string;
  patientId: string;
  createdAt: number;
  status: CaseStatus;
  services: string[];
  actualAge: number;
  apparentAge: number | null;
  targetAge: number;
  tier: Tier | null;
  intake: Intake;
  consents: Consents;
  screening: { bddPositive: boolean | null; note: string };
  glogau: number | null;
};

export type Photo = {
  id: string;
  caseId: string;
  phase: PhotoPhase;
  view: string;
  blob: Blob;
  width: number;
  height: number;
  landmarks: Point[] | null;
  pose: Pose | null;
  qc: QcResult | null;
  lowQuality: boolean;
  source: 'doctor' | 'patient';
  takenAt: number;
};

export type FindingRow = Finding & { id: string; caseId: string };

/** M5 grading (PRD F2): one row per concern and side. `index` is the engine's raw measure, null for manual grades. */
export type GradeRow = DomainFinding & { id: string; caseId: string; index: number | null; photoId: string | null; updatedAt: number };

/** One change of the simulation page as the doctor left it (stored only once the doctor touched it). */
export type SimSetting = { on: boolean; value: number; left: number; mirror: boolean; last: 'R' | 'L' };

/** Simulation state of a case (PRD F3): the age target and the changes the doctor set by hand. */
export type SimStateRow = {
  caseId: string;
  target: AgeTarget;
  /** Changes the doctor moved; every other change follows the age-appropriate default. */
  overrides: Partial<Record<ConcernId, SimSetting>>;
  updatedAt: number;
};

export type PlanRow = { caseId: string; tier: Tier; selections: Record<string, string[]>; updatedAt: number };

export type Simulation = {
  id: string;
  caseId: string;
  photoId: string;
  targetAge: number;
  strength: number;
  blob: Blob;
  createdAt: number;
};

export type SignOff = {
  caseId: string;
  checklist: Record<string, boolean>;
  signature: string;
  signedAt: number;
  doctorName: string;
  licence: string;
};

export type Message = {
  id: string;
  owner: 'doctor' | 'patient';
  patientCode: string;
  from: 'doctor' | 'patient';
  text: string;
  at: number;
  /** Included in an exported package already. */
  sent: boolean;
};

// ── Stored form of images (hard rule 10): encrypted at rest, decrypted only through src/db/images.ts ──
export type PhotoRow = Omit<Photo, 'blob'> & { sealed: Sealed };
export type SimulationRow = Omit<Simulation, 'blob'> & { sealed: Sealed };
export type SignOffRow = Omit<SignOff, 'signature'> & { sealedSignature: Sealed };

/** Key material of the doctor's vault, stored under settings key "vault". Holds no plaintext key. */
export type VaultRecord = {
  version: 1;
  /** Data key wrapped by the passphrase. */
  pass: WrappedKey;
  /** The same data key wrapped by the recovery code. */
  recovery: WrappedKey;
  /** False until images saved before the vault existed have been encrypted. */
  migrated: boolean;
  createdAt: number;
};

export type AuditEntry ={ id?: number; caseId: string; at: number; action: string; before?: unknown; after?: unknown };

export type ClinicSettings = {
  doctorName: string;
  doctorTitle: string;
  licence: string;
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  footer: string;
  logo: string;
  accent: string;
  prices: Record<string, number>;
  maxHighRiskPerSession: number;
  retentionMonths: number;
  /** Doctor-written aftercare per modality; shown to the patient. */
  aftercare: Record<string, string>;
};

// ── Client (patient app) side ────────────────────────────────────────────
export type PtCase = {
  id: string;
  date: number;
  services: string[];
  actualAge: number;
  targetAge: number;
  findings: { key: string; label: Bi; patient: Bi; severity: number }[];
  plan: { findingKey: string; label: Bi; options: { id: string; title: Bi; modality: string }[] }[];
  sessions: { index: number; kind: string; items: Bi[]; after: Bi | null }[];
  aftercare: { modality: string; text: string }[];
  signedAt: number;
  doctorName: string;
};

export type PtRecord = {
  code: string;
  patientName: string;
  clinic: { name: string; doctor: string; phone: string; address: string };
  cases: PtCase[];
  updatedAt: number;
};

export type PtPhoto = {
  id: string;
  code: string;
  caseId: string;
  phase: PhotoPhase | 'simulation' | 'progress';
  view: string;
  blob: Blob;
  takenAt: number;
  /** Progress photos taken by the client are queued for the next reply package. */
  sent: boolean;
};
