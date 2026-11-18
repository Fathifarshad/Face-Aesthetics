import { describe, expect, it } from 'vitest';
import type { Consent } from '../data/types';
import { BackupFormatError, defaultInclude, mergeBackup, packBackup, reviewBackup, unpackBackup, type BackupData, type LocalState, type RestoreChoice } from './backupFile';
import { WrongSecretError } from './crypto';
import type { Case, Patient, Photo } from './types';

/** Low work factor keeps the suite fast. All data is synthetic. */
const FAST = 1_000;
const MARKER = 'SYNTHETIC-PHOTO-PAYLOAD';

const patient = (id: string, code: string): Patient => ({
  id,
  code,
  fileNo: 'T-1',
  displayName: 'بیمار آزمایشی',
  birthYear: 1980,
  sex: 'female',
  ethnicityNorm: 'default',
  createdAt: 1,
});
const kase = (id: string, patientId: string, updatedAt?: number): Case =>
  ({ id, patientId, createdAt: 10, status: 'draft', services: [], actualAge: 45, targetAge: 40, updatedAt }) as unknown as Case;
const photo = (id: string, caseId: string): Photo => ({
  id,
  caseId,
  phase: 'before',
  view: 'frontal',
  blob: new Blob([`${MARKER}:${id}`], { type: 'image/jpeg' }),
  width: 10,
  height: 10,
  landmarks: null,
  pose: null,
  qc: null,
  lowQuality: false,
  source: 'doctor',
  takenAt: 5,
});
const consent = (id: string, patientId: string, revokedAt?: number): Consent => ({
  id,
  patientId,
  scope: 'analysis',
  signedName: 'مراجع آزمایشی',
  signature: 'data:image/png;base64,AAAA',
  signedAt: 3,
  revokedAt,
});

const data = (over: Partial<BackupData> = {}): BackupData => ({
  createdAt: 100,
  patients: [],
  cases: [],
  findings: [],
  plans: [],
  grades: [],
  simStates: [],
  signoffs: [],
  consents: [],
  messages: [],
  audit: [],
  photos: [],
  simulations: [],
  clinic: null,
  erased: {},
  ...over,
});
const empty: LocalState = {
  patients: [],
  cases: [],
  findings: [],
  plans: [],
  grades: [],
  simStates: [],
  signoffs: [],
  consents: [],
  messages: [],
  audit: [],
  photoIds: [],
  simulationIds: [],
  clinic: null,
  erased: {},
};

describe('backup file', () => {
  const sample = data({
    patients: [patient('p1', 'AAA111')],
    cases: [kase('c1', 'p1')],
    photos: [photo('ph1', 'c1'), photo('ph2', 'c1')],
    clinic: { key: 'clinic', value: { doctorName: 'دکتر آزمایشی' }, updatedAt: 50 },
  });

  it('round-trips rows and image bytes', async () => {
    const file = await packBackup(sample, 'backup-pass-1', FAST);
    const back = await unpackBackup(file, 'backup-pass-1');
    expect(back.patients).toEqual(sample.patients);
    expect(back.clinic).toEqual(sample.clinic);
    expect(back.photos.map((p) => p.id)).toEqual(['ph1', 'ph2']);
    expect(await back.photos[1]!.blob.text()).toBe(`${MARKER}:ph2`);
    expect(back.photos[1]!.blob.type).toBe('image/jpeg');
  });

  it('keeps nothing readable without the password', async () => {
    const text = new TextDecoder('latin1').decode(await (await packBackup(sample, 'backup-pass-1', FAST)).arrayBuffer());
    expect(text).not.toContain(MARKER);
    expect(text).not.toContain('AAA111');
    expect(text.startsWith('{"format":"neva/backup","version":1,')).toBe(true);
  });

  it('refuses a wrong password, another file, a newer version and altered bytes', async () => {
    const file = await packBackup(sample, 'backup-pass-1', FAST);
    await expect(unpackBackup(file, 'wrong-pass-22')).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unpackBackup(new Blob(['{"format":"neva/patient-package"}\n{}']), 'x')).rejects.toBeInstanceOf(BackupFormatError);
    await expect(unpackBackup(new Blob(['no newline at all']), 'x')).rejects.toBeInstanceOf(BackupFormatError);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const nl = bytes.indexOf(10);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(0, nl))) as { version: number };
    const newer = new Blob([JSON.stringify({ ...header, version: 2 }), bytes.subarray(nl)]);
    await expect(unpackBackup(newer, 'backup-pass-1')).rejects.toMatchObject({ reason: 'newer' });

    const altered = bytes.slice();
    altered[altered.length - 5]! ^= 1;
    await expect(unpackBackup(new Blob([altered]), 'backup-pass-1')).rejects.toMatchObject({ reason: 'damaged' });
  });
});

/** Merge with the review's default ticks, as the doctor would see them. */
const merge = (local: LocalState, incoming: BackupData, tags: Record<string, string> = {}, choice?: Partial<RestoreChoice>) =>
  mergeBackup(local, incoming, tags, { include: defaultInclude(reviewBackup(local, incoming, tags)), newCodes: {}, ...choice });

describe('merge (restore merges, the newer record wins, nothing is deleted)', () => {
  it('adds what is missing and keeps what the device has', () => {
    const local: LocalState = { ...empty, patients: [patient('p1', 'AAA111')], cases: [{ id: 'c1', createdAt: 10, updatedAt: 90 }], photoIds: ['ph1'] };
    const incoming = data({
      patients: [patient('p1', 'AAA111'), patient('p2', 'BBB222')],
      cases: [kase('c1', 'p1', 80), kase('c2', 'p2')],
      photos: [photo('ph1', 'c1'), photo('ph3', 'c2')],
    });
    const plan = merge(local, incoming, {});
    expect(plan.patients.map((p) => p.id)).toEqual(['p2']);
    expect(plan.cases.map((c) => c.id)).toEqual(['c2']); // c1 on the device is newer
    expect(plan.photos.map((p) => p.id)).toEqual(['ph3']);
    expect(plan.counts).toEqual({ added: 3, updated: 0, skippedPatients: 0 });
  });

  it('takes the newer row from the backup', () => {
    const local: LocalState = { ...empty, patients: [patient('p1', 'AAA111')], cases: [{ id: 'c1', createdAt: 10 }], plans: [{ caseId: 'c1', updatedAt: 20 }] };
    const plan = merge(
      local,
      data({ patients: [patient('p1', 'AAA111')], cases: [kase('c1', 'p1', 30)], plans: [{ caseId: 'c1', tier: 'B', selections: {}, updatedAt: 40 } as never] }),
      {},
    );
    expect(plan.cases).toHaveLength(1);
    expect(plan.plans).toHaveLength(1);
    expect(plan.counts.updated).toBe(2);
  });

  it('never makes a revoked consent active again, but applies a revocation from the backup', () => {
    const local: LocalState = { ...empty, patients: [patient('p1', 'AAA111')], consents: [{ id: 'k1', revokedAt: 9 }, { id: 'k2' }] };
    const plan = merge(local, data({ patients: [patient('p1', 'AAA111')], consents: [consent('k1', 'p1'), consent('k2', 'p1', 7)] }), {});
    expect(plan.consents).toEqual([]);
    expect(plan.revoke).toEqual([{ id: 'k2', revokedAt: 7 }]);
  });

  const conflict = data({
    patients: [patient('p1', 'AAA111'), patient('p2', 'BBB222')],
    cases: [kase('c1', 'p1'), kase('c2', 'p2')],
    photos: [photo('ph1', 'c1'), photo('ph2', 'c2')],
    consents: [consent('k1', 'p1')],
    messages: [{ id: 'm1', owner: 'doctor', patientCode: 'BBB222', from: 'patient', text: 'سلام', at: 1, sent: true }],
    audit: [{ id: 3, caseId: 'c1', at: 1, action: 'case.create' }, { caseId: 'backup', at: 2, action: 'backup.export' }],
  });
  const other = { ...patient('p9', 'BBB222'), displayName: 'بیمار دیگر' };
  const withDeleted: LocalState = { ...empty, patients: [other], erased: { 'tag-p1': 5 } };
  const tags = { p1: 'tag-p1', p2: 'tag-p2' };

  it('shows the doctor where each patient stands before anything is written', () => {
    const review = reviewBackup(withDeleted, conflict, tags);
    expect(review.map((r) => [r.id, r.status, r.takenBy, r.cases, r.photos])).toEqual([
      ['p1', 'erased', undefined, 1, 1],
      ['p2', 'code-taken', 'بیمار دیگر', 1, 1],
    ]);
    expect([...defaultInclude(review)]).toEqual(['p2']);
  });

  it('leaves out an unticked patient with everything of theirs', () => {
    const plan = merge(withDeleted, conflict, tags, { include: new Set() });
    expect(plan.patients).toEqual([]);
    expect(plan.cases).toEqual([]);
    expect(plan.photos).toEqual([]);
    expect(plan.consents).toEqual([]);
    expect(plan.messages).toEqual([]);
    expect(plan.audit).toEqual([{ caseId: 'backup', at: 2, action: 'backup.export' }]);
    expect(plan.counts.skippedPatients).toBe(2);
    expect(plan.erased).toEqual({ 'tag-p1': 5 });
  });

  it('brings back a deleted patient when ticked, and clears the deletion tag', () => {
    const plan = merge(withDeleted, conflict, tags, { include: new Set(['p1']) });
    expect(plan.patients.map((p) => p.id)).toEqual(['p1']);
    expect(plan.photos.map((p) => p.id)).toEqual(['ph1']);
    expect(plan.consents.map((c) => c.id)).toEqual(['k1']);
    expect(plan.erased).toEqual({});
  });

  it('gives a patient whose code is taken a new code, messages included, and never overwrites the other', () => {
    const plan = merge(withDeleted, conflict, tags, { include: new Set(['p2']), newCodes: { p2: 'CCC333' } });
    expect(plan.patients.map((p) => [p.id, p.code])).toEqual([['p2', 'CCC333']]);
    expect(plan.messages.map((m) => m.patientCode)).toEqual(['CCC333']);
    // Without a new code it stays out.
    expect(merge(withDeleted, conflict, tags, { include: new Set(['p2']) }).patients).toEqual([]);
  });

  it('does not touch a patient who is already here when unticked', () => {
    const local: LocalState = { ...empty, patients: [patient('p1', 'AAA111')], cases: [{ id: 'c1', createdAt: 10 }] };
    const plan = merge(local, data({ patients: [patient('p1', 'AAA111')], cases: [kase('c1', 'p1', 99)] }), {}, { include: new Set() });
    expect(plan.cases).toEqual([]);
  });

  it('keeps the newer clinic settings and joins the deletion tags', () => {
    const local: LocalState = { ...empty, clinic: { key: 'clinic', value: {}, updatedAt: 10 }, erased: { a: 1 } };
    const older = merge(local, data({ clinic: { key: 'clinic', value: {}, updatedAt: 5 }, erased: { b: 2 } }), {});
    expect(older.clinic).toBeNull();
    expect(older.erased).toEqual({ a: 1, b: 2 });
    expect(merge(local, data({ clinic: { key: 'clinic', value: {}, updatedAt: 20 } }), {}).clinic?.updatedAt).toBe(20);
  });
});
