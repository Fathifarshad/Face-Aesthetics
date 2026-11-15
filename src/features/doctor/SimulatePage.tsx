import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Header, LinkButton, Notice } from '../../components/ui';
import { burnSimulationLabel } from '../../components/simulationLabel';
import type { ConcernId } from '../../data/types';
import { frontalPhoto } from '../../db/repo';
import { MAX_INTENSITY, SMOOTHING, type Change, type Outline, type Rect } from '../../engine/pipeline';
import type { WorkerRequest, WorkerResponse } from '../../engine/pipeline.worker';
import { area, pointInPolygon } from '../../engine/shapes';
import { useNum, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { CaseSteps } from './CaseSteps';
import { useCase } from './useCase';

/** Long side of the working copy (docs/PRD.md F1.4); smaller on touch devices (SUPERPROMPT, performance). */
const WORK_SIDE = { desktop: 1280, touch: 1024 } as const;
/**
 * Slider value new changes start at, until age-appropriate defaults arrive with M5. Not a clinical value.
 * Raised from 0.6 after the owner found the effect at 60 % too weak (2026-11-15).
 */
const START_INTENSITY = 0.75;
/**
 * Start switched off: whole-face and neck smoothing (the least specific changes) and the concerns whose only
 * effect is a shape change (lips, jaw, masseter, brow, midface volume), so the first picture does not change the
 * shape of the face until the doctor asks for it. Age-appropriate defaults replace this with M5.
 */
const START_OFF = (id: ConcernId) => id === 'skin-quality' || id === 'neck' || SMOOTHING[id] === null;
const SLIDER_STEP = 5;
/** A pointer that moves less than this (CSS px) before release is a tap that picks a region. */
const TAP_SLOP = 8;
/** A press this close to the divider (CSS px) drags it straight away. */
const DIVIDER_GRAB = 28;

/**
 * Part of the photo the engine works on: the landmark box grown on every side so the forehead up to the
 * hairline, the temples, the jaw and the neck below the chin all stay inside. Fractions of the landmark box.
 * The engine trims this further to its own working box (regions plus a margin).
 */
const CROP_GROW = { side: 0.35, top: 0.5, bottom: 0.7 } as const;

function faceCrop(landmarks: readonly { x: number; y: number }[], width: number, height: number) {
  const xs = landmarks.map((p) => p.x);
  const ys = landmarks.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const bw = x1 - x0;
  const bh = y1 - y0;
  const left = Math.max(0, Math.floor(x0 - bw * CROP_GROW.side));
  const top = Math.max(0, Math.floor(y0 - bh * CROP_GROW.top));
  const right = Math.min(width, Math.ceil(x1 + bw * CROP_GROW.side));
  const bottom = Math.min(height, Math.ceil(y1 + bh * CROP_GROW.bottom));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** `value` is the right side (or both, with the mirror on); `left` the subject's left side with the mirror off. */
type Setting = { on: boolean; value: number; left: number; mirror: boolean; last: 'R' | 'L' };
type Status = 'loading' | 'no-photo' | 'no-face' | 'preparing' | 'ready' | 'error';

/**
 * Per-region simulation: band smoothing of lines, folds and hollows (M3) and local warp for volume and shape
 * (M4). The photo is prepared once in the engine worker; every switch or slider move re-renders only the mix and
 * the warp. Bilateral changes have a mirror switch: off, each side gets its own slider (PRD F4.6). Touching a
 * region on the photo opens its change, and the open change is outlined on the photo (F4.7).
 */
export function SimulatePage() {
  const { caseId = '' } = useParams();
  const t = useT();
  const num = useNum();
  const data = useCase(caseId);
  const photo = useLive(async () => (await frontalPhoto(caseId)) ?? null, [caseId]);

  const before = useRef<HTMLCanvasElement>(null);
  const after = useRef<HTMLCanvasElement>(null);
  const worker = useRef<Worker | null>(null);
  const frames = useRef({ sent: 0, inFlight: false, pending: null as Change[] | null });
  const gesture = useRef<{ x: number; y: number; drag: boolean } | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [rect, setRect] = useState<Rect | null>(null);
  const [settings, setSettings] = useState<Partial<Record<ConcernId, Setting>>>({});
  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [bilateral, setBilateral] = useState<ConcernId[]>([]);
  const [selected, setSelected] = useState<ConcernId | null>(null);
  const [split, setSplit] = useState(50);
  const label = t.sim.label;

  /** Sends the newest changes; while a frame is being rendered, only the latest request is kept. */
  const request = useCallback((changes: Change[]) => {
    const f = frames.current;
    if (!worker.current) return;
    if (f.inFlight) {
      f.pending = changes;
      return;
    }
    f.inFlight = true;
    worker.current.postMessage({ type: 'render', id: ++f.sent, changes } satisfies WorkerRequest);
  }, []);

  // Prepare the photo in the worker whenever the frontal "before" photo changes.
  useEffect(() => {
    if (photo === undefined) return;
    if (photo === null) return setStatus('no-photo');
    if (!photo.landmarks) return setStatus('no-face');
    let cancelled = false;
    const w = new Worker(new URL('../../engine/pipeline.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    frames.current = { sent: 0, inFlight: false, pending: null };
    setStatus('preparing');
    setRect(null);

    const work = document.createElement('canvas');
    w.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (cancelled) return;
      const msg = event.data;
      if (msg.type === 'error') {
        console.error('simulation engine failed');
        return setStatus('error');
      }
      if (msg.type === 'ready') {
        const start: Partial<Record<ConcernId, Setting>> = {};
        for (const id of msg.available) start[id] = { on: !START_OFF(id), value: START_INTENSITY, left: START_INTENSITY, mirror: true, last: 'R' };
        // Canvas sizes are set here, before React shows them, so the first frame has somewhere to go.
        for (const c of [before.current, after.current]) {
          if (!c) continue;
          c.width = msg.rect.width;
          c.height = msg.rect.height;
        }
        before.current?.getContext('2d')!.drawImage(work, -msg.rect.x, -msg.rect.y);
        setRect(msg.rect);
        setOutlines(msg.outlines);
        setBilateral(msg.bilateral);
        setSettings(start);
        setStatus('ready');
        return;
      }
      const f = frames.current;
      f.inFlight = false;
      const canvas = after.current;
      if (canvas) {
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(new ImageData(new Uint8ClampedArray(msg.pixels), msg.rect.width, msg.rect.height), 0, 0);
        burnSimulationLabel(ctx, label);
        canvas.dataset.frame = String(msg.id);
        canvas.dataset.renderMs = msg.ms.toFixed(1);
        if (!f.pending) canvas.dataset.ready = 'true';
      }
      if (f.pending) {
        const next = f.pending;
        f.pending = null;
        request(next);
      }
    };
    w.onerror = () => !cancelled && setStatus('error');

    void (async () => {
      const bmp = await createImageBitmap(photo.blob);
      if (cancelled) return bmp.close();
      const side = window.matchMedia('(pointer: coarse)').matches ? WORK_SIDE.touch : WORK_SIDE.desktop;
      // The size limit applies to the face and its surroundings, not to the whole photo: the face often fills
      // only a third of the frame, and limiting the whole photo would leave it a few hundred pixels wide.
      const k0 = bmp.width / photo.width;
      const crop = faceCrop(photo.landmarks!, bmp.width / k0, bmp.height / k0);
      const sx = crop.x * k0;
      const sy = crop.y * k0;
      const sw = crop.width * k0;
      const sh = crop.height * k0;
      const scale = Math.min(1, side / Math.max(sw, sh));
      work.width = Math.round(sw * scale);
      work.height = Math.round(sh * scale);
      const ctx = work.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, work.width, work.height);
      bmp.close();
      const pixels = ctx.getImageData(0, 0, work.width, work.height).data;
      // Stored landmarks are in pixels of the stored photo; the working copy is a scaled crop of it.
      const k = work.width / crop.width;
      const landmarks = photo.landmarks!.map((p) => ({ x: (p.x - crop.x) * k, y: (p.y - crop.y) * k }));
      w.postMessage({ type: 'prepare', data: pixels, width: work.width, height: work.height, landmarks } satisfies WorkerRequest, [pixels.buffer]);
    })();

    return () => {
      cancelled = true;
      w.terminate();
      worker.current = null;
    };
  }, [photo, label, request]);

  // Re-render on every change of a switch or slider.
  useEffect(() => {
    if (status !== 'ready') return;
    if (after.current) after.current.dataset.ready = 'false';
    request(
      (Object.entries(settings) as [ConcernId, Setting][])
        .filter(([, s]) => s.on && (s.value > 0 || (!s.mirror && s.left > 0)))
        .map(([concernId, s]) => (s.mirror ? { concernId, intensity: s.value } : { concernId, intensity: s.value, left: s.left })),
    );
  }, [settings, status, request]);

  if (!data) return null;
  const { patient } = data;
  const ids = Object.keys(settings) as ConcernId[];
  const anyOn = ids.some((id) => settings[id]!.on);
  const update = (id: ConcernId, patch: Partial<Setting>) => setSettings((s) => ({ ...s, [id]: { ...s[id]!, ...patch } }));
  const setAll = (on: boolean) => setSettings((s) => Object.fromEntries(ids.map((id) => [id, { ...s[id]!, on }])));
  const setSide = (id: ConcernId, side: 'R' | 'L', v: number) => update(id, side === 'R' ? { value: v, last: 'R' } : { left: v, last: 'L' });
  /** The side moved last is the one the doctor means; mirroring and matching copy it to the other side. */
  const lastValue = (c: Setting) => (c.last === 'L' ? c.left : c.value);
  const setMirror = (id: ConcernId, mirror: boolean) =>
    setSettings((s) => {
      const c = s[id]!;
      const v = mirror ? lastValue(c) : c.value;
      return { ...s, [id]: { ...c, mirror, value: v, left: v } };
    });
  const match = (id: ConcernId) =>
    setSettings((s) => {
      const c = s[id]!;
      return { ...s, [id]: { ...c, value: lastValue(c), left: lastValue(c) } };
    });
  const maxPercent = Math.round(MAX_INTENSITY * 100);
  const pct = (v: number) => Math.round(v * 100);

  /** Split position from a pointer on the picture; the direction never depends on the text direction. */
  const splitAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setSplit(Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100)));
  };
  /** Opens the change whose region is under the pointer; the smallest region wins (the skin region holds all). */
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!rect) return;
    const box = e.currentTarget.getBoundingClientRect();
    const p = { x: ((e.clientX - box.left) / box.width) * rect.width, y: ((e.clientY - box.top) / box.height) * rect.height };
    const hit = outlines.filter((o) => pointInPolygon(p, o.points)).sort((a, b) => area(a.points) - area(b.points))[0];
    if (!hit) return;
    setSelected(hit.concernId);
    document.getElementById(`change-${hit.concernId}`)?.scrollIntoView({ block: 'nearest' });
  };
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const box = e.currentTarget.getBoundingClientRect();
    const near = Math.abs(e.clientX - (box.left + (split / 100) * box.width)) <= DIVIDER_GRAB;
    gesture.current = { x: e.clientX, y: e.clientY, drag: near };
    if (near) splitAt(e);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (!g.drag && Math.hypot(e.clientX - g.x, e.clientY - g.y) > TAP_SLOP) g.drag = true;
    if (g.drag) splitAt(e);
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (g && !g.drag) pick(e);
  };

  return (
    <>
      <Header title={`${t.nav.simulate} — ${patient.displayName}`} back={`/doctor/case/${caseId}/age`} />
      <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(2rem+var(--tabbar-h))] pt-4">
        <CaseSteps caseId={caseId} />

        {status === 'no-photo' && (
          <div className="flex flex-col items-start gap-3">
            <Notice tone="warn">{t.sim.noPhoto}</Notice>
            <LinkButton to={`/doctor/case/${caseId}/capture`}>{t.sim.toCapture}</LinkButton>
          </div>
        )}
        {status === 'no-face' && (
          <div className="flex flex-col items-start gap-3">
            <Notice tone="warn">{t.sim.noFace}</Notice>
            <LinkButton to={`/doctor/case/${caseId}/capture`}>{t.sim.toCapture}</LinkButton>
          </div>
        )}
        {status === 'error' && <Notice tone="danger">{t.sim.error}</Notice>}
        {status === 'preparing' && <p className="text-control text-ink-2">{t.sim.preparing}</p>}

        {/* The canvases exist from the start so the worker's first frame can be drawn; they show once the photo is ready. */}
        <div className={status === 'ready' ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-5' : 'hidden'}>
          <div className="sticky top-[69px] z-10 -mx-4 bg-bg px-4 pb-2 lg:top-[85px] lg:mx-0 lg:px-0">
            <div className="flex justify-center rounded-photo bg-photo">
              <div
                dir="ltr"
                className="relative touch-none select-none overflow-hidden rounded-photo"
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={() => (gesture.current = null)}
              >
                <canvas ref={before} role="img" aria-label={t.sim.before} className="block h-auto max-h-[46vh] w-auto max-w-full lg:max-h-[calc(100vh-190px)]" />
                <canvas
                  ref={after}
                  role="img"
                  aria-label={t.sim.after}
                  className="absolute inset-0 h-full w-full"
                  style={{ clipPath: `inset(0 0 0 ${split}%)` }}
                />
                {rect && selected && (
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox={`0 0 ${rect.width} ${rect.height}`}
                    preserveAspectRatio="none"
                    aria-hidden
                    data-selected={selected}
                  >
                    {outlines
                      .filter((o) => o.concernId === selected)
                      .map((o) => (
                        <polygon
                          key={o.side}
                          points={o.points.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}
                          className="fill-primary/10 stroke-primary"
                          strokeWidth={Math.max(1.5, rect.width / 260)}
                          strokeDasharray={`${rect.width / 80} ${rect.width / 120}`}
                        />
                      ))}
                  </svg>
                )}
                <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-ink" style={{ left: `calc(${split}% - 1px)` }} />
                <div
                  className="pointer-events-none absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-pill border-2 border-ink bg-bg/70 text-ink shadow-lg"
                  style={{ left: `${split}%` }}
                  aria-hidden
                >
                  ‹›
                </div>
                <span className="pointer-events-none absolute left-2 top-2 rounded-tag bg-bg/80 px-2 py-0.5 text-caption">{t.sim.before}</span>
                <span className="pointer-events-none absolute right-2 top-2 rounded-tag bg-bg/80 px-2 py-0.5 text-caption text-primary-on-tint">{t.sim.after}</span>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(split)}
              onChange={(e) => setSplit(Number(e.target.value))}
              dir="ltr"
              className="mt-1 w-full"
              aria-label={t.sim.compare}
            />
          </div>

          <aside className="lg:sticky lg:top-[85px] lg:max-h-[calc(100vh-101px-var(--tabbar-h))] lg:overflow-y-auto lg:pe-1">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-section font-semibold text-primary-on-tint">{t.sim.changes}</h2>
              <Button onClick={() => setAll(!anyOn)}>{anyOn ? t.sim.allOff : t.sim.allOn}</Button>
            </div>
            <p className="mb-2 text-caption text-muted">{t.sim.tapHint}</p>
            <ul className="flex flex-col gap-1.5">
              {ids.map((id) => {
                const s = settings[id]!;
                const name = t.concerns[id];
                const sides = bilateral.includes(id);
                const apart = sides && !s.mirror;
                const slider = (value: number, aria: string, onChange: (v: number) => void) => (
                  <input
                    type="range"
                    min={0}
                    max={maxPercent}
                    step={SLIDER_STEP}
                    value={pct(value)}
                    disabled={!s.on}
                    onChange={(e) => onChange(Number(e.target.value) / 100)}
                    dir="ltr"
                    className="mt-1 w-full disabled:opacity-40"
                    aria-label={aria}
                  />
                );
                return (
                  <li
                    key={id}
                    id={`change-${id}`}
                    onFocusCapture={() => setSelected(id)}
                    onPointerDown={() => setSelected(id)}
                    aria-current={selected === id ? 'true' : undefined}
                    className={`rounded-md border px-3 py-2 ${selected === id ? 'border-primary' : s.on ? 'border-border' : 'border-border/50'} ${s.on ? 'bg-surface' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={s.on}
                        aria-label={name}
                        onClick={() => update(id, { on: !s.on })}
                        className={`relative h-7 w-12 shrink-0 rounded-pill transition ${s.on ? 'bg-primary' : 'bg-track'}`}
                      >
                        <span className={`absolute top-1 h-5 w-5 rounded-pill bg-ink transition-all ${s.on ? 'start-6' : 'start-1'}`} />
                      </button>
                      <span className={`min-w-0 flex-1 text-body ${s.on ? '' : 'text-muted'}`}>{name}</span>
                      <bdi className={`text-end text-control ${s.on ? 'text-primary-on-tint' : 'text-muted'}`}>
                        {apart ? `${num(pct(s.value))}% · ${num(pct(s.left))}%` : `${num(pct(s.value))}%`}
                      </bdi>
                    </div>
                    {apart ? (
                      <>
                        <div className="mt-1 text-caption text-muted">{t.sim.right}</div>
                        {slider(s.value, t.sim.intensitySide(name, t.sim.right), (v) => setSide(id, 'R', v))}
                        <div className="mt-1 text-caption text-muted">{t.sim.left}</div>
                        {slider(s.left, t.sim.intensitySide(name, t.sim.left), (v) => setSide(id, 'L', v))}
                      </>
                    ) : (
                      slider(s.value, t.sim.intensity(name), (v) => update(id, { value: v, left: v }))
                    )}
                    {sides && (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <label className="flex min-h-touch items-center gap-2 text-caption text-ink-2">
                          <input
                            type="checkbox"
                            checked={s.mirror}
                            disabled={!s.on}
                            onChange={(e) => setMirror(id, e.target.checked)}
                            aria-label={t.sim.mirrorOf(name)}
                            className="h-5 w-5 accent-primary"
                          />
                          {t.sim.mirror}
                        </label>
                        {apart && (
                          <Button onClick={() => match(id)} disabled={!s.on || s.value === s.left} aria-label={t.sim.matchOf(name)}>
                            {t.sim.match}
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-caption text-muted">{t.sim.capNote(num(maxPercent))}</p>
            <p className="mt-1 text-caption text-muted">{t.sim.manualNote}</p>
            {rect && (
              <p className="mt-1 text-caption text-muted" dir="ltr">
                <bdi>
                  {num(rect.width)} × {num(rect.height)} px
                </bdi>
              </p>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
