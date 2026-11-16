import Dexie, { type Table } from 'dexie';
import { REPORT_ACCENT_FALLBACK } from '../lib/color';
import { DEFAULT_TARIFF } from '../data/estimates';
import type {
  AuditEntry,
  Case,
  ClinicSettings,
  ConsentRow,
  FindingRow,
  GradeRow,
  Message,
  Patient,
  PhotoRow,
  PlanRow,
  PtPhoto,
  PtRecord,
  SignOffRow,
  SimStateRow,
  SimulationRow,
} from './types';

class AppDB extends Dexie {
  patients!: Table<Patient, string>;
  cases!: Table<Case, string>;
  photos!: Table<PhotoRow, string>;
  findings!: Table<FindingRow, string>;
  plans!: Table<PlanRow, string>;
  simulations!: Table<SimulationRow, string>;
  signoffs!: Table<SignOffRow, string>;
  messages!: Table<Message, string>;
  audit!: Table<AuditEntry, number>;
  settings!: Table<{ key: string; value: unknown }, string>;
  ptRecords!: Table<PtRecord, string>;
  ptPhotos!: Table<PtPhoto, string>;
  grades!: Table<GradeRow, string>;
  simStates!: Table<SimStateRow, string>;
  consents!: Table<ConsentRow, string>;

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
    // M5: grading per concern and side, and the simulation state per case (PRD F2, F3).
    this.version(2).stores({
      grades: 'id, caseId',
      simStates: 'caseId',
    });
    // M8: the three consent levels of PRD F8.3, per patient, with revocation.
    this.version(3).stores({
      consents: 'id, patientId',
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
  accent: REPORT_ACCENT_FALLBACK,
  prices: {},
  tariff: DEFAULT_TARIFF,
  maxHighRiskPerSession: 1,
  retentionMonths: 24,
  aftercare: {},
  cloudRender: false,
};

export async function getSettings(): Promise<ClinicSettings> {
  const row = await db.settings.get('clinic');
  const stored = (row?.value as Partial<ClinicSettings>) ?? {};
  // Settings saved before M7 have no tariff; a partial one gets the defaults it lacks.
  return { ...DEFAULT_SETTINGS, ...stored, tariff: { ...DEFAULT_TARIFF, ...stored.tariff } };
}

export const saveSettings = (s: ClinicSettings) => db.settings.put({ key: 'clinic', value: s });

export const audit = (caseId: string, action: string, before?: unknown, after?: unknown) =>
  db.audit.add({ caseId, at: Date.now(), action, before, after });
