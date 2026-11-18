import { describe, expect, it } from 'vitest';
import type { Consent } from '../data/types';
import { BackupFormatError, mergeBackup, packBackup, unpackBackup, type BackupData, type LocalState } from './backupFile';
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

describe('merge (restore merges, the newer record wins, nothing is deleted)', () => {
  it('adds what is missing and keeps what the device has', () => {
    const local: LocalState = { ...empty, patients: [patient('p1', 'AAA111')], cases: [{ id: 'c1', createdAt: 10, updatedAt: 90 }], photoIds: ['ph1'] };
    const incoming = data({
      patients: [patient('p1', 'AAA111'), patient('p2', 'BBB222')],
      cases: [kase('c1', 'p1', 80), kase('c2', 'p2')],
      photos: [photo('ph1', 'c1'), photo('ph3', 'c2')],
    });
    const plan = mergeBackup(local, incoming, {});
    expect(plan.patients.map((p) => p.id)).toEqual(['p2']);
    expect(plan.cases.map((c) => c.id)).toEqual(['c2']); // c1 on the device is newer
    expect(plan.photos.map((p) => p.id)).toEqual(['ph3']);
    expect(plan.counts).toEqual({ added: 3, updated: 0, skippedPatients: 0 });
  });

  it('takes the newer row from the backup', () => {
    const local: LocalState = { ...empty, patients: [patient('p1', 'AAA111')], cases: [{ id: 'c1', createdAt: 10 }], plans: [{ caseId: 'c1', updatedAt: 20 }] };
    const plan = mergeBackup(
      local,
      data({ cases: [kase('c1', 'p1', 30)], plans: [{ caseId: 'c1', tier: 'B', selections: {}, updatedAt: 40 } as never] }),
      {},
    );
    expect(plan.cases).toHaveLength(1);
    expect(plan.plans).toHaveLength(1);
    expect(plan.counts.updated).toBe(2);
  });

  it('never makes a revoked consent active again, but applies a revocation from the backup', () => {
    const local: LocalState = { ...empty, patients: [patient('p1', 'AAA111')], consents: [{ id: 'k1', revokedAt: 9 }, { id: 'k2' }] };
    const plan = mergeBackup(local, data({ consents: [consent('k1', 'p1'), consent('k2', 'p1', 7)] }), {});
    expect(plan.consents).toEqual([]);
    expect(plan.revoke).toEqual([{ id: 'k2', revokedAt: 7 }]);
  });

  it('does not bring back a deleted patient or take over another patient’s code', () => {
    const local: LocalState = { ...empty, patients: [patient('p9', 'BBB222')], erased: { 'tag-p1': 5 } };
    const incoming = data({
      patients: [patient('p1', 'AAA111'), patient('p2', 'BBB222')],
      cases: [kase('c1', 'p1'), kase('c2', 'p2')],
      photos: [photo('ph1', 'c1'), photo('ph2', 'c2')],
      consents: [consent('k1', 'p1')],
      messages: [{ id: 'm1', owner: 'doctor', patientCode: 'BBB222', from: 'patient', text: 'سلام', at: 1, sent: true }],
      audit: [{ id: 3, caseId: 'c1', at: 1, action: 'case.create' }, { caseId: 'backup', at: 2, action: 'backup.export' }],
    });
    const plan = mergeBackup(local, incoming, { p1: 'tag-p1', p2: 'tag-p2' });
    expect(plan.patients).toEqual([]);
    expect(plan.cases).toEqual([]);
    expect(plan.photos).toEqual([]);
    expect(plan.consents).toEqual([]);
    expect(plan.messages).toEqual([]);
    expect(plan.audit).toEqual([{ caseId: 'backup', at: 2, action: 'backup.export' }]);
    expect(plan.counts.skippedPatients).toBe(2);
  });

  it('keeps the newer clinic settings and joins the deletion tags', () => {
    const local: LocalState = { ...empty, clinic: { key: 'clinic', value: {}, updatedAt: 10 }, erased: { a: 1 } };
    const older = mergeBackup(local, data({ clinic: { key: 'clinic', value: {}, updatedAt: 5 }, erased: { b: 2 } }), {});
    expect(older.clinic).toBeNull();
    expect(older.erased).toEqual({ a: 1, b: 2 });
    expect(mergeBackup(local, data({ clinic: { key: 'clinic', value: {}, updatedAt: 20 } }), {}).clinic?.updatedAt).toBe(20);
  });
});
