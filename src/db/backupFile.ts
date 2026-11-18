import type { Consent } from '../data/types';
import { generateDataKey, KDF_ITERATIONS, open, seal, unwrapDataKey, wrapDataKey, type WrappedKey } from './crypto';
import type { SettingRow } from './db';
import type { AuditEntry, Case, FindingRow, GradeRow, Message, Patient, Photo, PlanRow, SignOff, SimStateRow, Simulation } from './types';

/**
 * Backup file of the doctor's device (Release 1.1, R1). Pure: no Dexie, so it is unit-tested in Node.
 *
 * File: one line of JSON (format, version, the wrapped backup key, IV), a newline, then AES-GCM ciphertext.
 * Plaintext: 4-byte manifest length, the manifest JSON (every row; images as offsets), then the image bytes.
 * A random backup key encrypts the content; that key is wrapped by a key derived from the backup password
 * (PBKDF2-SHA-256, the same scheme as the device vault). Nothing about the content is readable without the password.
 */

export const BACKUP_FORMAT = 'neva/backup';
export const BACKUP_VERSION = 1;
export const backupFileName = (at: number): string => `neva-backup-${new Date(at).toISOString().slice(0, 10)}.nevabak`;
/** Header line limit: a file whose first newline comes later is not a backup. */
const MAX_HEADER = 4096;

export type BackupData = {
  createdAt: number;
  patients: Patient[];
  cases: Case[];
  findings: FindingRow[];
  plans: PlanRow[];
  grades: GradeRow[];
  simStates: SimStateRow[];
  signoffs: SignOff[];
  consents: Consent[];
  /** Doctor-side messages only; the client app's own rows stay out. */
  messages: Message[];
  audit: AuditEntry[];
  photos: Photo[];
  simulations: Simulation[];
  /** Clinic settings row (`settings` key "clinic"); the vault record is never in a backup. */
  clinic: SettingRow | null;
  /** Tags of patients deleted on the device (`erasureTag`), so a restore does not bring them back. */
  erased: Record<string, number>;
};

export class BackupFormatError extends Error {
  constructor(readonly reason: 'not-backup' | 'newer' | 'damaged') {
    super(`backup file: ${reason}`);
    this.name = 'BackupFormatError';
  }
}

type ImageRef = { offset: number; length: number; type: string };
type Manifest = Omit<BackupData, 'photos' | 'simulations'> & {
  format: typeof BACKUP_FORMAT;
  version: number;
  photos: (Omit<Photo, 'blob'> & { image: ImageRef })[];
  simulations: (Omit<Simulation, 'blob'> & { image: ImageRef })[];
};
type Header = { format: string; version: number; key: { salt: string; iv: string; data: string; iterations: number }; iv: string };

const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Encrypts the whole backup with `password`. `iterations` is lowered only by tests. */
export async function packBackup(data: BackupData, password: string, iterations = KDF_ITERATIONS): Promise<Blob> {
  const parts: Blob[] = [];
  let offset = 0;
  const ref = (blob: Blob): ImageRef => {
    const r = { offset, length: blob.size, type: blob.type };
    parts.push(blob);
    offset += blob.size;
    return r;
  };
  const manifest: Manifest = {
    ...data,
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    photos: data.photos.map(({ blob, ...rest }) => ({ ...rest, image: ref(blob) })),
    simulations: data.simulations.map(({ blob, ...rest }) => ({ ...rest, image: ref(blob) })),
  };
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, json.length);
  const key = await generateDataKey();
  const sealed = await seal(key, new Blob([length, json, ...parts]));
  const wrapped = await wrapDataKey(key, password, iterations);
  const header: Header = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    key: { salt: b64(wrapped.salt), iv: b64(wrapped.iv), data: b64(new Uint8Array(wrapped.data)), iterations: wrapped.iterations },
    iv: b64(sealed.iv),
  };
  return new Blob([JSON.stringify(header), '\n', sealed.data], { type: 'application/octet-stream' });
}

/** Throws WrongSecretError for a wrong password and BackupFormatError for anything that is not an intact backup. */
export async function unpackBackup(file: Blob, password: string): Promise<BackupData> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const nl = bytes.subarray(0, MAX_HEADER).indexOf(10);
  if (nl < 0) throw new BackupFormatError('not-backup');
  let header: Header;
  try {
    header = JSON.parse(new TextDecoder().decode(bytes.subarray(0, nl))) as Header;
  } catch {
    throw new BackupFormatError('not-backup');
  }
  if (header?.format !== BACKUP_FORMAT || !header.key || !header.iv) throw new BackupFormatError('not-backup');
  if (header.version > BACKUP_VERSION) throw new BackupFormatError('newer');
  const wrapped: WrappedKey = {
    salt: unb64(header.key.salt),
    iv: unb64(header.key.iv),
    data: unb64(header.key.data).buffer,
    iterations: header.key.iterations,
  };
  const key = await unwrapDataKey(wrapped, password); // WrongSecretError
  let plain: ArrayBuffer;
  try {
    plain = await (await open(key, { iv: unb64(header.iv), data: bytes.slice(nl + 1).buffer, type: '' })).arrayBuffer();
  } catch {
    throw new BackupFormatError('damaged');
  }
  const length = new DataView(plain).getUint32(0);
  const manifest = JSON.parse(new TextDecoder().decode(new Uint8Array(plain, 4, length))) as Manifest;
  const base = 4 + length;
  const image = ({ offset, length: n, type }: ImageRef) => new Blob([plain.slice(base + offset, base + offset + n)], { type });
  const { photos, simulations, ...rest } = manifest;
  const rows: Omit<Manifest, 'photos' | 'simulations' | 'format' | 'version'> & Partial<Pick<Manifest, 'format' | 'version'>> = rest;
  delete rows.format;
  delete rows.version;
  return {
    ...rows,
    photos: photos.map(({ image: r, ...p }) => ({ ...p, blob: image(r) })),
    simulations: simulations.map(({ image: r, ...s }) => ({ ...s, blob: image(r) })),
  };
}

/** What the device already holds, as far as the merge needs it. */
export type LocalState = {
  patients: Pick<Patient, 'id' | 'code'>[];
  cases: Pick<Case, 'id' | 'createdAt' | 'updatedAt'>[];
  findings: Pick<FindingRow, 'id' | 'updatedAt'>[];
  plans: Pick<PlanRow, 'caseId' | 'updatedAt'>[];
  grades: Pick<GradeRow, 'id' | 'updatedAt'>[];
  simStates: Pick<SimStateRow, 'caseId' | 'updatedAt'>[];
  signoffs: Pick<SignOff, 'caseId' | 'signedAt'>[];
  consents: Pick<Consent, 'id' | 'revokedAt'>[];
  messages: Pick<Message, 'id' | 'sent'>[];
  audit: Pick<AuditEntry, 'caseId' | 'at' | 'action'>[];
  photoIds: string[];
  simulationIds: string[];
  clinic: SettingRow | null;
  erased: Record<string, number>;
};

export type MergeCounts = { added: number; updated: number; skippedPatients: number };

/** Rows to write. Nothing on the device is deleted; consents and the `sent` flag only move forward. */
export type MergePlan = Omit<BackupData, 'createdAt' | 'clinic'> & {
  clinic: SettingRow | null;
  revoke: { id: string; revokedAt: number }[];
  markSent: string[];
  counts: MergeCounts;
};

const auditKey = (a: Pick<AuditEntry, 'caseId' | 'at' | 'action'>) => `${a.caseId}|${a.at}|${a.action}`;

/**
 * The owner's rule (2026-11-17): a restore merges, the newer record wins, nothing is deleted.
 * - Rows with a change time (cases, findings, plans, grades, simulation states, sign-offs): the later one wins; a tie keeps the device's.
 * - Rows that never change (patients, photos, simulation images, audit entries): added when missing.
 * - Consents: added when missing; a revocation in the backup is applied, a revoked consent is never made active again.
 * - A patient deleted on this device (or on the device of the backup) is not brought back, nor is a patient whose
 *   code belongs to another patient here; their cases, consents and messages stay out with them.
 * `tags` maps each patient id of the backup to its `erasureTag`.
 */
export function mergeBackup(local: LocalState, incoming: BackupData, tags: Readonly<Record<string, string>>): MergePlan {
  const counts: MergeCounts = { added: 0, updated: 0, skippedPatients: 0 };
  const erased = { ...incoming.erased, ...local.erased };

  const localPatients = new Map(local.patients.map((p) => [p.id, p.code]));
  const codes = new Map(local.patients.map((p) => [p.code, p.id]));
  const skipPatients = new Set<string>();
  const patients: Patient[] = [];
  for (const p of incoming.patients) {
    if (localPatients.has(p.id)) continue;
    const tag = tags[p.id];
    const owner = codes.get(p.code);
    if ((tag && erased[tag] !== undefined) || (owner !== undefined && owner !== p.id)) {
      skipPatients.add(p.id);
      counts.skippedPatients++;
      continue;
    }
    patients.push(p);
    codes.set(p.code, p.id);
  }
  const knownPatients = new Set([...localPatients.keys(), ...patients.map((p) => p.id)]);
  const skipCodes = new Set(incoming.patients.filter((p) => skipPatients.has(p.id)).map((p) => p.code));

  const keepCase = new Set(local.cases.map((c) => c.id));
  for (const c of incoming.cases) if (knownPatients.has(c.patientId)) keepCase.add(c.id);
  const ofKeptCase = <T extends { caseId: string }>(rows: T[]) => rows.filter((r) => keepCase.has(r.caseId));

  /** Newer-wins for rows with a change time. */
  function newer<T, K extends string>(rows: T[], localRows: { key: K; at: number }[], key: (r: T) => K, at: (r: T) => number): T[] {
    const have = new Map(localRows.map((r) => [r.key, r.at]));
    return rows.filter((r) => {
      const mine = have.get(key(r));
      if (mine === undefined) return ++counts.added;
      if (at(r) > mine) return ++counts.updated;
      return false;
    });
  }
  /** Add-if-missing for rows that never change. */
  function missing<T>(rows: T[], have: Iterable<string>, key: (r: T) => string): T[] {
    const set = new Set(have);
    return rows.filter((r) => !set.has(key(r)) && ++counts.added);
  }
  counts.added += patients.length;

  const cases = newer(
    incoming.cases.filter((c) => keepCase.has(c.id)),
    local.cases.map((c) => ({ key: c.id, at: c.updatedAt ?? c.createdAt })),
    (c) => c.id,
    (c) => c.updatedAt ?? c.createdAt,
  );
  const findings = newer(ofKeptCase(incoming.findings), local.findings.map((f) => ({ key: f.id, at: f.updatedAt ?? 0 })), (f) => f.id, (f) => f.updatedAt ?? 0);
  const plans = newer(ofKeptCase(incoming.plans), local.plans.map((p) => ({ key: p.caseId, at: p.updatedAt })), (p) => p.caseId, (p) => p.updatedAt);
  const grades = newer(ofKeptCase(incoming.grades), local.grades.map((g) => ({ key: g.id, at: g.updatedAt })), (g) => g.id, (g) => g.updatedAt);
  const simStates = newer(ofKeptCase(incoming.simStates), local.simStates.map((s) => ({ key: s.caseId, at: s.updatedAt })), (s) => s.caseId, (s) => s.updatedAt);
  const signoffs = newer(ofKeptCase(incoming.signoffs), local.signoffs.map((s) => ({ key: s.caseId, at: s.signedAt })), (s) => s.caseId, (s) => s.signedAt);
  const photos = missing(ofKeptCase(incoming.photos), local.photoIds, (p) => p.id);
  const simulations = missing(ofKeptCase(incoming.simulations), local.simulationIds, (s) => s.id);

  const localConsents = new Map(local.consents.map((c) => [c.id, c.revokedAt]));
  const consents: Consent[] = [];
  const revoke: MergePlan['revoke'] = [];
  for (const c of incoming.consents) {
    if (!knownPatients.has(c.patientId)) continue;
    if (!localConsents.has(c.id)) {
      consents.push(c);
      counts.added++;
    } else if (c.revokedAt !== undefined && localConsents.get(c.id) === undefined) {
      revoke.push({ id: c.id, revokedAt: c.revokedAt });
      counts.updated++;
    }
  }

  const localMessages = new Map(local.messages.map((m) => [m.id, m.sent]));
  const ownMessages = incoming.messages.filter((m) => m.owner === 'doctor' && !skipCodes.has(m.patientCode));
  const messages = ownMessages.filter((m) => !localMessages.has(m.id) && ++counts.added);
  const markSent = ownMessages.filter((m) => m.sent && localMessages.get(m.id) === false).map((m) => m.id);
  counts.updated += markSent.length;

  // Audit entries are added when missing; they are history, not counted as records.
  const incomingCases = new Set(incoming.cases.map((c) => c.id));
  const keepAuditTarget = (target: string) =>
    target.startsWith('patient:') ? knownPatients.has(target.slice('patient:'.length)) : !incomingCases.has(target) || keepCase.has(target);
  const haveAudit = new Set(local.audit.map(auditKey));
  const audit = incoming.audit.filter((a) => keepAuditTarget(a.caseId) && !haveAudit.has(auditKey(a))).map(({ caseId, at, action, before, after }) => ({ caseId, at, action, before, after }));

  let clinic: SettingRow | null = null;
  if (incoming.clinic && (!local.clinic || (incoming.clinic.updatedAt ?? 0) > (local.clinic.updatedAt ?? 0))) {
    clinic = incoming.clinic;
    counts[local.clinic ? 'updated' : 'added']++;
  }

  return {
    patients,
    cases,
    findings,
    plans,
    grades,
    simStates,
    signoffs,
    consents,
    messages,
    audit,
    photos,
    simulations,
    clinic,
    erased,
    revoke,
    markSent,
    counts,
  };
}
