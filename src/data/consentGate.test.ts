import { describe, expect, it } from 'vitest';
import { activeConsent, canCapture, canShare, exportPurposes, mustMaskEyes, photoUse } from './consentGate';
import type { Consent, PhotoUse } from './types';

type C = Pick<Consent, 'scope' | 'detail' | 'signedAt' | 'revokedAt'>;
const analysis = (at = 1, revokedAt?: number): C => ({ scope: 'analysis', signedAt: at, revokedAt });
const level3 = (use: PhotoUse, maskEyes = false, at = 2, revokedAt?: number): C => ({
  scope: 'beforeAfter',
  detail: { use, maskEyes },
  signedAt: at,
  revokedAt,
});

describe('consent gate (PRD F8.3, F8.4, F8.6)', () => {
  it('no photo leaves without level 3, whatever else is signed', () => {
    const cs = [analysis(), { scope: 'cloudRender', signedAt: 1 } as C];
    for (const p of ['patient', 'internal', 'education', 'public'] as const) expect(canShare(cs, p)).toBe(false);
    expect(exportPurposes(cs)).toEqual([]);
  });

  it('internal covers the patient copy only; education and public need the wider use', () => {
    const cs = [level3('internal')];
    expect(canShare(cs, 'patient')).toBe(true);
    expect(canShare(cs, 'internal')).toBe(true);
    expect(canShare(cs, 'education')).toBe(false);
    expect(canShare(cs, 'public')).toBe(false);
    expect(exportPurposes([level3('education')])).toEqual(['internal', 'education']);
    expect(canShare([level3('public')], 'public')).toBe(true);
  });

  it('revocation stops sharing at once and the latest live consent wins', () => {
    expect(canShare([level3('public', false, 2, 5)], 'patient')).toBe(false);
    expect(photoUse([level3('public', false, 2, 5), level3('internal', true, 6)])).toEqual({ use: 'internal', maskEyes: true });
    expect(activeConsent([level3('internal', false, 2), level3('public', false, 3)], 'beforeAfter')?.detail?.use).toBe('public');
  });

  it('capture needs a live level 1', () => {
    expect(canCapture([])).toBe(false);
    expect(canCapture([analysis(1, 2)])).toBe(false);
    expect(canCapture([analysis(1, 2), analysis(3)])).toBe(true);
  });

  it('eyes are covered when asked, and by default when unknown', () => {
    expect(mustMaskEyes([level3('public', true)])).toBe(true);
    expect(mustMaskEyes([level3('public', false)])).toBe(false);
    expect(mustMaskEyes([])).toBe(true);
  });
});
