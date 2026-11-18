import { audit, db } from './db';
import type { Consent } from '../data/types';
import type { ConsentRow, Photo, PhotoPhase, PhotoRow, SignOff, SignOffRow, Simulation, SimulationRow } from './types';
import { forgetImage, openBlob, openString, openUncached, sealBlob, sealString } from './vault';

/**
 * The only place images are read from or written to storage. Rows hold ciphertext (`sealed`); callers get
 * and give plain `Photo` / `Simulation` / `SignOff` objects. Requires an unlocked vault.
 *
 * Inside a Dexie liveQuery, start these calls together (Promise.all) and do not read Dexie after awaiting
 * one of them: decryption is a non-Dexie async step, and Dexie stops tracking a query after such a step.
 */

const toPhoto = async ({ sealed, ...rest }: PhotoRow): Promise<Photo> => ({ ...rest, blob: await openBlob(rest.id, sealed) });
const toSimulation = async ({ sealed, ...rest }: SimulationRow): Promise<Simulation> => ({ ...rest, blob: await openBlob(rest.id, sealed) });

export async function sealPhoto({ blob, ...rest }: Photo): Promise<PhotoRow> {
  return { ...rest, sealed: await sealBlob(blob) };
}

export async function listPhotos(caseId: string, phase?: PhotoPhase): Promise<Photo[]> {
  const rows = await (phase ? db.photos.where({ caseId, phase }) : db.photos.where('caseId').equals(caseId)).toArray();
  return Promise.all(rows.map(toPhoto));
}

export async function listPhotosOfCases(caseIds: readonly string[]): Promise<Photo[]> {
  const rows = (await Promise.all(caseIds.map((id) => db.photos.where('caseId').equals(id).toArray()))).flat();
  return Promise.all(rows.map(toPhoto));
}

export const addPhoto = async (photo: Photo): Promise<void> => void (await db.photos.put(await sealPhoto(photo)));

/** Simulations of a case, oldest first. */
export async function listSimulations(caseId: string): Promise<Simulation[]> {
  const rows = await db.simulations.where('caseId').equals(caseId).sortBy('createdAt');
  return Promise.all(rows.map(toSimulation));
}

export const latestSimulation = async (caseId: string): Promise<Simulation | null> => (await listSimulations(caseId)).at(-1) ?? null;

/** Stores a simulation as the only one of its case. */
export async function replaceSimulation({ blob, ...rest }: Simulation): Promise<void> {
  const row: SimulationRow = { ...rest, sealed: await sealBlob(blob) };
  const old = (await db.simulations.where('caseId').equals(rest.caseId).primaryKeys()) as string[];
  await db.transaction('rw', db.simulations, async () => {
    await db.simulations.bulkDelete(old);
    await db.simulations.add(row);
  });
  old.forEach(forgetImage);
}

export async function getSignoff(caseId: string): Promise<SignOff | null> {
  const row = await db.signoffs.get(caseId);
  if (!row) return null;
  const { sealedSignature, ...rest } = row;
  return { ...rest, signature: await openString(sealedSignature) };
}

export async function saveSignoff({ signature, ...rest }: SignOff): Promise<void> {
  await db.signoffs.put({ ...rest, sealedSignature: await sealString(signature) });
}

/** Consents of a patient, oldest first, revoked ones included (the history stays). */
export async function listConsents(patientId: string): Promise<Consent[]> {
  const rows = await db.consents.where('patientId').equals(patientId).sortBy('signedAt');
  return Promise.all(rows.map(async ({ sealedSignature, ...rest }) => ({ ...rest, signature: await openString(sealedSignature) })));
}

export async function addConsent({ signature, ...rest }: Consent): Promise<void> {
  const row: ConsentRow = { ...rest, sealedSignature: await sealString(signature) };
  await db.transaction('rw', [db.consents, db.audit], async () => {
    await db.consents.add(row);
    await audit(`patient:${rest.patientId}`, 'consent.sign', undefined, { scope: rest.scope, detail: rest.detail });
  });
}

/** PRD F8.6: revocation keeps the row (and its signature) and stamps the time; outputs stop at once. */
export async function revokeConsent(id: string): Promise<void> {
  await db.transaction('rw', [db.consents, db.audit], async () => {
    const row = await db.consents.get(id);
    if (!row || row.revokedAt) return;
    const at = Date.now();
    await db.consents.update(id, { revokedAt: at });
    await audit(`patient:${row.patientId}`, 'consent.revoke', { scope: row.scope }, { revokedAt: at });
  });
}

// ── Backup (R1, src/db/backup.ts): every image of the device in plain form, and sealing for a restore ──
// Decrypted without the session cache, so a backup of many photos does not push out the images on screen.

export async function allPhotosPlain(): Promise<Photo[]> {
  const rows = await db.photos.toArray();
  return Promise.all(rows.map(async ({ sealed, ...rest }) => ({ ...rest, blob: await openUncached(sealed) })));
}

export async function allSimulationsPlain(): Promise<Simulation[]> {
  const rows = await db.simulations.toArray();
  return Promise.all(rows.map(async ({ sealed, ...rest }) => ({ ...rest, blob: await openUncached(sealed) })));
}

export async function allSignoffsPlain(): Promise<SignOff[]> {
  const rows = await db.signoffs.toArray();
  return Promise.all(rows.map(async ({ sealedSignature, ...rest }) => ({ ...rest, signature: await openString(sealedSignature) })));
}

export async function allConsentsPlain(): Promise<Consent[]> {
  const rows = await db.consents.toArray();
  return Promise.all(rows.map(async ({ sealedSignature, ...rest }) => ({ ...rest, signature: await openString(sealedSignature) })));
}

export const sealSimulation = async ({ blob, ...rest }: Simulation): Promise<SimulationRow> => ({ ...rest, sealed: await sealBlob(blob) });
export const sealSignoff = async ({ signature, ...rest }: SignOff): Promise<SignOffRow> => ({ ...rest, sealedSignature: await sealString(signature) });
export const sealConsent = async ({ signature, ...rest }: Consent): Promise<ConsentRow> => ({ ...rest, sealedSignature: await sealString(signature) });
