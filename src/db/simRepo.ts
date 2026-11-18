import { tierFromGap } from '../plan/engine';
import { sidesOf } from '../data/concerns';
import { targetAgeOf } from '../data/ageNorms';
import { CONCERN_IDS, type AgeTarget, type ConcernId, type Confidence, type FindingSide, type Grade, type Review } from '../data/types';
import { audit, db } from './db';
import type { MdCode, MdKey } from '../data/mdCodes';
import type { EstimateOverride, ToxinBrand } from '../data/estimates';
import type { GradeRow, PlanRow, SimMode, SimSetting, SimStateRow } from './types';

/**
 * Grades (PRD F2) and simulation state (PRD F3) of a case. Plain rows: no image data.
 * Writes are audited like the other case edits.
 */

const gradeId = (caseId: string, concernId: ConcernId, side: FindingSide) => `${caseId}:${concernId}:${side}`;

export const DEFAULT_TARGET: AgeTarget = { kind: 'offset', offset: 0 };

/** Every concern and side of the case, with an empty manual row where nothing was stored yet. */
export async function listGrades(caseId: string): Promise<GradeRow[]> {
  const stored = new Map((await db.grades.where('caseId').equals(caseId).toArray()).map((r) => [r.id, r]));
  return CONCERN_IDS.flatMap((concernId) =>
    sidesOf(concernId).map(
      (side) =>
        stored.get(gradeId(caseId, concernId, side)) ?? {
          id: gradeId(caseId, concernId, side),
          caseId,
          concernId,
          side,
          autoGrade: null,
          confidence: null,
          grade: 0,
          reviewed: 'pending' as Review,
          index: null,
          photoId: null,
          updatedAt: 0,
        },
    ),
  );
}

/**
 * Stores the engine's suggestions. A finding the doctor already reviewed keeps the doctor's grade; only the
 * suggestion beside it is refreshed. Pending findings take the new suggestion.
 */
export async function saveAutoGrades(
  caseId: string,
  photoId: string,
  grades: readonly { concernId: ConcernId; side: FindingSide; index: number; autoGrade: Grade; confidence: Confidence }[],
): Promise<void> {
  await db.transaction('rw', [db.grades, db.audit], async () => {
    const now = Date.now();
    for (const g of grades) {
      const id = gradeId(caseId, g.concernId, g.side);
      const old = await db.grades.get(id);
      const reviewed = old && old.reviewed !== 'pending';
      await db.grades.put({
        id,
        caseId,
        concernId: g.concernId,
        side: g.side,
        autoGrade: g.autoGrade,
        confidence: g.confidence,
        index: g.index,
        photoId,
        grade: reviewed ? old.grade : g.autoGrade,
        reviewed: reviewed ? old.reviewed : 'pending',
        updatedAt: now,
      });
    }
    await audit(caseId, 'grades.auto', undefined, { photoId, count: grades.length });
  });
}

/** The doctor's review of one finding (PRD F2.4). */
export async function reviewGrade(row: GradeRow, patch: { grade?: Grade; reviewed: Review }): Promise<void> {
  const next: GradeRow = { ...row, ...patch, updatedAt: Date.now() };
  await db.transaction('rw', [db.grades, db.audit], async () => {
    await db.grades.put(next);
    await audit(row.caseId, 'grade.review', { id: row.id, grade: row.grade, reviewed: row.reviewed }, { id: row.id, grade: next.grade, reviewed: next.reviewed });
  });
}

export async function getSimState(caseId: string): Promise<SimStateRow> {
  return (await db.simStates.get(caseId)) ?? { caseId, target: DEFAULT_TARGET, overrides: {}, updatedAt: 0 };
}

async function putSimState(caseId: string, patch: (s: SimStateRow) => Partial<SimStateRow>, action: string, detail?: unknown) {
  await db.transaction('rw', [db.simStates, db.audit], async () => {
    const s = await getSimState(caseId);
    await db.simStates.put({ ...s, ...patch(s), updatedAt: Date.now() });
    if (action) await audit(caseId, action, undefined, detail);
  });
}

/**
 * Sets the age target. The v1 case fields (target age and tier) follow, so the v1 plan page, report and client
 * package keep working until they are rebuilt (M6–M11).
 */
export async function setAgeTarget(caseId: string, target: AgeTarget): Promise<void> {
  await putSimState(caseId, () => ({ target }), 'sim.target', target);
  await syncCaseTarget(caseId);
}

/** Real age changed by the doctor: the target age follows. */
export async function setRealAge(caseId: string, age: number): Promise<void> {
  await db.transaction('rw', [db.cases, db.audit], async () => {
    const c = await db.cases.get(caseId);
    if (!c) return;
    await db.cases.update(caseId, { actualAge: age, updatedAt: Date.now() });
    await audit(caseId, 'age.actual', { actualAge: c.actualAge }, { actualAge: age });
  });
  await syncCaseTarget(caseId);
}

async function syncCaseTarget(caseId: string) {
  const c = await db.cases.get(caseId);
  if (!c) return;
  const { target } = await getSimState(caseId);
  const targetAge = targetAgeOf(c.actualAge, target);
  await db.cases.update(caseId, { targetAge, tier: tierFromGap(c.actualAge, targetAge), updatedAt: Date.now() });
}

/** A change the doctor moved by hand: it no longer follows the age-appropriate default. Not audited per move. */
export async function setOverride(caseId: string, concernId: ConcernId, setting: SimSetting): Promise<void> {
  await putSimState(caseId, (s) => ({ overrides: { ...s.overrides, [concernId]: setting } }), '');
}

/** Lip type chosen by the doctor (owner request 2026-11-15). */
export async function setLipType(caseId: string, lipType: 1 | 2 | 3 | 4 | 5): Promise<void> {
  await putSimState(caseId, () => ({ lipType }), 'sim.lipType', { lipType });
}

/** «بازگشت به پیش‌فرض»: every change and every MD Codes family and code follows the default again. */
export async function resetOverrides(caseId: string): Promise<void> {
  await putSimState(caseId, () => ({ overrides: {}, siteOverrides: {}, codeOn: {} }), 'sim.reset');
}

/**
 * Volume mode (docs/TASKS.md M5b). Each mode keeps its own settings: switching back to mode A finds it as it was,
 * and the MD Codes sliders keep the values the doctor gave them.
 */
export async function setSimMode(caseId: string, mode: SimMode): Promise<void> {
  await putSimState(caseId, () => ({ mode }), 'sim.mode', { mode });
}

/** An MD Codes slider (family or code) the doctor moved. Not audited per move, like `setOverride`. */
export async function setSiteOverride(caseId: string, site: MdKey, setting: SimSetting): Promise<void> {
  await putSimState(caseId, (s) => ({ siteOverrides: { ...s.siteOverrides, [site]: setting } }), '');
}

/** MD Codes codes the doctor switched on or off (docs/TASKS.md M5c). */
export async function setCodeOn(caseId: string, codeOn: Partial<Record<MdCode, boolean>>): Promise<void> {
  await putSimState(caseId, (s) => ({ codeOn: { ...s.codeOn, ...codeOn } }), '');
}

/**
 * Treatment option chosen for a concern (PRD F5.1, F5.3): the simulation and the plan page both use it, so the
 * picture always shows the option in the plan. Audited.
 */
export async function setOption(caseId: string, concernId: ConcernId, optionId: string): Promise<void> {
  await putSimState(caseId, (s) => ({ options: { ...s.options, [concernId]: optionId } }), 'sim.option', { concernId, optionId });
}

/** The plan row of a case, created with the case's tier when there is none yet. */
async function putPlan(caseId: string, patch: (p: PlanRow) => Partial<PlanRow>, action: string, detail: unknown) {
  await db.transaction('rw', [db.plans, db.cases, db.audit], async () => {
    const old = await db.plans.get(caseId);
    const c = old ? null : await db.cases.get(caseId);
    const base: PlanRow = old ?? {
      caseId,
      tier: c?.tier ?? tierFromGap(c?.actualAge ?? 0, c?.targetAge ?? 0),
      selections: {},
      updatedAt: 0,
    };
    await db.plans.put({ ...base, ...patch(base), updatedAt: Date.now() });
    await audit(caseId, action, undefined, detail);
  });
}

/** Toxin brand of the plan (PRD §7.1): label numbers are given only for OnabotulinumtoxinA. Audited. */
export const setToxinBrand = (caseId: string, toxinBrand: ToxinBrand) =>
  putPlan(caseId, () => ({ toxinBrand }), 'plan.toxinBrand', { toxinBrand });

/** The doctor's own estimate for an option (PRD F7.5); null goes back to the computed one. Audited. */
export const setEstimateOverride = (caseId: string, optionId: string, value: EstimateOverride | null) =>
  putPlan(
    caseId,
    (p) => {
      const next = { ...p.estOverrides };
      if (value) next[optionId] = value;
      else delete next[optionId];
      return { estOverrides: next };
    },
    'plan.estimate',
    { optionId, value },
  );

/** The doctor's note for the report (PRD F9.1). Audited by length only: the text stays out of the audit log. */
export const setReportNote = (caseId: string, note: string) =>
  putPlan(caseId, () => ({ reportNote: note }), 'plan.reportNote', { length: note.length });
