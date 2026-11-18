import { Camera, RefreshCw, ScanFace, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { detectVideoFrame } from '../analysis/landmarker';
import type { Point } from '../analysis/types';
import type { Framed } from '../capture/align';
import { eyeMotion, eyeOpenness, liveHint, stepHold, type Hold, type LiveHint } from '../capture/autoCapture';
import {
  cameraErrorKind,
  cameraPref,
  faceGuide,
  isBlackFrame,
  nextCamera,
  poseHint,
  rememberCamera,
  rememberedCamera,
  setCameraPref,
  type CameraErrorKind,
} from '../capture/camera';
import { faceStats, toGray } from '../capture/imageStats';
import { takeStill } from '../capture/still';
import type { ViewDef } from '../capture/views';
import { useBi, useT } from '../i18n';
import { useObjectUrl } from '../lib/hooks';
import { playShutterSound, primeShutterSound } from '../lib/shutterSound';
import { svgToken } from '../lib/tokens';
import { Button, Notice } from './ui';

/** Wait this long after the stream starts before judging whether the picture is black. */
const BLACK_CHECK_MS = 1200;
/** Frames are analysed at most this often (detection plus the light and sharpness measurements). */
const ANALYSE_EVERY_MS = 180;
/** Long side of the grey copy used for light and sharpness: the same scale as the after-capture checks. */
const STATS_SIDE = 480;

type Live = { hint: LiveHint; poseReady: boolean; yaw: number | null };

/**
 * In-app camera with face-oval guide, optional ghost overlay of the previous photo (35 %), live checks and
 * automatic capture (R2). Every analysed frame is checked for pose, face size, framing against the "before"
 * photo, light, open eyes, steadiness and sharpness; the hint names the first thing to fix. With «عکس خودکار» on,
 * the photo is taken once every check has held for a moment (the ring around the shutter fills): the camera's
 * full-resolution still when the browser gives a larger one, else the sharpest frame of that moment.
 * The manual shutter works as before (pose within tolerance, or views where detection is unreliable).
 *
 * Camera choice: the last camera that gave a picture on this device, else the browser default. A camera
 * that delivers only black frames (e.g. a disconnected virtual webcam) is skipped automatically.
 */
export function LiveCamera({
  view,
  ghost,
  reference = null,
  onCapture,
  onClose,
}: {
  view: ViewDef;
  ghost?: Blob | null;
  /** The "before" photo of this view, when taking the "after" one: auto capture waits until the framing matches. */
  reference?: Framed | null;
  onCapture: (b: Blob) => void;
  onClose: () => void;
}) {
  const t = useT();
  const bi = useBi();
  const video = useRef<HTMLVideoElement>(null);
  const tried = useRef(new Set<string>());
  const [deviceId, setDeviceId] = useState<string | null>(() => rememberedCamera());
  const [attempt, setAttempt] = useState(0);
  const [devices, setDevices] = useState<string[]>([]);
  const [current, setCurrent] = useState<{ id: string; label: string } | null>(null);
  const [mirror, setMirror] = useState(true);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<CameraErrorKind | null>(null);
  const [black, setBlack] = useState(false);
  const [live, setLive] = useState<Live | null>(null);
  const [progress, setProgress] = useState(0);
  const [flash, setFlash] = useState(false);
  const [detectorDown, setDetectorDown] = useState(false);
  const [auto, setAuto] = useState(() => cameraPref('autoCapture'));
  const [sound, setSound] = useState(() => cameraPref('shutterSound'));
  const ghostUrl = useObjectUrl(ghost);

  // The analysis loop reads these through refs, so a change does not restart the camera.
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const capturing = useRef(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const shootRef = useRef<(best: HTMLCanvasElement | null) => void>(() => {});

  useEffect(() => {
    if (sound) primeShutterSound();
  }, [sound]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let last = 0;
    let timer = 0;
    let stopped = false;
    let prev: Point[] | null = null;
    let peakOpen = 0;
    let hold: Hold = { since: null };
    const best = { canvas: null as HTMLCanvasElement | null, blur: -1 };
    const small = document.createElement('canvas');
    const stop = () => stream?.getTracks().forEach((tr) => tr.stop());
    setError(null);
    setBlack(false);
    setLive(null);
    setProgress(0);

    /** Light, sharpness and size of this frame on a small grey copy (same measurements as `processPhoto`). */
    const measure = (v: HTMLVideoElement, lm: Point[] | null) => {
      const s = Math.min(1, STATS_SIDE / Math.max(v.videoWidth, v.videoHeight));
      small.width = Math.round(v.videoWidth * s);
      small.height = Math.round(v.videoHeight * s);
      const g = small.getContext('2d', { willReadFrequently: true });
      if (!g) return null;
      g.drawImage(v, 0, 0, small.width, small.height);
      const img = g.getImageData(0, 0, small.width, small.height);
      return faceStats(
        toGray(img.data, img.width, img.height),
        lm?.map((p) => ({ x: p.x * s, y: p.y * s })) ?? null,
      );
    };

    /** Keep a full-size copy of the sharpest frame of the current hold. */
    const keepIfSharper = (v: HTMLVideoElement, blur: number) => {
      if (blur <= best.blur) return;
      best.canvas ??= document.createElement('canvas');
      best.canvas.width = v.videoWidth;
      best.canvas.height = v.videoHeight;
      best.canvas.getContext('2d')?.drawImage(v, 0, 0);
      best.blur = blur;
    };

    (async () => {
      try {
        const md = navigator.mediaDevices as MediaDevices | undefined;
        if (!md?.getUserMedia)
          throw Object.assign(new Error('mediaDevices unavailable'), { name: 'NoMediaDevices' });
        const size = { width: { ideal: 1920 }, height: { ideal: 1440 } };
        try {
          stream = await md.getUserMedia({
            video: deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: 'user', ...size },
            audio: false,
          });
        } catch (e) {
          // The remembered camera may be gone (unplugged); fall back to the browser default.
          if (!deviceId || stopped) throw e;
          stream = await md.getUserMedia({ video: { facingMode: 'user', ...size }, audio: false });
        }
        // The effect may have been cleaned up while getUserMedia was pending: release the camera then.
        if (stopped || !video.current) return stop();
        const track = stream.getVideoTracks()[0];
        trackRef.current = track ?? null;
        const settings = track?.getSettings() ?? {};
        const id = settings.deviceId ?? deviceId ?? '';
        tried.current.add(id);
        setCurrent({ id, label: track?.label ?? '' });
        setMirror(settings.facingMode !== 'environment');
        const ids = (await md.enumerateDevices())
          .filter((d) => d.kind === 'videoinput')
          .map((d) => d.deviceId);
        if (stopped) return;
        setDevices(ids);
        video.current.srcObject = stream;
        await video.current.play();
        if (!stopped) setFrame({ w: video.current.videoWidth, h: video.current.videoHeight });

        timer = window.setTimeout(() => {
          const v = video.current;
          if (stopped || !v || !v.videoWidth) return;
          const c = document.createElement('canvas');
          c.width = 32;
          c.height = 24;
          const g = c.getContext('2d', { willReadFrequently: true });
          if (!g) return;
          g.drawImage(v, 0, 0, c.width, c.height);
          if (!isBlackFrame(g.getImageData(0, 0, c.width, c.height).data)) {
            if (id) rememberCamera(id);
            return;
          }
          const next = nextCamera(ids, tried.current);
          if (next) setDeviceId(next);
          else setBlack(true);
        }, BLACK_CHECK_MS);

        const loop = async (ts: number) => {
          if (stopped) return;
          const v = video.current;
          if (ts - last > ANALYSE_EVERY_MS && v && v.readyState >= 2 && !capturing.current) {
            last = ts;
            try {
              const d = await detectVideoFrame(v, ts);
              if (stopped) return;
              const stats = measure(v, d.landmarks);
              const open = d.faces === 1 ? eyeOpenness(d.landmarks) : null;
              if (open !== null) peakOpen = Math.max(peakOpen, open);
              const hint = liveHint(
                {
                  faces: d.faces,
                  pose: d.pose,
                  landmarks: d.landmarks,
                  width: d.width,
                  height: d.height,
                  stats,
                  motion: eyeMotion(prev, d.landmarks),
                  eyes: open === null ? null : { open, peak: peakOpen },
                  reference,
                },
                view,
              );
              prev = d.landmarks;
              setLive({
                hint,
                poseReady: poseHint(d.faces, d.pose, view) === 'ready',
                yaw: d.pose ? d.pose.yaw : null,
              });
              const step = stepHold(hold, autoRef.current && hint === 'ready', ts);
              hold = step.hold;
              setProgress(step.progress);
              if (step.progress === 0) best.blur = -1;
              else keepIfSharper(v, stats?.blur ?? 0);
              if (step.fire) {
                shootRef.current(best.canvas);
                return;
              }
            } catch {
              setDetectorDown(true);
              return;
            }
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch (e) {
        if (!stopped) setError(cameraErrorKind(e));
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      stop();
    };
    // `view` and `reference` stay the same while the camera is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, attempt]);

  /** Manual switch: go to the next camera in the browser's list, and let the black check skip again from there. */
  const switchCamera = () => {
    if (devices.length < 2) return;
    const i = current ? devices.indexOf(current.id) : -1;
    tried.current = new Set();
    setDeviceId(devices[(i + 1) % devices.length]!);
  };

  const retry = () => {
    tried.current = new Set();
    setAttempt((a) => a + 1);
  };

  /**
   * Take the photo. Auto capture passes the sharpest frame of the hold; the manual shutter takes the current frame.
   * Either way the camera's own larger still is preferred when the browser gives one in time.
   */
  const shoot = async (best: HTMLCanvasElement | null = null) => {
    const v = video.current;
    if (!v || !v.videoWidth || capturing.current) return;
    capturing.current = true;
    if (soundRef.current) playShutterSound();
    try {
      navigator.vibrate?.(60);
    } catch {
      /* no vibration on this device */
    }
    setFlash(true);
    let c = best;
    if (!c) {
      c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext('2d')!.drawImage(v, 0, 0);
    }
    const still = await takeStill(trackRef.current ?? undefined, c.width, c.height);
    if (still) return onCapture(still);
    c.toBlob(
      (b) => {
        if (b) onCapture(b);
        else capturing.current = false;
      },
      'image/jpeg',
      0.95,
    );
  };
  shootRef.current = (best) => void shoot(best);

  const toggleAuto = () => {
    setCameraPref('autoCapture', !auto);
    setAuto(!auto);
  };
  const toggleSound = () => {
    setCameraPref('shutterSound', !sound);
    setSound(!sound);
  };

  const hint = live?.hint ?? null;
  const ok = hint === 'ready';
  const poseOk = live?.poseReady ?? false;
  const guide = frame ? faceGuide(frame.w, frame.h, view.frontal) : null;
  const hintText: Record<LiveHint, string> = {
    noFace: t.capture.camNoFace,
    manyFaces: t.capture.camManyFaces,
    faceCamera: t.capture.camFaceCamera,
    turnMore: t.capture.camTurnMore,
    turnLess: t.capture.camTurnLess,
    level: t.capture.camLevel,
    chinLevel: t.capture.camChinLevel,
    closer: t.capture.camCloser,
    farther: t.capture.camFarther,
    frame: t.capture.camFrame,
    moreLight: t.capture.camMoreLight,
    lessLight: t.capture.camLessLight,
    evenLight: t.capture.camEvenLight,
    backlight: t.capture.camBacklight,
    eyesClosed: t.capture.camEyesClosed,
    holdStill: t.capture.camHoldStill,
    blurry: t.capture.camBlurry,
    ready: auto ? t.capture.camReadyAuto : t.capture.camReady,
  };
  const canShoot = poseOk || view.manualAllowed || detectorDown;
  // Ring around the shutter: circumference of r = 30 in a 64 px box.
  const ring = 2 * Math.PI * 30;

  const errorText: Record<CameraErrorKind, string> = {
    denied: t.capture.camDenied,
    none: t.capture.camNone,
    busy: t.capture.camBusy,
    insecure: t.capture.camInsecure,
    other: t.capture.camError,
  };

  const headerBtn = 'flex h-11 w-11 items-center justify-center rounded-md border';
  const switchOn = 'border-primary bg-primary/15 text-primary-on-tint';
  const switchOff = 'border-border text-ink-2';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-photo"
      role="dialog"
      aria-modal="true"
      aria-label={bi(view.label)}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={t.app.close}
          className={`${headerBtn} border-border`}
        >
          <X size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-primary-on-tint">{bi(view.label)}</div>
          <div className="truncate text-[12px] text-ink-2">{current?.label || bi(view.guide)}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={auto}
          aria-label={t.capture.autoCapture}
          title={t.capture.autoCapture}
          onClick={toggleAuto}
          className={`${headerBtn} ${auto ? switchOn : switchOff}`}
        >
          <ScanFace size={19} />
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={sound}
          aria-label={t.capture.shutterSound}
          title={t.capture.shutterSound}
          onClick={toggleSound}
          className={`${headerBtn} ${sound ? switchOn : switchOff}`}
        >
          {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
        </button>
        {devices.length > 1 && (
          <button
            type="button"
            onClick={switchCamera}
            aria-label={t.capture.switchCam}
            className={`${headerBtn} border-border`}
          >
            <RefreshCw size={18} />
          </button>
        )}
      </div>

      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="flex flex-col items-start gap-3 p-4" data-camera-error={error}>
            <Notice tone="danger">{errorText[error]}</Notice>
            <Button onClick={retry}>{t.capture.camRetry}</Button>
          </div>
        ) : (
          <>
            <video
              ref={video}
              playsInline
              muted
              className="h-full w-full object-contain"
              style={{ transform: mirror ? 'scaleX(-1)' : undefined }}
            />
            {ghostUrl && (
              <img
                src={ghostUrl}
                alt={t.capture.ghost}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-35"
                style={{ transform: mirror ? 'scaleX(-1)' : undefined }}
              />
            )}
            {frame && guide && (
              // Same box and scaling as the video (object-contain), so the oval sits on the captured frame in true proportion.
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox={`0 0 ${frame.w} ${frame.h}`}
                preserveAspectRatio="xMidYMid meet"
                aria-hidden
                data-face-guide
              >
                <ellipse
                  cx={guide.cx}
                  cy={guide.cy}
                  rx={guide.rx}
                  ry={guide.ry}
                  fill="none"
                  stroke={svgToken(ok ? 'ok' : 'primary')}
                  strokeWidth={frame.h * 0.006}
                  strokeDasharray={ok ? undefined : `${frame.h * 0.02} ${frame.h * 0.015}`}
                />
              </svg>
            )}
            {flash && (
              <div
                className="pointer-events-none absolute inset-0 bg-ink opacity-0 [animation:camflash_300ms_ease-out]"
                aria-hidden
                data-camera-flash
              />
            )}
            {black && (
              <div className="absolute inset-x-0 top-0 flex flex-col items-start gap-3 p-4" data-camera-black>
                <Notice tone="warn">{t.capture.camBlack}</Notice>
                <Button onClick={retry}>{t.capture.camRetry}</Button>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-3 flex justify-center px-4">
              <span
                className={`rounded-full px-3 py-1.5 text-center text-[14px] font-semibold ${ok ? 'bg-ok/20 text-ok' : 'bg-bg/85 text-ink'}`}
                role="status"
                data-pose-hint={hint ?? ''}
              >
                {detectorDown ? t.capture.detectorError : hint ? hintText[hint] : t.app.loading}
                {live?.yaw != null && (
                  <bdi className="ms-2 text-[11px] font-normal text-ink-2" dir="ltr">
                    {`${Math.abs(live.yaw).toFixed(0)}° / ${view.yaw}°`}
                  </bdi>
                )}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
        <div className="relative h-16 w-16">
          <Button
            variant="primary"
            disabled={!canShoot || !!error}
            onClick={() => void shoot()}
            aria-label={t.capture.shutter}
            className="h-16 w-16 !rounded-full !p-0"
          >
            <Camera size={26} />
          </Button>
          {auto && (
            <svg
              className="pointer-events-none absolute inset-0 -rotate-90"
              viewBox="0 0 64 64"
              aria-hidden
              data-auto-progress={progress.toFixed(2)}
            >
              <circle
                cx="32"
                cy="32"
                r="30"
                fill="none"
                stroke={svgToken('ok')}
                strokeWidth="3"
                strokeDasharray={ring}
                strokeDashoffset={ring * (1 - progress)}
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
      </div>
      {!poseOk && view.manualAllowed && (
        <p className="px-4 pb-3 text-center text-[12px] text-ink-2">{t.capture.manual}</p>
      )}
      {!poseOk && !view.manualAllowed && !error && !detectorDown && (
        <p className="px-4 pb-3 text-center text-[12px] text-ink-2">
          {auto ? t.capture.camAlignAuto : t.capture.camAlign}
        </p>
      )}
    </div>
  );
}
