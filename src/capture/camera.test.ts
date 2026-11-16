import { describe, expect, it } from 'vitest';
import { cameraErrorKind, faceGuide, isBlackFrame, nextCamera, poseHint } from './camera';

const frame = (v: number, n = 16) => new Uint8ClampedArray(Array.from({ length: n * 4 }, (_, i) => (i % 4 === 3 ? 255 : v)));

describe('camera choice', () => {
  it('treats a black frame (disconnected virtual webcam) as dead, a dim room as alive', () => {
    expect(isBlackFrame(frame(0))).toBe(true);
    expect(isBlackFrame(frame(1))).toBe(true);
    expect(isBlackFrame(frame(20))).toBe(false);
  });

  it('moves on to the first camera not tried yet', () => {
    expect(nextCamera(['iriun', 'laptop'], new Set(['iriun']))).toBe('laptop');
    expect(nextCamera(['iriun', 'laptop'], new Set(['iriun', 'laptop']))).toBeNull();
  });

  it('maps getUserMedia errors to an actionable message', () => {
    const err = (name: string) => Object.assign(new Error(name), { name });
    expect(cameraErrorKind(err('NotAllowedError'))).toBe('denied');
    expect(cameraErrorKind(err('NotFoundError'))).toBe('none');
    expect(cameraErrorKind(err('NotReadableError'))).toBe('busy');
    expect(cameraErrorKind(err('NoMediaDevices'))).toBe('insecure');
    expect(cameraErrorKind('x')).toBe('other');
  });
});

describe('pose hint', () => {
  const frontal = { yaw: 0, tolerance: 8 };
  const oblique = { yaw: 45, tolerance: 12 };
  it('asks for the missing turn on an oblique view and allows either direction', () => {
    expect(poseHint(1, { yaw: -1, roll: 0 }, oblique)).toBe('turnMore');
    expect(poseHint(1, { yaw: 44, roll: 0 }, oblique)).toBe('ready');
    expect(poseHint(1, { yaw: -44, roll: 0 }, oblique)).toBe('ready');
    expect(poseHint(1, { yaw: 70, roll: 0 }, oblique)).toBe('turnLess');
  });
  it('frontal: look at the camera, keep level, one face', () => {
    expect(poseHint(1, { yaw: 20, roll: 0 }, frontal)).toBe('faceCamera');
    expect(poseHint(1, { yaw: 2, roll: 15 }, frontal)).toBe('level');
    expect(poseHint(2, { yaw: 0, roll: 0 }, frontal)).toBe('manyFaces');
    expect(poseHint(0, null, frontal)).toBe('noFace');
  });
});

describe('face guide', () => {
  it('keeps a face-shaped oval on a wide and on a tall frame', () => {
    for (const [w, h] of [
      [1920, 1440],
      [1440, 1920],
      [1280, 720],
    ] as const) {
      const g = faceGuide(w, h, true);
      expect(g.rx / g.ry).toBeCloseTo(0.74, 2);
      expect(g.cx - g.rx).toBeGreaterThan(0);
      expect(g.cy + g.ry).toBeLessThan(h);
    }
  });
});
