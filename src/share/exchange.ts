import { CATALOG } from '../analysis/catalog';
import { db, getSettings, uid } from '../db/db';
import { addPhoto, latestSimulation, listPhotos } from '../db/images';
import type { PtCase, PtRecord } from '../db/types';
import { optionById } from '../plan/data/treatments';
import { buildSessions } from '../plan/engine';
import { listGrades, getSimState } from '../db/simRepo';
import { sessionsOf } from '../data/optionSort';
import { CONCERN_IDS } from '../data/types';
import { fa } from '../i18n/fa';
import { en } from '../i18n/en';
import { chosenOptions, usable } from '../features/doctor/simDefaults';
import { screen, screenedOf } from '../features/doctor/optionScreening';
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
  const m6 = await m6Plan(caseId, c.intake);
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
    plan: m6?.plan ?? plan,
    sessions:
      m6?.sessions ??
      sessions.map((s) => ({
        index: s.index,
        kind: s.kind,
        items: s.optionIds.map((id) => optionById(id)!.title),
        after: s.after,
      })),
    aftercare: (m6?.modalities ?? modalities)
      .map((m) => ({ modality: m, text: settings.aftercare[m] ?? '' }))
      .filter((a) => a.text.trim()),
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
    for (const ph of await listPhotos(c.id))
      photos.push({ id: ph.id, caseId: c.id, phase: ph.phase, view: ph.view, dataUrl: await blobToDataUrl(ph.blob), takenAt: ph.takenAt });
    const sim = await latestSimulation(c.id);
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
      await addPhoto({
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

/** v1 session kinds of the client app for the PRD F5.5 stages. */
const STAGE_KIND = { 1: 'toxin-energy', 2: 'structure', 3: 'detail', 4: 'series' } as const;

/**
 * The M6 plan of a case (confirmed grades ≥ 1 and the option chosen for each, PRD F5) in the v1 package shape, so
 * the client app keeps working until M11 rebuilds the package. Null for a case graded only with the v1 analysis:
 * its v1 plan is sent as before.
 */
async function m6Plan(caseId: string, intake: Parameters<typeof screen>[1]) {
  const grades = await listGrades(caseId);
  const concerns = CONCERN_IDS.filter((id) => grades.some((g) => g.concernId === id && usable(g) && g.grade >= 1));
  if (!concerns.length) return null;
  const sim = await getSimState(caseId);
  const chosen = chosenOptions(concerns, sim.options ?? {}, grades, (o) => screen(o, intake).blocks.length === 0);
  const picked = concerns.map((id) => chosen[id]).filter((o) => !!o);
  const title = (o: (typeof picked)[number]) => ({ fa: o.nameFa, en: o.nameEn });
  return {
    plan: picked.map((o) => ({
      findingKey: o.concernId,
      label: { fa: fa.concerns[o.concernId], en: en.concerns[o.concernId] },
      options: [{ id: o.id, title: title(o), modality: screenedOf(o).modality }],
    })),
    sessions: sessionsOf(picked).map((s, index) => ({ index, kind: STAGE_KIND[s.stage], items: s.options.map(title), after: null })),
    modalities: [...new Set(picked.map((o) => screenedOf(o).modality))],
  };
}
