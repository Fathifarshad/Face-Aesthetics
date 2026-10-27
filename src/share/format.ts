import type { Message, PtCase, PtRecord } from '../db/types';

/** Doctor → client: signed cases, photos, simulation, plan, aftercare and message history. */
export type PatientPackage = {
  format: 'tanasob/patient-package';
  version: 1;
  exportedAt: number;
  code: string;
  patientName: string;
  clinic: PtRecord['clinic'];
  cases: PtCase[];
  photos: { id: string; caseId: string; phase: string; view: string; dataUrl: string; takenAt: number }[];
  messages: Pick<Message, 'id' | 'from' | 'text' | 'at'>[];
};

/** Client → doctor: questions and progress photos. */
export type ReplyPackage = {
  format: 'tanasob/patient-reply';
  version: 1;
  exportedAt: number;
  code: string;
  messages: Pick<Message, 'id' | 'from' | 'text' | 'at'>[];
  photos: { id: string; view: string; dataUrl: string; takenAt: number }[];
};

export type Incoming = PatientPackage | ReplyPackage;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Validates an imported file. Throws with a short reason on anything unexpected. */
export function parseIncoming(text: string): Incoming {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('not-json');
  }
  if (!isObj(data) || typeof data.format !== 'string') throw new Error('unknown-format');
  if (data.version !== 1) throw new Error('unsupported-version');
  if (typeof data.code !== 'string' || !Array.isArray(data.messages) || !Array.isArray(data.photos)) throw new Error('malformed');
  for (const m of data.messages) {
    if (!isObj(m) || typeof m.id !== 'string' || typeof m.text !== 'string' || typeof m.at !== 'number') throw new Error('malformed');
    if (m.from !== 'doctor' && m.from !== 'patient') throw new Error('malformed');
  }
  for (const p of data.photos) {
    if (!isObj(p) || typeof p.id !== 'string' || typeof p.dataUrl !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(p.dataUrl))
      throw new Error('malformed');
  }
  if (data.format === 'tanasob/patient-package') {
    if (!Array.isArray(data.cases) || !isObj(data.clinic)) throw new Error('malformed');
    return data as PatientPackage;
  }
  if (data.format === 'tanasob/patient-reply') return data as ReplyPackage;
  throw new Error('unknown-format');
}

/** Merges messages by id, oldest first. */
export function mergeMessages<T extends { id: string; at: number }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const map = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) if (!map.has(m.id)) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.at - b.at);
}
