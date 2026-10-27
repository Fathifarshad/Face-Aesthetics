import { useEffect, useRef } from 'react';
import { fitVerticalLine } from '../analysis/geometry';
import { LM, MIDLINE_POINTS } from '../analysis/landmarks';
import type { Point } from '../analysis/types';
import { infraorbitalPoints, vesselPaths, zonesFromLandmarks, type Zone, type ZoneId } from '../analysis/zones';
import { useObjectUrl } from '../lib/hooks';

export type Overlay = {
  landmarks?: 'named' | 'all' | false;
  guides?: boolean;
  midline?: boolean;
  /** Zone id → severity 1–4. */
  heat?: Partial<Record<ZoneId, number>>;
  zones?: boolean;
  vessels?: boolean;
  zoneLabel?: (z: Zone) => string;
};

const NAMED = Object.values(LM).flatMap((v) => (Array.isArray(v) ? v : [v])) as number[];

export function FaceCanvas({
  blob,
  landmarks,
  overlay,
  className = '',
  alt,
}: {
  blob: Blob;
  landmarks: Point[] | null;
  overlay: Overlay;
  className?: string;
  alt: string;
}) {
  const url = useObjectUrl(blob);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      const c = canvas.current;
      if (!c) return;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      if (landmarks) draw(ctx, landmarks, overlay, c.width);
    };
    img.src = url;
  }, [url, landmarks, overlay]);

  return <canvas ref={canvas} role="img" aria-label={alt} className={`h-auto w-full rounded-xl ${className}`} />;
}

function draw(ctx: CanvasRenderingContext2D, lm: Point[], o: Overlay, width: number) {
  const u = width / 600;
  const GOLD = '#D4AF37';
  const PRIORITY = '#F08A4B';

  if (o.heat) {
    for (const z of zonesFromLandmarks(lm)) {
      const sev = o.heat[z.id];
      if (!sev) continue;
      ctx.fillStyle = sev >= 3 ? PRIORITY : GOLD;
      ctx.globalAlpha = sev >= 3 ? 0.38 : 0.26;
      ctx.beginPath();
      ctx.ellipse(z.center.x, z.center.y, z.rx, z.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (o.zones) {
    ctx.lineWidth = 1.5 * u;
    ctx.font = `${11 * u}px Vazirmatn, Tahoma, sans-serif`;
    ctx.textAlign = 'center';
    for (const z of zonesFromLandmarks(lm)) {
      ctx.strokeStyle = GOLD;
      ctx.fillStyle = 'rgba(212,175,55,0.12)';
      ctx.beginPath();
      ctx.ellipse(z.center.x, z.center.y, z.rx, z.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (o.zoneLabel && z.side !== 'L') {
        const label = o.zoneLabel(z);
        ctx.fillStyle = 'rgba(10,10,11,.75)';
        const w = ctx.measureText(label).width + 8 * u;
        ctx.fillRect(z.center.x - w / 2, z.center.y - 8 * u, w, 16 * u);
        ctx.fillStyle = '#F1D98A';
        ctx.fillText(label, z.center.x, z.center.y + 4 * u);
      }
    }
  }

  if (o.vessels) {
    ctx.strokeStyle = '#F0524F';
    ctx.lineWidth = 2 * u;
    ctx.setLineDash([6 * u, 5 * u]);
    for (const p of vesselPaths(lm)) {
      ctx.beginPath();
      p.points.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = '#F0524F';
    for (const pt of infraorbitalPoints(lm)) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (o.guides || o.midline) {
    ctx.setLineDash([5 * u, 5 * u]);
    ctx.lineWidth = 1.2 * u;
    ctx.strokeStyle = 'rgba(241,217,138,.8)';
    const H = ctx.canvas.height;
    const W = ctx.canvas.width;
    if (o.guides) {
      for (const i of [LM.glabella, LM.subnasale, LM.menton]) {
        ctx.beginPath();
        ctx.moveTo(0, lm[i]!.y);
        ctx.lineTo(W, lm[i]!.y);
        ctx.stroke();
      }
      for (const i of [LM.zygionR, LM.exocanthionR, LM.endocanthionR, LM.endocanthionL, LM.exocanthionL, LM.zygionL]) {
        ctx.beginPath();
        ctx.moveTo(lm[i]!.x, lm[LM.glabella]!.y);
        ctx.lineTo(lm[i]!.x, lm[LM.subnasale]!.y);
        ctx.stroke();
      }
    }
    if (o.midline) {
      const line = fitVerticalLine(MIDLINE_POINTS.map((i) => lm[i]!));
      ctx.strokeStyle = GOLD;
      ctx.beginPath();
      ctx.moveTo(line.intercept, 0);
      ctx.lineTo(line.slope * H + line.intercept, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  if (o.landmarks) {
    const ids = o.landmarks === 'all' ? lm.map((_, i) => i) : NAMED;
    for (const i of ids) {
      const p = lm[i];
      if (!p) continue;
      const named = o.landmarks === 'all' ? NAMED.includes(i) : true;
      ctx.fillStyle = named ? GOLD : 'rgba(127,214,211,.7)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, (named ? 2.6 : 1.4) * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
