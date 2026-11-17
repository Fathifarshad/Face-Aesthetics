import type { Message, PtCase, PtRecord } from '../db/types';

/**
 * File exchange between the doctor and the client app (PRD F10.2, F10.7).
 * Version 2 uses the `neva/…` ids. Version 1 files (`tanasob/…`, v1 kit) are still read: `parseIncoming` turns them into
 * the version-2 shape, so callers only ever check the v2 ids.
 */
export const PACKAGE_FORMAT = 'neva/patient-package';
export const REPLY_FORMAT = 'neva/patient-reply';
const LEGACY = { 'tanasob/patient-package': PACKAGE_FORMAT, 'tanasob/patient-reply': REPLY_FORMAT } as const;
export const FORMAT_VERSION = 2;

export const packageFileName = (code: string) => `neva-${code}.json`;
export const replyFileName = (code: string) => `neva-reply-${code}.json`;

type WireMessage = Pick<Message, 'id' | 'from' | 'text' | 'at'>;

/** Doctor → client: signed cases, consented photos and simulation, plan, aftercare and message history. */
export type PatientPackage = {
  format: typeof PACKAGE_FORMAT;
  version: 1 | 2;
  exportedAt: number;
  code: string;
  patientName: string;
  clinic: PtRecord['clinic'];
  cases: PtCase[];
  photos: { id: string; caseId: string; phase: string; view: string; dataUrl: string; takenAt: number }[];
  messages: WireMessage[];
};

/** Client → doctor: questions and progress photos. */
export type ReplyPackage = {
  format: typeof REPLY_FORMAT;
  version: 1 | 2;
  exportedAt: number;
  code: string;
  messages: WireMessage[];
  photos: { id: string; view: string; dataUrl: string; takenAt: number }[];
};

export type Incoming = PatientPackage | ReplyPackage;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isBi = (v: unknown) => isObj(v) && typeof v.fa === 'string' && typeof v.en === 'string';

/** PRD F10.6: a v1 package carried the grade (`severity`) of each finding. It is dropped on import. */
function normalizeCase(c: unknown): PtCase {
  if (!isObj(c) || typeof c.id !== 'string' || !Array.isArray(c.findings) || !Array.isArray(c.plan) || !Array.isArray(c.sessions))
    throw new Error('malformed');
  const findings = c.findings.map((f: unknown) => {
    if (!isObj(f) || typeof f.key !== 'string' || !isBi(f.label) || !isBi(f.patient)) throw new Error('malformed');
    return { key: f.key, label: f.label as PtCase['findings'][number]['label'], patient: f.patient as PtCase['findings'][number]['patient'] };
  });
  const out = { ...(c as PtCase), findings };
  if (out.note !== undefined && typeof out.note !== 'string') throw new Error('malformed');
  return out;
}

/** Validates an imported file. Throws with a short reason on anything unexpected. */
export function parseIncoming(text: string): Incoming {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('not-json');
  }
  if (!isObj(data) || typeof data.format !== 'string') throw new Error('unknown-format');
  const legacy = data.format in LEGACY;
  const format = legacy ? LEGACY[data.format as keyof typeof LEGACY] : data.format;
  if (format !== PACKAGE_FORMAT && format !== REPLY_FORMAT) throw new Error('unknown-format');
  if (data.version !== (legacy ? 1 : FORMAT_VERSION)) throw new Error('unsupported-version');
  if (typeof data.code !== 'string' || !Array.isArray(data.messages) || !Array.isArray(data.photos)) throw new Error('malformed');
  for (const m of data.messages) {
    if (!isObj(m) || typeof m.id !== 'string' || typeof m.text !== 'string' || typeof m.at !== 'number') throw new Error('malformed');
    if (m.from !== 'doctor' && m.from !== 'patient') throw new Error('malformed');
  }
  for (const p of data.photos) {
    if (!isObj(p) || typeof p.id !== 'string' || typeof p.dataUrl !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(p.dataUrl))
      throw new Error('malformed');
  }
  if (format === PACKAGE_FORMAT) {
    if (!Array.isArray(data.cases) || !isObj(data.clinic)) throw new Error('malformed');
    return { ...(data as PatientPackage), format, cases: data.cases.map(normalizeCase) };
  }
  return { ...(data as ReplyPackage), format };
}

/** Merges messages by id, oldest first. */
export function mergeMessages<T extends { id: string; at: number }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const map = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) if (!map.has(m.id)) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.at - b.at);
}
