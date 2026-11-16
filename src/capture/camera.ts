/**
 * Camera choice for the in-app camera. Pure helpers (no React) so they can be unit-tested.
 *
 * Why: a virtual camera (for example a phone-as-webcam driver whose phone is not connected) can be the
 * browser's default device and deliver only black frames. The app then looks as if the camera never
 * started. We check the first frames and move on to the next camera when the picture is black.
 */

export type CameraErrorKind = 'denied' | 'none' | 'busy' | 'insecure' | 'other';

const STORE_KEY = 'neva.cameraId';

/** Mean brightness 0–255 of RGBA pixel data. */
export function meanBrightness(rgba: Uint8ClampedArray): number {
  let sum = 0;
  const n = rgba.length / 4;
  if (n === 0) return 0;
  for (let i = 0; i < rgba.length; i += 4) sum += rgba[i]! + rgba[i + 1]! + rgba[i + 2]!;
  return sum / n / 3;
}

/** A frame this dark (and this flat) is a dead or disconnected camera, not a dim room. */
export function isBlackFrame(rgba: Uint8ClampedArray): boolean {
  return meanBrightness(rgba) < 4;
}

/** The next camera to try: the first one not tried yet, in the browser's order. */
export function nextCamera(deviceIds: readonly string[], tried: ReadonlySet<string>): string | null {
  return deviceIds.find((id) => !tried.has(id)) ?? null;
}

/** Map a getUserMedia failure to a message the doctor can act on. */
export function cameraErrorKind(err: unknown): CameraErrorKind {
  const name = err instanceof Error || (typeof err === 'object' && err !== null && 'name' in err) ? String((err as { name: unknown }).name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'none';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  if (name === 'NoMediaDevices') return 'insecure';
  return 'other';
}

/** Last camera that gave a picture on this device (a convenience only; storage may be unavailable). */
export function rememberedCamera(): string | null {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

export function rememberCamera(deviceId: string): void {
  try {
    localStorage.setItem(STORE_KEY, deviceId);
  } catch {
    /* storage blocked: the default camera is used next time */
  }
}

export type PoseHint = 'noFace' | 'manyFaces' | 'faceCamera' | 'turnMore' | 'turnLess' | 'level' | 'ready';

/**
 * What to tell the patient so the shutter turns on. Only the size of the turn is checked: the sign of the
 * yaw is not verified yet (see `ViewDef.yaw`), so the hint says "more" or "less", never left or right.
 */
export function poseHint(
  faces: number,
  pose: { yaw: number; roll: number } | null,
  view: { yaw: number; tolerance: number },
): PoseHint {
  if (faces === 0 || !pose) return 'noFace';
  if (faces > 1) return 'manyFaces';
  const turn = Math.abs(pose.yaw);
  if (turn < view.yaw - view.tolerance) return 'turnMore';
  if (turn > view.yaw + view.tolerance) return view.yaw === 0 ? 'faceCamera' : 'turnLess';
  if (Math.abs(pose.roll) > view.tolerance + 2) return 'level';
  return 'ready';
}

/** Face guide in video pixels: the oval a face should fill, hairline to chin (about two thirds of the frame height). */
export function faceGuide(width: number, height: number, frontal: boolean): { cx: number; cy: number; rx: number; ry: number } {
  const ry = Math.min(height * 0.32, (width * 0.45) / (frontal ? 0.74 : 0.8));
  return { cx: width / 2, cy: height * 0.47, rx: ry * (frontal ? 0.74 : 0.8), ry };
}
