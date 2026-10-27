import { radToDeg } from './geometry';
import type { Pose } from './types';

/**
 * Head pose from MediaPipe's 4×4 facial transformation matrix (column-major `data`).
 * Decomposition R = Rz(roll) · Ry(yaw) · Rx(pitch):
 *   yaw   = asin(−r20)
 *   pitch = atan2(r21, r22)
 *   roll  = atan2(r10, r00)
 * Sign convention (to be confirmed visually in the Landmark Inspector, M1):
 * positive yaw = face turned toward the image's left; positive pitch = chin down; positive roll = clockwise.
 */
export function poseFromMatrix(data: ArrayLike<number>): Pose {
  const r00 = data[0]!;
  const r10 = data[1]!;
  const r20 = data[2]!;
  const r21 = data[6]!;
  const r22 = data[10]!;
  return {
    yaw: radToDeg(Math.asin(Math.max(-1, Math.min(1, -r20)))),
    pitch: radToDeg(Math.atan2(r21, r22)),
    roll: radToDeg(Math.atan2(r10, r00)),
  };
}

/** Build a column-major 4×4 rotation matrix from Euler angles (degrees); used by tests and fixtures. */
export function matrixFromPose({ yaw, pitch, roll }: Pose): number[] {
  const [y, p, r] = [yaw, pitch, roll].map((d) => (d * Math.PI) / 180) as [number, number, number];
  const cy = Math.cos(y),
    sy = Math.sin(y),
    cp = Math.cos(p),
    sp = Math.sin(p),
    cr = Math.cos(r),
    sr = Math.sin(r);
  // R = Rz · Ry · Rx (row-major entries)
  const R = [
    [cr * cy, cr * sy * sp - sr * cp, cr * sy * cp + sr * sp],
    [sr * cy, sr * sy * sp + cr * cp, sr * sy * cp - cr * sp],
    [-sy, cy * sp, cy * cp],
  ];
  const m = new Array<number>(16).fill(0);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) m[col * 4 + row] = R[row]![col]!;
  m[15] = 1;
  return m;
}
