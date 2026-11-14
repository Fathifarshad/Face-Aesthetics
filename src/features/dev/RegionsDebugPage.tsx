import { Download, ImageUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { detectImage } from '../../analysis/landmarker';
import type { Pose } from '../../analysis/types';
import { Button, Chip, Header, Notice } from '../../components/ui';
import { CONCERN_IDS, type ConcernId } from '../../data/types';
import { rollDeg, toPx } from '../../engine/faceFrame';
import { detectHairline } from '../../engine/hairline';
import { ANCHOR, L_NASOLABIAL, L_NOSTRIL, R_NASOLABIAL, R_NOSTRIL } from '../../engine/landmarks';
import { buildRegions, outlinePx, type Region, type RegionSet } from '../../engine/regions';
import { centroid } from '../../engine/shapes';
import type { Pt } from '../../engine/types';
import { useNum, useT } from '../../i18n';
import { cssToken, type Token } from '../../lib/tokens';

/** Working size of the image engine (docs/PRD.md F1.4). */
const MAX_SIDE = 1280;
/** PRD F1.3: a frontal photo may be turned by less than this many degrees. */
const MAX_TURN_DEG = 8;
/** A tilted head (roll) is compensated by the face frame, so only a strong tilt is flagged. */
const MAX_ROLL_DEG = 15;
/** Overlay colour (1–8, equal lightness) per concern in PRD table order, chosen so neighbouring regions differ. */
const REGION_COLOUR = [6, 3, 8, 2, 5, 7, 1, 3, 8, 4, 6, 2, 4, 1, 7, 5] as const;
/** Mesh points used beyond the named anchors, drawn with their index so they can be checked. */
const MESH_SETS = { nasolabialR: R_NASOLABIAL, nasolabialL: L_NASOLABIAL, nostrilR: R_NOSTRIL, nostrilL: L_NOSTRIL } as const;

type Loaded = { image: HTMLCanvasElement; landmarks: Pt[] | null; hairline: Pt[] | null; pose: Pose | null; faces: number; name: string };
type Layers = { regions: boolean; protect: boolean; anchors: boolean; axes: boolean };

const colourOf = (id: ConcernId): Token => `region-${REGION_COLOUR[CONCERN_IDS.indexOf(id)] ?? 1}`;

/**
 * M1 debug layer: every engine region drawn over a photo with its number, plus the anchor indices and the
 * face frame, so region placement can be confirmed by eye before the image engine uses it.
 * The region list sits beside the photo (below it on a phone, with the photo pinned) so regions can be
 * switched while looking at them.
 */
export function RegionsDebugPage() {
  const t = useT();
  const num = useNum();
  const input = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layers>({ regions: true, protect: false, anchors: false, axes: false });
  const [hidden, setHidden] = useState<ReadonlySet<ConcernId>>(new Set(['skin-quality']));
  const [zoom, setZoom] = useState(true);
  const [useHairline, setUseHairline] = useState(true);

  const set = useMemo<RegionSet | null>(() => {
    if (!loaded?.landmarks) return null;
    try {
      return buildRegions(loaded.landmarks, {
        size: { width: loaded.image.width, height: loaded.image.height },
        hairline: useHairline ? loaded.hairline : null,
      });
    } catch (e) {
      console.error('region placement failed', e);
      return null;
    }
  }, [loaded, useHairline]);

  const load = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const image = document.createElement('canvas');
      image.width = Math.round(bmp.width * scale);
      image.height = Math.round(bmp.height * scale);
      const ctx = image.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0, image.width, image.height);
      bmp.close();
      const d = await detectImage(image);
      const hairline = d.landmarks ? detectHairline(ctx.getImageData(0, 0, image.width, image.height), d.landmarks) : null;
      setLoaded({ image, landmarks: d.landmarks, hairline, pose: d.pose, faces: d.faces, name: file.name });
    } catch (e) {
      console.error('photo could not be analysed', e);
      setError(t.regions.loadError);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c || !loaded) return;
    // With zoom on, the canvas shows only the box around the face, so a small face in a wide photo can be judged.
    const [x, y, w, h] = zoom && set ? faceBox(set, loaded.image.width, loaded.image.height) : [0, 0, loaded.image.width, loaded.image.height];
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.translate(-x, -y);
    ctx.drawImage(loaded.image, 0, 0);
    if (set && loaded.landmarks) draw(ctx, set, loaded.landmarks, layers, hidden);
    c.dataset.ready = 'true';
    c.dataset.regions = String(set?.regions.length ?? 0);
    c.dataset.hairline = String(set?.hairlineMeasured ?? false);
    c.dataset.pose = loaded.pose ? [loaded.pose.yaw, loaded.pose.pitch, loaded.pose.roll].map((v) => v.toFixed(1)).join(',') : '';
  }, [loaded, set, layers, hidden, zoom]);

  const save = () =>
    canvas.current?.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `regions-${(loaded?.name ?? 'photo').replace(/\.[^.]+$/, '')}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');

  const toggle = (id: ConcernId) =>
    setHidden((h) => {
      const next = new Set(h);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const pose = loaded?.pose;
  const turned = pose ? Math.max(Math.abs(pose.yaw), Math.abs(pose.pitch)) : 0;
  const roll = set ? Math.abs(rollDeg(set.frame)) : 0;

  return (
    <>
      <Header title={t.regions.title} back />
      <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4">
        <p className="mb-3 text-control text-ink-2">{t.regions.hint}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => input.current?.click()} disabled={busy}>
            <ImageUp size={18} aria-hidden />
            {busy ? t.app.loading : t.regions.load}
          </Button>
          {loaded && (
            <Button onClick={save}>
              <Download size={18} aria-hidden />
              {t.regions.save}
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          aria-label={t.regions.load}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void load(f);
            e.target.value = '';
          }}
        />

        <div className="flex flex-col gap-2">
          {error && <Notice tone="danger">{error}</Notice>}
          {loaded && loaded.faces !== 1 && <Notice tone="danger">{loaded.faces === 0 ? t.regions.noFace : t.regions.manyFaces}</Notice>}
          {loaded && set && turned >= MAX_TURN_DEG && <Notice tone="warn">{t.regions.notFrontal(num(turned), num(MAX_TURN_DEG))}</Notice>}
          {loaded && set && turned < MAX_TURN_DEG && roll >= MAX_ROLL_DEG && (
            <Notice tone="warn">{t.regions.notFrontal(num(roll), num(MAX_ROLL_DEG))}</Notice>
          )}
        </div>

        {loaded && (
          <div className="mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5">
            {/* Photo: pinned under the header on a phone, so the list below can be used without losing sight of it. */}
            <div className="sticky top-[69px] z-10 -mx-4 bg-bg px-4 pb-2 lg:top-[85px] lg:mx-0 lg:px-0">
              <div className="flex justify-center overflow-hidden rounded-photo bg-photo">
                <canvas
                  ref={canvas}
                  role="img"
                  aria-label={t.regions.canvasAlt}
                  className="block h-auto max-h-[46vh] w-auto max-w-full lg:max-h-[calc(100vh-110px)]"
                />
              </div>
            </div>

            <aside className="lg:sticky lg:top-[85px] lg:max-h-[calc(100vh-101px)] lg:overflow-y-auto lg:pe-1">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(layers) as (keyof Layers)[]).map((k) => (
                  <Chip key={k} active={layers[k]} onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))} className="!px-3">
                    {t.regions.layers[k]}
                  </Chip>
                ))}
                <Chip active={zoom} onClick={() => setZoom((z) => !z)} className="!px-3">
                  {t.regions.zoom}
                </Chip>
                <Chip active={useHairline} onClick={() => setUseHairline((v) => !v)} className="!px-3">
                  {t.regions.toHairline}
                </Chip>
              </div>

              {set && (
                <>
                  {useHairline && !set.hairlineMeasured && <p className="mt-2 text-caption text-risk-fg">{t.regions.hairlineMissing}</p>}
                  <div className="mb-1 mt-4 flex items-center justify-between gap-2">
                    <h2 className="text-section font-semibold text-primary-on-tint">{t.regions.legend}</h2>
                    <button
                      type="button"
                      className="min-h-touch shrink-0 px-2 text-control text-primary-on-tint underline"
                      onClick={() => setHidden(new Set(hidden.size ? [] : CONCERN_IDS))}
                    >
                      {hidden.size ? t.regions.showAll : t.regions.hideAll}
                    </button>
                  </div>
                  <ul className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
                    {CONCERN_IDS.map((id, i) => {
                      const absent = set.missing.includes(id);
                      const on = !absent && !hidden.has(id);
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            disabled={absent}
                            aria-pressed={on}
                            onClick={() => toggle(id)}
                            className={`flex min-h-touch w-full items-center gap-2 rounded-md border px-2.5 text-start text-control disabled:opacity-50 ${
                              on ? 'border-border bg-surface' : 'border-border/50 text-muted'
                            }`}
                          >
                            <bdi
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill border-2 text-label font-semibold"
                              style={{ borderColor: `rgb(var(--${colourOf(id)}))`, backgroundColor: on ? `rgb(var(--${colourOf(id)}) / 0.22)` : undefined }}
                            >
                              {i + 1}
                            </bdi>
                            <span className="min-w-0 flex-1 leading-tight">{t.concerns[id]}</span>
                            {absent && <span className="text-caption text-risk-fg">{t.regions.notInPhoto}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  <p className="mt-4 text-caption text-muted">
                    {t.regions.frame}: <bdi>{num(set.frame.unit, 0)} px</bdi> · {t.regions.faceHeight}: <bdi>{num(set.faceHeight, 2)}</bdi>
                  </p>
                  {pose && (
                    <p className="text-caption text-muted" dir="ltr">
                      yaw {num(pose.yaw, 1)}° · pitch {num(pose.pitch, 1)}° · roll {num(rollDeg(set.frame), 1)}°
                    </p>
                  )}

                  <h2 className="mb-1 mt-4 text-section font-semibold text-primary-on-tint">{t.regions.anchorsTitle}</h2>
                  <p className="mb-2 text-caption text-muted">{t.regions.anchorsHint}</p>
                  <table className="w-full text-caption" dir="ltr">
                    <tbody>
                      {Object.entries(ANCHOR).map(([name, idx]) => (
                        <tr key={name} className="border-t border-border">
                          <td className="py-1">{name}</td>
                          <td className="py-1 text-primary-on-tint">{idx}</td>
                        </tr>
                      ))}
                      {Object.entries(MESH_SETS).map(([name, ids]) => (
                        <tr key={name} className="border-t border-border">
                          <td className="py-1">{name}</td>
                          <td className="py-1 text-risk-fg">{ids.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </aside>
          </div>
        )}
      </main>
    </>
  );
}

/** Pixel box around every region with a margin: [x, y, width, height]. Used to zoom onto the face. */
function faceBox(set: RegionSet, width: number, height: number): [number, number, number, number] {
  const pts = set.regions.flatMap((r) => outlinePx(set, r));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const m = 0.2 * set.frame.unit;
  const x0 = Math.max(0, Math.min(...xs) - m);
  const y0 = Math.max(0, Math.min(...ys) - m);
  const x1 = Math.min(width, Math.max(...xs) + m);
  const y1 = Math.min(height, Math.max(...ys) + m);
  return [Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0)];
}

function trace(ctx: CanvasRenderingContext2D, pts: readonly Pt[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

function badge(ctx: CanvasRenderingContext2D, at: Pt, text: string, colour: string, u: number) {
  const r = 7.5 * u;
  ctx.beginPath();
  ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
  ctx.fillStyle = cssToken('bg', 0.82);
  ctx.fill();
  ctx.lineWidth = 1.6 * u;
  ctx.strokeStyle = colour;
  ctx.stroke();
  ctx.fillStyle = cssToken('ink');
  ctx.font = `600 ${9 * u}px Vazirmatn, Tahoma, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, at.x, at.y + 0.5 * u);
}

function draw(ctx: CanvasRenderingContext2D, set: RegionSet, lm: readonly Pt[], layers: Layers, hidden: ReadonlySet<ConcernId>) {
  // Marks scale with the face, not the image, so a small face in a wide photo stays readable.
  const u = Math.min(4, Math.max(0.6, set.frame.unit / 230));
  const visible = (r: Region) => (r.concernId ? layers.regions && !hidden.has(r.concernId) : layers.protect);
  const dashed = (r: Region) => {
    trace(ctx, outlinePx(set, r));
    ctx.setLineDash([4 * u, 3 * u]);
    ctx.lineWidth = 1.6 * u;
    ctx.strokeStyle = cssToken('danger');
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // Fills first, then outlines, then numbers, so nothing is buried under a neighbouring region.
  const shown = set.regions.filter(visible);
  for (const r of shown) {
    if (!r.concernId) continue;
    trace(ctx, outlinePx(set, r));
    ctx.fillStyle = cssToken(colourOf(r.concernId), r.concernId === 'skin-quality' ? 0.12 : 0.24);
    ctx.fill();
  }
  for (const r of shown) {
    if (!r.concernId) {
      dashed(r);
      continue;
    }
    trace(ctx, outlinePx(set, r));
    ctx.lineWidth = 1.5 * u;
    ctx.strokeStyle = cssToken(colourOf(r.concernId));
    ctx.stroke();
  }
  // Brows and lips are concerns and protected at the same time: mark them with the dashed outline too.
  if (layers.protect) set.regions.filter((x) => x.protect && x.concernId).forEach(dashed);

  for (const r of shown) {
    if (!r.concernId) continue;
    // Regions that contain another region get their number moved off the shared centre.
    const at =
      r.concernId === 'skin-quality'
        ? toPx(set.frame, { x: 0, y: 0.22 })
        : r.concernId === 'perioral-lines'
          ? { x: (lm[ANCHOR.subnasale]!.x + lm[ANCHOR.upperLipTop]!.x) / 2, y: (lm[ANCHOR.subnasale]!.y + lm[ANCHOR.upperLipTop]!.y) / 2 }
          : centroid(outlinePx(set, r));
    badge(ctx, at, String(CONCERN_IDS.indexOf(r.concernId) + 1), cssToken(colourOf(r.concernId)), u);
  }

  if (layers.axes) {
    const f = set.frame;
    const line = (a: Pt, b: Pt) => {
      const p = toPx(f, a);
      const q = toPx(f, b);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    };
    ctx.lineWidth = 1.4 * u;
    ctx.strokeStyle = cssToken('line');
    ctx.setLineDash([5 * u, 4 * u]);
    line({ x: -1, y: 0 }, { x: 1, y: 0 });
    line({ x: 0, y: -1 }, { x: 0, y: 1.6 });
    ctx.setLineDash([]);
    // One-unit ticks along both axes.
    for (const k of [-0.5, 0.5]) line({ x: k, y: -0.03 }, { x: k, y: 0.03 });
    for (const k of [0.5, 1, 1.5]) line({ x: -0.03, y: k }, { x: 0.03, y: k });
  }

  if (layers.anchors) {
    ctx.font = `${7.5 * u}px Vazirmatn, Tahoma, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const dot = (p: Pt, label: string, colour: string) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8 * u, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.lineWidth = 2.5 * u;
      ctx.strokeStyle = cssToken('bg', 0.85);
      ctx.strokeText(label, p.x + 4 * u, p.y);
      ctx.fillStyle = colour;
      ctx.fillText(label, p.x + 4 * u, p.y);
    };
    for (const idx of Object.values(ANCHOR)) dot(lm[idx]!, String(idx), cssToken('primary-on-tint'));
    for (const ids of Object.values(MESH_SETS)) for (const idx of ids) dot(lm[idx]!, String(idx), cssToken('risk-fg'));
  }
}
