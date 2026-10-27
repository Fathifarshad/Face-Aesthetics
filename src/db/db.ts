import Dexie, { type Table } from 'dexie';
import type {
  AuditEntry,
  Case,
  ClinicSettings,
  FindingRow,
  Message,
  Patient,
  Photo,
  PlanRow,
  PtPhoto,
  PtRecord,
  SignOff,
  Simulation,
} from './types';

class AppDB extends Dexie {
  patients!: Table<Patient, string>;
  cases!: Table<Case, string>;
  photos!: Table<Photo, string>;
  findings!: Table<FindingRow, string>;
  plans!: Table<PlanRow, string>;
  simulations!: Table<Simulation, string>;
  signoffs!: Table<SignOff, string>;
  messages!: Table<Message, string>;
  audit!: Table<AuditEntry, number>;
  settings!: Table<{ key: string; value: unknown }, string>;
  ptRecords!: Table<PtRecord, string>;
  ptPhotos!: Table<PtPhoto, string>;

  constructor() {
    super('tanasob');
    this.version(1).stores({
      patients: 'id, &code, displayName, fileNo, createdAt',
      cases: 'id, patientId, createdAt, status',
      photos: 'id, caseId, [caseId+phase], takenAt',
      findings: 'id, caseId',
      plans: 'caseId',
      simulations: 'id, caseId, createdAt',
      signoffs: 'caseId',
      messages: 'id, [owner+patientCode], at',
      audit: '++id, caseId, at',
      settings: 'key',
      ptRecords: 'code',
      ptPhotos: 'id, code, caseId',
    });
  }
}

export const db = new AppDB();

export const uid = (): string => crypto.randomUUID();

export const DEFAULT_SETTINGS: ClinicSettings = {
  doctorName: '',
  doctorTitle: '',
  licence: '',
  clinicName: '',
  clinicAddress: '',
  clinicPhone: '',
  footer: '',
  logo: '',
  accent: '#7A5F12',
  prices: {},
  maxHighRiskPerSession: 1,
  retentionMonths: 24,
  aftercare: {},
};

export async function getSettings(): Promise<ClinicSettings> {
  const row = await db.settings.get('clinic');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<ClinicSettings>) ?? {}) };
}

export const saveSettings = (s: ClinicSettings) => db.settings.put({ key: 'clinic', value: s });

export const audit = (caseId: string, action: string, before?: unknown, after?: unknown) =>
  db.audit.add({ caseId, at: Date.now(), action, before, after });
