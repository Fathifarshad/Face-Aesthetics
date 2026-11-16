import { Camera, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { detectVideoFrame } from '../analysis/landmarker';
import type { Pose } from '../analysis/types';
import {
  cameraErrorKind,
  faceGuide,
  isBlackFrame,
  nextCamera,
  poseHint,
  rememberCamera,
  rememberedCamera,
  type CameraErrorKind,
  type PoseHint,
} from '../capture/camera';
import type { ViewDef } from '../capture/views';
import { useBi, useT } from '../i18n';
import { useObjectUrl } from '../lib/hooks';
import { svgToken } from '../lib/tokens';
import { Button, Notice } from './ui';

type Status = { faces: number; pose: Pose | null } | null;

/** Wait this long after the stream starts before judging whether the picture is black. */
const BLACK_CHECK_MS = 1200;


/**
 * In-app camera with face-oval guide, optional ghost overlay of the previous photo (35 %),
 * and live pose feedback. The shutter is enabled when the pose is within tolerance; views where
 * detection is unreliable (profiles, submental) or a failed detector allow manual capture.
 *
 * Camera choice: the last camera that gave a picture on this device, else the browser default. A camera
 * that delivers only black frames (e.g. a disconnected virtual webcam) is skipped automatically.
 */
export function LiveCamera({
  view,
  ghost,
  onCapture,
  onClose,
}: {
  view: ViewDef;
  ghost?: Blob | null;
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
  const [status, setStatus] = useState<Status>(null);
  const [detectorDown, setDetectorDown] = useState(false);
  const ghostUrl = useObjectUrl(ghost);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let last = 0;
    let timer = 0;
    let stopped = false;
    const stop = () => stream?.getTracks().forEach((tr) => tr.stop());
    setError(null);
    setBlack(false);
    setStatus(null);
    (async () => {
      try {
        const md = navigator.mediaDevices as MediaDevices | undefined;
        if (!md?.getUserMedia) throw Object.assign(new Error('mediaDevices unavailable'), { name: 'NoMediaDevices' });
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
        const settings = track?.getSettings() ?? {};
        const id = settings.deviceId ?? deviceId ?? '';
        tried.current.add(id);
        setCurrent({ id, label: track?.label ?? '' });
        setMirror(settings.facingMode !== 'environment');
        const ids = (await md.enumerateDevices()).filter((d) => d.kind === 'videoinput').map((d) => d.deviceId);
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
          if (ts - last > 180 && video.current && video.current.readyState >= 2) {
            last = ts;
            try {
              const d = await detectVideoFrame(video.current, ts);
              setStatus({ faces: d.faces, pose: d.pose });
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

  const hint: PoseHint | null = status ? poseHint(status.faces, status.pose, view) : null;
  const ok = hint === 'ready';
  const guide = frame ? faceGuide(frame.w, frame.h, view.frontal) : null;
  const hintText: Record<PoseHint, string> = {
    noFace: t.capture.camNoFace,
    manyFaces: t.capture.camManyFaces,
    faceCamera: t.capture.camFaceCamera,
    turnMore: t.capture.camTurnMore,
    turnLess: t.capture.camTurnLess,
    level: t.capture.camLevel,
    ready: t.capture.camReady,
  };
  const canShoot = ok || view.manualAllowed || detectorDown;

  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onCapture(b), 'image/jpeg', 0.95);
  };

  const errorText: Record<CameraErrorKind, string> = {
    denied: t.capture.camDenied,
    none: t.capture.camNone,
    busy: t.capture.camBusy,
    insecure: t.capture.camInsecure,
    other: t.capture.camError,
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-photo" role="dialog" aria-modal="true" aria-label={bi(view.label)}>
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" onClick={onClose} aria-label={t.app.close} className="flex h-11 w-11 items-center justify-center rounded-md border border-border">
          <X size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-primary-on-tint">{bi(view.label)}</div>
          <div className="truncate text-[12px] text-ink-2">{current?.label || bi(view.guide)}</div>
        </div>
        {devices.length > 1 && (
          <button
            type="button"
            onClick={switchCamera}
            aria-label={t.capture.switchCam}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-border"
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
            <video ref={video} playsInline muted className="h-full w-full object-contain" style={{ transform: mirror ? 'scaleX(-1)' : undefined }} />
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
            {black && (
              <div className="absolute inset-x-0 top-0 flex flex-col items-start gap-3 p-4" data-camera-black>
                <Notice tone="warn">{t.capture.camBlack}</Notice>
                <Button onClick={retry}>{t.capture.camRetry}</Button>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-3 flex justify-center">
              <span className={`rounded-full px-3 py-1.5 text-[14px] font-semibold ${ok ? 'bg-ok/20 text-ok' : 'bg-bg/85 text-ink'}`} role="status" data-pose-hint={hint ?? ''}>
                {detectorDown ? t.capture.detectorError : hint ? hintText[hint] : t.app.loading}
                {status?.pose && (
                  <bdi className="ms-2 text-[11px] font-normal text-ink-2" dir="ltr">
                    {`${Math.abs(status.pose.yaw).toFixed(0)}° / ${view.yaw}°`}
                  </bdi>
                )}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
        <Button
          variant="primary"
          disabled={!canShoot || !!error}
          onClick={shoot}
          aria-label={t.capture.shutter}
          className="h-16 w-16 rounded-full !p-0"
        >
          <Camera size={26} />
        </Button>
      </div>
      {!ok && view.manualAllowed && <p className="px-4 pb-3 text-center text-[12px] text-ink-2">{t.capture.manual}</p>}
      {!ok && !view.manualAllowed && !error && !detectorDown && (
        <p className="px-4 pb-3 text-center text-[12px] text-ink-2">{t.capture.camAlign}</p>
      )}
    </div>
  );
}
