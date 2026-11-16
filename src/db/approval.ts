import { db, getSettings } from './db';
import type { SignOff } from './types';

/**
 * PRD F9.2: a report (and the client package) needs the doctor's approval of what it shows. The sign-off stores a
 * stamp of the approved content; when the grades, simulation, chosen options, estimates, tariff, intake or the
 * doctor's note change afterwards, the stamp differs and the approval is stale until the doctor signs again.
 *
 * Only Dexie reads and a synchronous hash: safe inside `useLive` (no non-Dexie await ends the tracking).
 */
export async function approvalStamp(caseId: string): Promise<string> {
  const [c, grades, sim, plan, simIds, settings] = await Promise.all([
    db.cases.get(caseId),
    db.grades.where('caseId').equals(caseId).toArray(),
    db.simStates.get(caseId),
    db.plans.get(caseId),
    // Ids only: the image itself stays sealed (images.ts). A new saved simulation gets a new id.
    db.simulations.where('caseId').equals(caseId).primaryKeys(),
    getSettings(),
  ]);
  const content = {
    age: c ? [c.actualAge, c.targetAge] : null,
    intake: c?.intake ?? null,
    grades: grades
      .map((g) => [g.concernId, g.side, g.grade, g.reviewed])
      .sort((a, b) => String(a).localeCompare(String(b))),
    sim: sim ? { ...sim, updatedAt: 0 } : null,
    plan: plan ? { ...plan, updatedAt: 0 } : null,
    simulations: (simIds as string[]).slice().sort(),
    tariff: settings.tariff,
  };
  return hash(canonical(content));
}

export type Approval = 'none' | 'stale' | 'fresh';

export const approvalOf = (signoff: Pick<SignOff, 'stamp'> | null | undefined, stamp: string): Approval =>
  !signoff ? 'none' : signoff.stamp === stamp ? 'fresh' : 'stale';

/** JSON with sorted object keys, so equal content always gives the same text. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v ?? null);
}

/** cyrb53: a fast 53-bit change detector (not a security hash; the stamp only tells whether content changed). */
export function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
