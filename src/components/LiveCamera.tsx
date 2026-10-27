import { Camera, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { detectVideoFrame } from '../analysis/landmarker';
import type { Pose } from '../analysis/types';
import type { ViewDef } from '../capture/views';
import { useBi, useT } from '../i18n';
import { useObjectUrl } from '../lib/hooks';
import { Button, Notice } from './ui';

type Status = { faces: number; pose: Pose | null } | null;

function poseOk(s: Status, view: ViewDef): boolean {
  if (!s || s.faces !== 1 || !s.pose) return false;
  return Math.abs(Math.abs(s.pose.yaw) - view.yaw) <= view.tolerance && Math.abs(s.pose.roll) <= view.tolerance + 2;
}

/**
 * In-app camera with face-oval guide, optional ghost overlay of the previous photo (35 %),
 * and live pose feedback. The shutter is enabled when the pose is within tolerance; views where
 * detection is unreliable (profiles, submental) or a failed detector allow manual capture.
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
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [detectorDown, setDetectorDown] = useState(false);
  const ghostUrl = useObjectUrl(ghost);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let last = 0;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
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
      } catch {
        setError(true);
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [facing]);

  const ok = poseOk(status, view);
  const canShoot = ok || view.manualAllowed || detectorDown;
  const mirror = facing === 'user';

  const shoot = () => {
    const v = video.current;
    if (!v) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onCapture(b), 'image/jpeg', 0.95);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#050505]" role="dialog" aria-modal="true" aria-label={bi(view.label)}>
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" onClick={onClose} aria-label={t.app.close} className="flex h-11 w-11 items-center justify-center rounded-md border border-border">
          <X size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-gold-ink">{bi(view.label)}</div>
          <div className="truncate text-[12px] text-ink-secondary">{bi(view.guide)}</div>
        </div>
        <button
          type="button"
          onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
          aria-label={t.capture.switchCam}
          className="flex h-11 w-11 items-center justify-center rounded-md border border-border"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="p-4">
            <Notice tone="danger">{t.capture.camError}</Notice>
          </div>
        ) : (
          <>
            <video ref={video} playsInline muted className="h-full w-full object-cover" style={{ transform: mirror ? 'scaleX(-1)' : undefined }} />
            {ghostUrl && (
              <img
                src={ghostUrl}
                alt={t.capture.ghost}
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
                style={{ transform: mirror ? 'scaleX(-1)' : undefined }}
              />
            )}
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <ellipse
                cx="50"
                cy="46"
                rx={view.frontal ? 25 : 22}
                ry="29"
                fill="none"
                stroke={ok ? '#7FD6A0' : '#D4AF37'}
                strokeWidth="0.6"
                strokeDasharray={ok ? undefined : '2 1.5'}
              />
            </svg>
            <div className="absolute inset-x-0 bottom-3 flex justify-center">
              <span className={`rounded-full px-3 py-1 text-[12px] ${ok ? 'bg-ok/20 text-ok' : 'bg-bg/80 text-ink-secondary'}`}>
                {status?.pose
                  ? `yaw ${status.pose.yaw.toFixed(0)}° · pitch ${status.pose.pitch.toFixed(0)}° · roll ${status.pose.roll.toFixed(0)}°`
                  : detectorDown
                    ? t.capture.detectorError
                    : t.app.loading}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
        <Button
          variant="gold"
          disabled={!canShoot || error}
          onClick={shoot}
          aria-label={t.capture.shutter}
          className="h-16 w-16 rounded-full !p-0"
        >
          <Camera size={26} />
        </Button>
      </div>
      {!ok && view.manualAllowed && <p className="px-4 pb-3 text-center text-[12px] text-ink-secondary">{t.capture.manual}</p>}
    </div>
  );
}
