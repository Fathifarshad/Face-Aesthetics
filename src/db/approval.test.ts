import { describe, expect, it } from 'vitest';
import { approvalOf, canonical, hash } from './approval';

describe('approval stamp (PRD F9.2)', () => {
  it('canonical text ignores key order and undefined fields', () => {
    expect(canonical({ b: 1, a: [1, { y: 2, x: 1 }], c: undefined })).toBe(canonical({ a: [1, { x: 1, y: 2 }], b: 1 }));
  });

  it('any change of content gives a different stamp', () => {
    const base = { grades: [['lip-volume', 'both', 2, 'confirmed']], plan: { reportNote: 'یادداشت' } };
    const same = hash(canonical(base));
    expect(hash(canonical(structuredClone(base)))).toBe(same);
    expect(hash(canonical({ ...base, grades: [['lip-volume', 'both', 3, 'confirmed']] }))).not.toBe(same);
    expect(hash(canonical({ ...base, plan: { reportNote: 'یادداشت.' } }))).not.toBe(same);
  });

  it('no sign-off = none; a v1 sign-off without stamp or a changed stamp = stale; same stamp = fresh', () => {
    expect(approvalOf(null, 'a')).toBe('none');
    expect(approvalOf({}, 'a')).toBe('stale');
    expect(approvalOf({ stamp: 'b' }, 'a')).toBe('stale');
    expect(approvalOf({ stamp: 'a' }, 'a')).toBe('fresh');
  });
});
