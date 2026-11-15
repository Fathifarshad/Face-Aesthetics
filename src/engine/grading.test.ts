import { describe, expect, it } from 'vitest';
import { AUTO_GRADED } from '../data/concerns';
import { buildFrame, toPx } from './faceFrame';
import { FIXTURE, syntheticMesh, syntheticPicture } from './fixtures';
import { grade, measure, photoProblems } from './grading';
import { prepare } from './pipeline';

const SKIN = [205, 160, 135] as const;
const mesh = syntheticMesh();
const frame = buildFrame(mesh);

/**
 * Synthetic face with faint noise on the skin (so the cheeks have some texture to compare with) and a dark line
 * along the subject's right nasolabial fold only, `depth` levels darker than the skin.
 */
function picture(depth: number) {
  const pic = syntheticPicture(-1.0);
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 6;
  for (let i = 0; i < pic.data.length; i += 4) {
    if (pic.data[i] !== SKIN[0]) continue;
    const n = noise();
    for (let c = 0; c < 3; c++) pic.data[i + c] = SKIN[c]! + n;
  }
  if (depth > 0)
    for (let t = 0.15; t <= 0.85; t += 0.01) {
      const p = toPx(frame, { x: -(0.27 + 0.17 * t), y: 0.47 + 0.39 * t });
      for (let y = Math.round(p.y - 3); y <= p.y + 3; y++)
        for (let x = Math.round(p.x - 3); x <= p.x + 3; x++) {
          const i = (y * FIXTURE.width + x) * 4;
          for (let c = 0; c < 3; c++) pic.data[i + c] = SKIN[c]! - depth;
        }
    }
  return pic;
}

const indexOf = (depth: number, side: 'R' | 'L') => {
  const m = measure(prepare({ ...picture(depth), landmarks: mesh }));
  return m.find((x) => x.concernId === 'nasolabial-fold' && x.side === side)!.index;
};

describe('automatic grading (PRD F2.3)', () => {
  const prepared = prepare({ ...picture(40), landmarks: mesh });
  const measured = measure(prepared);

  it('measures every auto-graded concern, both sides of the bilateral ones, and nothing else', () => {
    for (const m of measured) expect(AUTO_GRADED.has(m.concernId), m.concernId).toBe(true);
    expect(new Set(measured.map((m) => m.concernId))).toEqual(new Set(AUTO_GRADED));
    expect(measured.filter((m) => m.concernId === 'crows-feet').map((m) => m.side).sort()).toEqual(['L', 'R']);
    expect(measured.find((m) => m.concernId === 'neck')!.side).toBe('both');
  });

  it('a darker fold gives a higher index; the untouched side stays low', () => {
    const shallow = indexOf(15, 'R');
    const deep = indexOf(40, 'R');
    expect(indexOf(0, 'R')).toBeLessThan(shallow);
    expect(shallow).toBeLessThan(deep);
    expect(indexOf(40, 'L')).toBeLessThan(shallow);
  });

  it('turns the index into a higher grade on the side with the fold', () => {
    const g = grade(measured, photoProblems(prepared, { yaw: 0, pitch: 0, roll: 0 }));
    const r = g.find((x) => x.concernId === 'nasolabial-fold' && x.side === 'R')!;
    const l = g.find((x) => x.concernId === 'nasolabial-fold' && x.side === 'L')!;
    expect(r.autoGrade).toBeGreaterThan(l.autoGrade);
    expect(r.confidence).toBe('low'); // capped by maxConfidence until calibrated
  });

  it('a turned head or a badly exposed photo lowers every confidence to low', () => {
    expect(photoProblems(prepared, { yaw: 20, pitch: 0, roll: 0 })).toContain('pose');
    const g = grade(measured, ['pose']);
    expect(g.every((x) => x.confidence === 'low')).toBe(true);
    expect(photoProblems({ ...prepared, cheekLuma: 30 }, null)).toContain('exposure');
  });
});
