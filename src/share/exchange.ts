import { CATALOG } from '../analysis/catalog';
import { db, getSettings, uid } from '../db/db';
import type { PtCase, PtRecord } from '../db/types';
import { optionById } from '../plan/data/treatments';
import { buildSessions } from '../plan/engine';
import { mergeMessages, type PatientPackage, type ReplyPackage } from './format';

export const blobToDataUrl = (b: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

export const dataUrlToBlob = async (u: string): Promise<Blob> => (await fetch(u)).blob();

/** Patient-facing summary of a signed case (plain wording, no measurements, no volumes). */
export async function toPtCase(caseId: string): Promise<PtCase | null> {
  const c = await db.cases.get(caseId);
  const sign = await db.signoffs.get(caseId);
  if (!c || !sign) return null;
  const settings = await getSettings();
  const findings = (await db.findings.where('caseId').equals(caseId).toArray())
    .filter((f) => f.status !== 'rejected' && (f.severity ?? 0) >= 1 && CATALOG[f.key]?.graded)
    .map((f) => ({ key: f.key, label: CATALOG[f.key]!.label, patient: CATALOG[f.key]!.patient, severity: f.severity ?? 0 }));
  const planRow = await db.plans.get(caseId);
  const selections = planRow?.selections ?? {};
  const plan = Object.entries(selections)
    .filter(([, ids]) => ids.length)
    .map(([key, ids]) => ({
      findingKey: key,
      label: CATALOG[key]?.label ?? { fa: key, en: key },
      options: ids.map((id) => optionById(id)).filter((o) => !!o).map((o) => ({ id: o.id, title: o.title, modality: o.modality })),
    }));
  const allIds = Object.values(selections).flat();
  const { sessions } = buildSessions(allIds, settings.maxHighRiskPerSession);
  const modalities = [...new Set(allIds.map((id) => optionById(id)?.modality).filter((m): m is NonNullable<typeof m> => !!m))];
  return {
    id: c.id,
    date: c.createdAt,
    services: c.services,
    actualAge: c.actualAge,
    targetAge: c.targetAge,
    findings,
    plan,
    sessions: sessions.map((s) => ({
      index: s.index,
      kind: s.kind,
      items: s.optionIds.map((id) => optionById(id)!.title),
      after: s.after,
    })),
    aftercare: modalities.map((m) => ({ modality: m, text: settings.aftercare[m] ?? '' })).filter((a) => a.text.trim()),
    signedAt: sign.signedAt,
    doctorName: sign.doctorName,
  };
}

export async function buildPatientPackage(patientId: string): Promise<PatientPackage> {
  const p = await db.patients.get(patientId);
  if (!p) throw new Error('patient-not-found');
  const settings = await getSettings();
  const cases = (await db.cases.where('patientId').equals(patientId).toArray()).filter((c) => c.consents.patientApp);
  const ptCases = (await Promise.all(cases.map((c) => toPtCase(c.id)))).filter((c): c is PtCase => !!c);
  const photos: PatientPackage['photos'] = [];
  for (const c of ptCases) {
    for (const ph of await db.photos.where('caseId').equals(c.id).toArray())
      photos.push({ id: ph.id, caseId: c.id, phase: ph.phase, view: ph.view, dataUrl: await blobToDataUrl(ph.blob), takenAt: ph.takenAt });
    const sims = await db.simulations.where('caseId').equals(c.id).sortBy('createdAt');
    const sim = sims.at(-1);
    if (sim) photos.push({ id: sim.id, caseId: c.id, phase: 'simulation', view: 'frontal', dataUrl: await blobToDataUrl(sim.blob), takenAt: sim.createdAt });
  }
  const messages = await db.messages.where({ owner: 'doctor', patientCode: p.code }).toArray();
  await db.messages.where({ owner: 'doctor', patientCode: p.code }).modify({ sent: true });
  return {
    format: 'tanasob/patient-package',
    version: 1,
    exportedAt: Date.now(),
    code: p.code,
    patientName: p.displayName,
    clinic: { name: settings.clinicName, doctor: settings.doctorName, phone: settings.clinicPhone, address: settings.clinicAddress },
    cases: ptCases,
    photos,
    messages: messages.map(({ id, from, text, at }) => ({ id, from, text, at })),
  };
}

export async function buildReplyPackage(code: string): Promise<ReplyPackage> {
  const messages = (await db.messages.where({ owner: 'patient', patientCode: code }).toArray()).filter((m) => m.from === 'patient');
  const photos = await db.ptPhotos.where('code').equals(code).filter((p) => p.phase === 'progress' && !p.sent).toArray();
  const pkg: ReplyPackage = {
    format: 'tanasob/patient-reply',
    version: 1,
    exportedAt: Date.now(),
    code,
    messages: messages.map(({ id, from, text, at }) => ({ id, from, text, at })),
    photos: await Promise.all(photos.map(async (p) => ({ id: p.id, view: p.view, dataUrl: await blobToDataUrl(p.blob), takenAt: p.takenAt }))),
  };
  await db.messages.where({ owner: 'patient', patientCode: code }).modify({ sent: true });
  await db.ptPhotos.bulkUpdate(photos.map((p) => ({ key: p.id, changes: { sent: true } })));
  return pkg;
}

/** Client app: store / refresh the clinic record identified by the patient code. */
export async function importIntoClient(pkg: PatientPackage): Promise<PtRecord> {
  const record: PtRecord = { code: pkg.code, patientName: pkg.patientName, clinic: pkg.clinic, cases: pkg.cases, updatedAt: Date.now() };
  await db.ptRecords.put(record);
  const existing = new Set((await db.ptPhotos.where('code').equals(pkg.code).primaryKeys()) as string[]);
  for (const ph of pkg.photos) {
    if (existing.has(ph.id)) continue;
    await db.ptPhotos.put({
      id: ph.id,
      code: pkg.code,
      caseId: ph.caseId,
      phase: ph.phase as 'before' | 'after' | 'simulation',
      view: ph.view,
      blob: await dataUrlToBlob(ph.dataUrl),
      takenAt: ph.takenAt,
      sent: true,
    });
  }
  const mine = await db.messages.where({ owner: 'patient', patientCode: pkg.code }).toArray();
  const merged = mergeMessages(mine, pkg.messages.map((m) => ({ ...m, owner: 'patient' as const, patientCode: pkg.code, sent: true })));
  await db.messages.bulkPut(merged);
  return record;
}

/** Doctor app: add client questions and progress photos to the patient's latest case. */
export async function importIntoDoctor(pkg: ReplyPackage): Promise<{ patientId: string; messages: number; photos: number }> {
  const patient = await db.patients.where('code').equals(pkg.code).first();
  if (!patient) throw new Error('unknown-patient');
  const mine = await db.messages.where({ owner: 'doctor', patientCode: pkg.code }).toArray();
  const incoming = pkg.messages.filter((m) => !mine.some((x) => x.id === m.id));
  await db.messages.bulkPut(incoming.map((m) => ({ ...m, owner: 'doctor' as const, patientCode: pkg.code, sent: true })));
  const latest = (await db.cases.where('patientId').equals(patient.id).sortBy('createdAt')).at(-1);
  let added = 0;
  if (latest) {
    for (const ph of pkg.photos) {
      if (await db.photos.get(ph.id)) continue;
      const blob = await dataUrlToBlob(ph.dataUrl);
      const bmp = await createImageBitmap(blob);
      await db.photos.put({
        id: ph.id,
        caseId: latest.id,
        phase: 'after',
        view: ph.view,
        blob,
        width: bmp.width,
        height: bmp.height,
        landmarks: null,
        pose: null,
        qc: null,
        lowQuality: true,
        source: 'patient',
        takenAt: ph.takenAt,
      });
      added++;
    }
  }
  return { patientId: patient.id, messages: incoming.length, photos: added };
}

/** Uses the system share sheet when files can be shared (phones), otherwise downloads the file. */
export async function shareJson(obj: unknown, filename: string): Promise<'shared' | 'downloaded'> {
  const file = new File([JSON.stringify(obj)], filename, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch {
      // user cancelled or share failed → fall back to download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

export const newMessageId = uid;
