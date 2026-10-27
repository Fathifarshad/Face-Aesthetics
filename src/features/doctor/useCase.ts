import { db } from '../../db/db';
import { useLive } from '../../lib/hooks';

/** Live case + patient for case routes. `null` = not found, `undefined` = loading. */
export function useCase(caseId: string) {
  return useLive(async () => {
    const c = await db.cases.get(caseId);
    if (!c) return null;
    const patient = await db.patients.get(c.patientId);
    return patient ? { c, patient } : null;
  }, [caseId]);
}
