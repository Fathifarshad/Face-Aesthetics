import { canShare } from '../data/consentGate';
import { CATALOG } from '../analysis/catalog';
import { approvalOf, approvalStamp } from '../db/approval';
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
import { FORMAT_VERSION, PACKAGE_FORMAT, REPLY_FORMAT, mergeMessages, type PatientPackage, type ReplyPackage } from './format';

export const blobToDataUrl = (b: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

export const dataUrlToBlob = async (u: string): Promise<Blob> => (await fetch(u)).blob();

/**
 * Patient-facing summary of a signed case (PRD F10.3): plain wording, chosen options, sessions, aftercare, the doctor's
 * note. Never grades, volume or dose ranges, MD Codes, screening results or cost (F10.6).
 */
export async function toPtCase(caseId: string): Promise<PtCase | null> {
  const c = await db.cases.get(caseId);
  const sign = await db.signoffs.get(caseId);
  if (!c || !sign) return null;
  // PRD F9.2 / hard rule: only content the doctor approved, unchanged since the sign-off, leaves the device.
  if (approvalOf(sign, await approvalStamp(caseId)) !== 'fresh') return null;
  const settings = await getSettings();
  const m6 = await m6Plan(caseId, c.intake);
  const findings =
    m6?.areas ??
    (await db.findings.where('caseId').equals(caseId).toArray())
      .filter((f) => f.status !== 'rejected' && (f.severity ?? 0) >= 1 && CATALOG[f.key]?.graded)
      .map((f) => ({ key: f.key, label: CATALOG[f.key]!.label, patient: CATALOG[f.key]!.patient }));
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
    ...(planRow?.reportNote?.trim() ? { note: planRow.reportNote.trim() } : {}),
  };
}

export async function buildPatientPackage(patientId: string): Promise<PatientPackage> {
  const p = await db.patients.get(patientId);
  if (!p) throw new Error('patient-not-found');
  const settings = await getSettings();
  const cases = (await db.cases.where('patientId').equals(patientId).toArray()).filter((c) => c.consents.patientApp);
  const ptCases = (await Promise.all(cases.map((c) => toPtCase(c.id)))).filter((c): c is PtCase => !!c);
  // PRD F8.4: no photo (nor the simulation made from one) without the patient's live level-3 consent.
  const photosAllowed = canShare(await db.consents.where('patientId').equals(patientId).toArray(), 'patient');
  const photos: PatientPackage['photos'] = [];
  for (const c of photosAllowed ? ptCases : []) {
    for (const ph of await listPhotos(c.id))
      photos.push({ id: ph.id, caseId: c.id, phase: ph.phase, view: ph.view, dataUrl: await blobToDataUrl(ph.blob), takenAt: ph.takenAt });
    const sim = await latestSimulation(c.id);
    if (sim) photos.push({ id: sim.id, caseId: c.id, phase: 'simulation', view: 'frontal', dataUrl: await blobToDataUrl(sim.blob), takenAt: sim.createdAt });
  }
  const messages = await db.messages.where({ owner: 'doctor', patientCode: p.code }).toArray();
  await db.messages.where({ owner: 'doctor', patientCode: p.code }).modify({ sent: true });
  return {
    format: PACKAGE_FORMAT,
    version: FORMAT_VERSION,
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
    format: REPLY_FORMAT,
    version: FORMAT_VERSION,
    exportedAt: Date.now(),
    code,
    messages: messages.map(({ id, from, text, at }) => ({ id: wireId(id), from, text, at })),
    photos: await Promise.all(photos.map(async (p) => ({ id: p.id, view: p.view, dataUrl: await blobToDataUrl(p.blob), takenAt: p.takenAt }))),
  };
  await db.messages.where({ owner: 'patient', patientCode: code }).modify({ sent: true });
  await db.ptPhotos.bulkUpdate(photos.map((p) => ({ key: p.id, changes: { sent: true } })));
  return pkg;
}

const CLINIC_PHASES: readonly string[] = ['before', 'after', 'simulation'];

/**
 * Client app: store / refresh the clinic record identified by the patient code. The newest clinic file is the truth:
 * photos the clinic sent before and left out now (consent revoked, case no longer signed) are removed from the phone
 * (owner decision 2026-11-16); the patient's own progress photos stay. An older file than the stored one is refused.
 */
export async function importIntoClient(pkg: PatientPackage): Promise<PtRecord> {
  const prev = await db.ptRecords.get(pkg.code);
  if (prev?.exportedAt && pkg.exportedAt < prev.exportedAt) throw new Error('older-package');
  const record: PtRecord = {
    code: pkg.code,
    patientName: pkg.patientName,
    clinic: pkg.clinic,
    cases: pkg.cases,
    updatedAt: Date.now(),
    exportedAt: pkg.exportedAt,
  };
  await db.ptRecords.put(record);
  const keep = new Set(pkg.photos.map((p) => p.id));
  const fromClinic = await db.ptPhotos.where('code').equals(pkg.code).filter((p) => p.phase !== 'progress' && !keep.has(p.id)).primaryKeys();
  await db.ptPhotos.bulkDelete(fromClinic as string[]);
  const existing = new Set((await db.ptPhotos.where('code').equals(pkg.code).primaryKeys()) as string[]);
  for (const ph of pkg.photos) {
    // Only clinic phases: a 'progress' photo in a clinic file would escape the clean-up above.
    if (existing.has(ph.id) || !CLINIC_PHASES.includes(ph.phase)) continue;
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
  // Rows from before the prefix (v1 kit) move to the client key, so a doctor on the same device keeps their own rows.
  const legacy = mine.filter((m) => !m.id.startsWith(CLIENT_PREFIX));
  const merged = mergeMessages(
    mine.map((m) => ({ ...m, id: clientKey(wireId(m.id)) })),
    pkg.messages.map((m) => ({ ...m, id: clientKey(m.id), owner: 'patient' as const, patientCode: pkg.code, sent: true })),
  );
  await db.messages.bulkDelete(legacy.map((m) => m.id));
  await db.messages.bulkPut(merged);
  return record;
}

/** Doctor app: add client questions and progress photos to the patient's latest case. */
export async function importIntoDoctor(pkg: ReplyPackage): Promise<{ patientId: string; messages: number; photos: number }> {
  const patient = await db.patients.where('code').equals(pkg.code).first();
  if (!patient) throw new Error('unknown-patient');
  const mine = await db.messages.where({ owner: 'doctor', patientCode: pkg.code }).toArray();
  // A reply carries only the patient's own words; anything signed as the doctor is ignored.
  const incoming = pkg.messages.filter((m) => m.from === 'patient' && !mine.some((x) => x.id === m.id));
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
  return shareFile(new File([JSON.stringify(obj)], filename, { type: 'application/json' }));
}

/** Share sheet when the device can share files, otherwise a download. The caller checks consent first. */
export async function shareFile(file: File): Promise<'shared' | 'downloaded'> {
  const filename = file.name;
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

/**
 * The doctor app and the client app share one `messages` table, and a message keeps its id in both (that id is what
 * stops duplicates in the files). On one device (a doctor trying the client app) the two copies would overwrite each
 * other, so the client app stores its rows under `pt:<id>` and the files carry the bare id.
 */
const CLIENT_PREFIX = 'pt:';
const clientKey = (id: string) => CLIENT_PREFIX + id;
const wireId = (id: string) => (id.startsWith(CLIENT_PREFIX) ? id.slice(CLIENT_PREFIX.length) : id);
/** Id for a question the patient writes in the client app. */
export const newClientMessageId = () => clientKey(uid());

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
  const areas = concerns.map((id) => ({
    key: id,
    label: { fa: fa.concerns[id], en: en.concerns[id] },
    patient: { fa: fa.concernsPatient[id], en: en.concernsPatient[id] },
  }));
  const sim = await getSimState(caseId);
  const chosen = chosenOptions(concerns, sim.options ?? {}, grades, (o) => screen(o, intake).blocks.length === 0);
  const picked = concerns.map((id) => chosen[id]).filter((o) => !!o);
  const title = (o: (typeof picked)[number]) => ({ fa: o.nameFa, en: o.nameEn });
  return {
    areas,
    plan: picked.map((o) => ({
      findingKey: o.concernId,
      label: { fa: fa.concerns[o.concernId], en: en.concerns[o.concernId] },
      options: [{ id: o.id, title: title(o), modality: screenedOf(o).modality }],
    })),
    sessions: sessionsOf(picked).map((s, index) => ({ index, kind: STAGE_KIND[s.stage], items: s.options.map(title), after: null })),
    modalities: [...new Set(picked.map((o) => screenedOf(o).modality))],
  };
}
