import { audit, db, type SettingRow } from './db';
import { allConsentsPlain, allPhotosPlain, allSignoffsPlain, allSimulationsPlain, sealConsent, sealPhoto, sealSignoff, sealSimulation } from './images';
import {
  backupFileName,
  defaultInclude,
  mergeBackup,
  packBackup,
  reviewBackup,
  unpackBackup,
  type BackupData,
  type LocalState,
  type MergeCounts,
  type PatientReview,
  type RestoreChoice,
} from './backupFile';
import { newPatientCode } from './patientCode';

/**
 * Backup and restore of the doctor's device (Release 1.1, R1). The file format and the merge rules are in
 * `backupFile.ts`; this is the Dexie side. Both directions need the unlocked vault: images are decrypted with the
 * device key for the backup and sealed again with the (possibly different) key of the device that restores.
 * The vault record and the client app's tables are never in a backup.
 */

/** Settings key of the deletion tags (`deletePatient`). */
export const ERASED_KEY = 'erased';

/**
 * Tag kept after a patient is deleted, so a restore does not bring the record back. A SHA-256 of the random id:
 * it names no one and points to nothing that is still on the device.
 */
export async function erasureTag(patientId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`neva-erased:${patientId}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const readErased = async (): Promise<Record<string, number>> => ((await db.settings.get(ERASED_KEY))?.value as Record<string, number> | undefined) ?? {};
const readClinic = async (): Promise<SettingRow | null> => (await db.settings.get('clinic')) ?? null;

/** The whole doctor side of the device as one encrypted file. */
export async function exportBackup(password: string): Promise<File> {
  const [patients, cases, findings, plans, grades, simStates, messages, auditRows, clinic, erased] = await Promise.all([
    db.patients.toArray(),
    db.cases.toArray(),
    db.findings.toArray(),
    db.plans.toArray(),
    db.grades.toArray(),
    db.simStates.toArray(),
    db.messages.where('owner').equals('doctor').toArray(),
    db.audit.toArray(),
    readClinic(),
    readErased(),
  ]);
  const [photos, simulations, signoffs, consents] = await Promise.all([allPhotosPlain(), allSimulationsPlain(), allSignoffsPlain(), allConsentsPlain()]);
  const createdAt = Date.now();
  const data: BackupData = { createdAt, patients, cases, findings, plans, grades, simStates, signoffs, consents, messages, audit: auditRows, photos, simulations, clinic, erased };
  const blob = await packBackup(data, password);
  await audit('backup', 'backup.export', undefined, { patients: patients.length, photos: photos.length });
  return new File([blob], backupFileName(createdAt), { type: 'application/octet-stream' });
}

async function readLocal(): Promise<LocalState> {
  const [patients, cases, findings, plans, grades, simStates, signoffs, consents, messages, auditRows, photoIds, simulationIds, clinic, erased] = await Promise.all([
    db.patients.toArray(),
    db.cases.toArray(),
    db.findings.toArray(),
    db.plans.toArray(),
    db.grades.toArray(),
    db.simStates.toArray(),
    db.signoffs.toArray(),
    db.consents.toArray(),
    db.messages.where('owner').equals('doctor').toArray(),
    db.audit.toArray(),
    db.photos.toCollection().primaryKeys(),
    db.simulations.toCollection().primaryKeys(),
    readClinic(),
    readErased(),
  ]);
  return { patients, cases, findings, plans, grades, simStates, signoffs, consents, messages, audit: auditRows, photoIds, simulationIds, clinic, erased };
}

/** A backup that was opened and checked against this device, waiting for the doctor's choice. Nothing written yet. */
export type PreparedRestore = {
  data: BackupData;
  tags: Record<string, string>;
  review: PatientReview[];
  /** What the file holds, for the review screen. */
  totals: { patients: number; cases: number; photos: number; createdAt: number };
};

/**
 * Step 1: decrypts the file and compares it with this device. Throws WrongSecretError for a wrong password and
 * BackupFormatError for a file that is not an intact NEVA backup.
 */
export async function prepareRestore(file: Blob, password: string): Promise<PreparedRestore> {
  const data = await unpackBackup(file, password);
  const tags = Object.fromEntries(await Promise.all(data.patients.map(async (p) => [p.id, await erasureTag(p.id)] as const)));
  const review = reviewBackup(await readLocal(), data, tags);
  return { data, tags, review, totals: { patients: data.patients.length, cases: data.cases.length, photos: data.photos.length, createdAt: data.createdAt } };
}

export { defaultInclude };

/** Step 2: merges the patients the doctor kept ticked (rules in `mergeBackup`). */
export async function applyRestore({ data: incoming, tags }: PreparedRestore, include: ReadonlySet<string>): Promise<MergeCounts> {
  // Read again: the device may have changed while the review was open.
  const local = await readLocal();
  const review = reviewBackup(local, incoming, tags);
  const taken = new Set(local.patients.map((p) => p.code));
  const newCodes: Record<string, string> = {};
  for (const r of review) {
    if (r.status !== 'code-taken' || !include.has(r.id)) continue;
    let code = newPatientCode();
    while (taken.has(code)) code = newPatientCode();
    taken.add(code);
    newCodes[r.id] = code;
  }
  const choice: RestoreChoice = { include, newCodes };
  const plan = mergeBackup(local, incoming, tags, choice);
  // Encrypt first: an IndexedDB transaction cannot wait for Web Crypto.
  const [photos, simulations, signoffs, consents] = await Promise.all([
    Promise.all(plan.photos.map(sealPhoto)),
    Promise.all(plan.simulations.map(sealSimulation)),
    Promise.all(plan.signoffs.map(sealSignoff)),
    Promise.all(plan.consents.map(sealConsent)),
  ]);
  const tables = [db.patients, db.cases, db.findings, db.plans, db.grades, db.simStates, db.signoffs, db.consents, db.messages, db.audit, db.photos, db.simulations, db.settings];
  await db.transaction('rw', tables, async () => {
    await db.patients.bulkPut(plan.patients);
    await db.cases.bulkPut(plan.cases);
    await db.findings.bulkPut(plan.findings);
    await db.plans.bulkPut(plan.plans);
    await db.grades.bulkPut(plan.grades);
    await db.simStates.bulkPut(plan.simStates);
    // Sealed rows from src/db/images.ts; this is the only write of image rows outside that file.
    await db.signoffs.bulkPut(signoffs);
    await db.consents.bulkPut(consents);
    await db.photos.bulkPut(photos);
    await db.simulations.bulkPut(simulations);
    for (const r of plan.revoke) await db.consents.update(r.id, { revokedAt: r.revokedAt });
    await db.messages.bulkPut(plan.messages);
    if (plan.markSent.length) await db.messages.where('id').anyOf(plan.markSent).modify({ sent: true });
    await db.audit.bulkAdd(plan.audit);
    if (plan.clinic) await db.settings.put(plan.clinic);
    await db.settings.put({ key: ERASED_KEY, value: plan.erased });
    await audit('backup', 'backup.restore', undefined, { ...plan.counts, from: incoming.createdAt });
  });
  return plan.counts;
}
