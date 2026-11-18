/**
 * Full-resolution still from the camera (R2). Where the browser has `ImageCapture` (Chrome on Android and desktop),
 * the camera's own photo is often larger than the video frame. It is used only when it really is larger and arrives
 * in time; otherwise the sharpest video frame of the hold (already checked: eyes open, still, sharp) is kept.
 */

/** The part of the ImageCapture API we use; it is not in TypeScript's DOM library. */
type PhotoCapabilities = { fillLightMode?: string[] };
type ImageCaptureLike = {
  getPhotoCapabilities(): Promise<PhotoCapabilities>;
  takePhoto(settings?: { fillLightMode?: string }): Promise<Blob>;
};
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

const STILL_TIMEOUT_MS = 2500;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((res) => window.setTimeout(() => res(null), ms))]);
}

/** The camera's photo when it is larger than `minWidth` × `minHeight` pixels; null when not available or not larger. */
export async function takeStill(
  track: MediaStreamTrack | undefined,
  minWidth: number,
  minHeight: number,
): Promise<Blob | null> {
  const Ctor = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
  if (!track || !Ctor || track.readyState !== 'live') return null;
  try {
    const ic = new Ctor(track);
    const caps = await withTimeout(ic.getPhotoCapabilities(), 1000);
    // No flash in the patient's eyes; only ask for it where the camera knows the setting.
    const settings = caps?.fillLightMode?.includes('off') ? { fillLightMode: 'off' } : undefined;
    const blob = await withTimeout(ic.takePhoto(settings), STILL_TIMEOUT_MS);
    if (!blob) return null;
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const larger =
      Math.max(bmp.width, bmp.height) > Math.max(minWidth, minHeight) &&
      Math.min(bmp.width, bmp.height) > Math.min(minWidth, minHeight);
    bmp.close();
    return larger ? blob : null;
  } catch {
    return null;
  }
}
