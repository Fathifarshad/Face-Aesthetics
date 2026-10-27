import { buildFindings } from '../analysis/analyze';
import { sampler, toGray } from '../capture/imageStats';
import { emptyIntake } from '../plan/intake';
import { audit, db, uid } from './db';
import { newPatientCode } from './patientCode';
import type { Case, FindingRow, Patient, Photo } from './types';

export async function createPatient(p: Omit<Patient, 'id' | 'code' | 'createdAt'>): Promise<Patient> {
  let code = newPatientCode();
  while (await db.patients.where('code').equals(code).count()) code = newPatientCode();
  const patient: Patient = { ...p, id: uid(), code, createdAt: Date.now() };
  await db.patients.add(patient);
  return patient;
}

export async function createCase(patient: Patient, services: string[]): Promise<Case> {
  const actualAge = new Date().getFullYear() - patient.birthYear;
  const c: Case = {
    id: uid(),
    patientId: patient.id,
    createdAt: Date.now(),
    status: 'draft',
    services,
    actualAge,
    apparentAge: null,
    targetAge: actualAge,
    tier: null,
    intake: emptyIntake(),
    consents: { photography: false, analysis: false, storage: false, educational: false, patientApp: false },
    screening: { bddPositive: null, note: '' },
    glogau: null,
  };
  await db.cases.add(c);
  await audit(c.id, 'case.create');
  return c;
}

/**
 * Applies a patch computed from the latest stored case inside one transaction, so rapid
 * successive edits (e.g. toggling several consents) never overwrite each other.
 */
export async function updateCase(id: string, patch: Partial<Case> | ((c: Case) => Partial<Case>), action = 'case.update') {
  await db.transaction('rw', [db.cases, db.audit], async () => {
    const before = await db.cases.get(id);
    if (!before) return;
    const p = typeof patch === 'function' ? patch(before) : patch;
    await db.cases.update(id, p);
    await audit(id, action, Object.fromEntries(Object.keys(p).map((k) => [k, before[k as keyof Case]])), p);
  });
}

export async function frontalPhoto(caseId: string, phase: 'before' | 'after' = 'before'): Promise<Photo | undefined> {
  const photos = await db.photos.where({ caseId, phase }).toArray();
  return photos.find((p) => p.view === 'frontal' && p.landmarks) ?? photos.find((p) => p.view === 'frontal');
}

/** Computes findings from the frontal "before" photo when none exist yet; keeps existing doctor edits. */
export async function ensureFindings(caseId: string): Promise<FindingRow[]> {
  const existing = await db.findings.where('caseId').equals(caseId).toArray();
  if (existing.length) return existing;
  const photo = await frontalPhoto(caseId);
  let sample = null;
  if (photo?.landmarks) {
    const bmp = await createImageBitmap(photo.blob);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
    sample = sampler(toGray(img.data, img.width, img.height));
  }
  const rows: FindingRow[] = buildFindings(photo?.landmarks ?? null, sample).map((f) => ({ ...f, id: `${caseId}:${f.key}`, caseId }));
  await db.findings.bulkPut(rows);
  await audit(caseId, 'findings.compute', undefined, { count: rows.length, photoId: photo?.id });
  return rows;
}

export async function recomputeFindings(caseId: string) {
  await db.findings.where('caseId').equals(caseId).delete();
  return ensureFindings(caseId);
}

export async function updateFinding(row: FindingRow, patch: Partial<FindingRow>) {
  await db.findings.update(row.id, patch);
  await audit(row.caseId, 'finding.update', { key: row.key, status: row.status, severity: row.severity }, { key: row.key, ...patch });
}

export async function deletePatient(patientId: string) {
  const p = await db.patients.get(patientId);
  const cases = await db.cases.where('patientId').equals(patientId).toArray();
  await db.transaction('rw', [db.patients, db.cases, db.photos, db.findings, db.plans, db.simulations, db.signoffs, db.messages, db.audit], async () => {
    for (const c of cases) {
      await db.photos.where('caseId').equals(c.id).delete();
      await db.findings.where('caseId').equals(c.id).delete();
      await db.simulations.where('caseId').equals(c.id).delete();
      await db.plans.delete(c.id);
      await db.signoffs.delete(c.id);
      await db.cases.delete(c.id);
      await audit(c.id, 'patient.delete');
    }
    if (p) await db.messages.where({ owner: 'doctor', patientCode: p.code }).delete();
    await db.patients.delete(patientId);
  });
}
