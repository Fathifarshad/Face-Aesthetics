import type { MdCode, MdKey } from '../data/mdCodes';
import type { EstimateOverride, Tariff, ToxinBrand } from '../data/estimates';
import type { Bi } from '../analysis/catalog';
import type { Finding, Point, Pose } from '../analysis/types';
import type { QcResult } from '../capture/qc';
import type { Tier } from '../plan/data/treatments';
import type { Intake } from '../plan/intake';
import type { Sealed, WrappedKey } from './crypto';
import type { AgeTarget, ConcernId, Consent, Finding as DomainFinding } from '../data/types';

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
  /** Lip type 1–5 chosen by the doctor; absent = the type suggested from the photo. */
  lipType?: 1 | 2 | 3 | 4 | 5;
  /** Volume mode (docs/TASKS.md M5b): per concern area (A, default) or per MD Codes site (B). */
  mode?: SimMode;
  /**
   * MD Codes sliders the doctor moved (docs/TASKS.md M5b–M5c): a family follows its concern's mode-A value until
   * moved; a code follows its family. Their `on` is not used for codes (see `codeOn`). The M5b keys T, E, Tt, NL,
   * Lp, M, C and Jw are now families, Ck1–Ck3 codes, so older cases read the same.
   */
  siteOverrides?: Partial<Record<MdKey, SimSetting>>;
  /** Codes the doctor switched on or off; absent = the code's `starts`. */
  codeOn?: Partial<Record<MdCode, boolean>>;
  /** Treatment option the doctor chose per concern (PRD F5, M6); absent = the first default option. */
  options?: Partial<Record<ConcernId, string>>;
  updatedAt: number;
};

export type SimMode = 'area' | 'mdcodes';

export type PlanRow = {
  caseId: string;
  tier: Tier;
  selections: Record<string, string[]>;
  /** Toxin brand asked on the plan page (PRD §7.1): label numbers only for OnabotulinumtoxinA. Absent = not asked. */
  toxinBrand?: ToxinBrand;
  /** Estimates the doctor entered per option id (PRD F7.5, «ویرایش پزشک»). */
  estOverrides?: Record<string, EstimateOverride>;
  /** The doctor's note printed in the report (PRD F9.1); part of the approved content. */
  reportNote?: string;
  updatedAt: number;
};

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
  /** `approvalStamp` of the content the doctor approved (PRD F9.2). Absent on v1 sign-offs = stale. */
  stamp?: string;
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
/** PRD F8.3 consent of a patient (all their cases); the touch signature is encrypted like the doctor's. */
export type ConsentRow = Omit<Consent, 'signature'> & { sealedSignature: Sealed };

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
  /** v1 price per v1 treatment id; replaced by `tariff` in M7, kept so older settings still read. */
  prices: Record<string, number>;
  /** Clinic tariff, syringe size and vial units (PRD F7.4, M7). */
  tariff: Tariff;
  maxHighRiskPerSession: number;
  retentionMonths: number;
  /** Doctor-written aftercare per modality; shown to the patient. */
  aftercare: Record<string, string>;
  /** Clinic switch for the realistic render (PRD F4.8, feature flag; default off). Each patient also needs level-2 consent. */
  cloudRender: boolean;
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
