import type { Consent } from '../../data/types';
import { listConsents } from '../../db/images';
import { useLive } from '../../lib/hooks';

/** Live consents of a patient (signatures decrypted); undefined while loading. */
export function useConsents(patientId: string | undefined): Consent[] | undefined {
  return useLive(async () => (patientId ? listConsents(patientId) : []), [patientId]);
}
