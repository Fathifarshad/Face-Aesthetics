import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Chip, Header, LinkButton, Notice, Tag } from '../../components/ui';
import { burnSimulationLabel } from '../../components/simulationLabel';
import { AGE_NORMS, AGE_OFFSETS, targetAgeOf, TARGET_AGE_MIN } from '../../data/ageNorms';
import type { AgeTarget, ConcernId } from '../../data/types';
import { audit, uid } from '../../db/db';
import { replaceSimulation } from '../../db/images';
import { frontalPhoto } from '../../db/repo';
import {
  getSimState,
  listGrades,
  resetOverrides,
  setAgeTarget,
  setOverride,
  setRealAge,
  DEFAULT_TARGET,
} from '../../db/simRepo';
import type { SimSetting } from '../../db/types';
import { MAX_INTENSITY, type Change } from '../../engine/pipeline';
import type { WorkerRequest } from '../../engine/pipeline.worker';
import { area, pointInPolygon } from '../../engine/shapes';
import { useNum, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { CaseSteps } from './CaseSteps';
import { effectiveSettings, usable } from './simDefaults';
import { useCase } from './useCase';
import { useEngine } from './useEngine';

/**
 * Value a change starts at when the doctor switches on a change whose default is 0 (nothing to remove for this
 * age). An interface default, not a clinical value.
 */
const MANUAL_START = 0.5;
const SLIDER_STEP = 5;
/** A pointer that moves less than this (CSS px) before release is a tap that picks a region. */
const TAP_SLOP = 8;
/** A press this close to the divider (CSS px) drags it straight away. */
const DIVIDER_GRAB = 28;
/** Slider moves are written to the database after this pause (ms), not on every step of a drag. */
const SAVE_DELAY = 300;
/** The age coefficients behind every default are drafts until a senior physician sets them (PRD F3.3). */
const AGE_NORMS_DRAFT = Object.values(AGE_NORMS).some((n) => n.status === 'draft');

/**
 * Per-region simulation: band smoothing of lines, folds and hollows (M3) and local warp for volume and shape
 * (M4). Every change starts at its age-appropriate default (M5, PRD F3): `intensity` of the confirmed grade for
 * the chosen age target. A change the doctor moves keeps the doctor's value when the target changes, until
 * «بازگشت به پیش‌فرض». The photo is prepared once in the engine worker; a move re-renders only the mix and warp.
 */
export function SimulatePage() {
  const { caseId = '' } = useParams();
  const t = useT();
  const num = useNum();
  const data = useCase(caseId);
  const photo = useLive(async () => (await frontalPhoto(caseId)) ?? null, [caseId]);
  const grades = useLive(() => listGrades(caseId), [caseId]);
  const sim = useLive(() => getSimState(caseId), [caseId]);

  const before = useRef<HTMLCanvasElement>(null);
  const after = useRef<HTMLCanvasElement>(null);
  const frames = useRef({
    sent: 0,
    inFlight: false,
    pending: null as Change[] | null,
    last: null as ImageData | null,
  });
  const gesture = useRef<{ x: number; y: number; drag: boolean } | null>(null);
  const timers = useRef<Partial<Record<ConcernId, number>>>({});
  const [overrides, setOverrides] = useState<Partial<Record<ConcernId, SimSetting>> | null>(null);
  const [selected, setSelected] = useState<ConcernId | null>(null);
  const [split, setSplit] = useState(50);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const label = t.sim.label;

  const engine = useEngine(photo, (msg) => {
    if (msg.type !== 'frame') return;
    const f = frames.current;
    f.inFlight = false;
    const canvas = after.current;
    if (canvas) {
      const ctx = canvas.getContext('2d')!;
      const image = new ImageData(new Uint8ClampedArray(msg.pixels), msg.rect.width, msg.rect.height);
      f.last = image;
      ctx.putImageData(image, 0, 0);
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
  }, data?.patient.sex);
  const { status, ready, work, placement, post } = engine;
  const rect = ready?.rect ?? null;

  /** Sends the newest changes; while a frame is being rendered, only the latest request is kept. */
  const request = useCallback(
    (changes: Change[]) => {
      const f = frames.current;
      if (f.inFlight) {
        f.pending = changes;
        return;
      }
      f.inFlight = true;
      post({ type: 'render', id: ++f.sent, changes } satisfies WorkerRequest);
    },
    [post],
  );

  // The doctor's own settings of this case, loaded once; afterwards this page owns them and writes them back.
  useEffect(() => {
    let live = true;
    setOverrides(null);
    void getSimState(caseId).then((s) => live && setOverrides(s.overrides));
    return () => {
      live = false;
    };
  }, [caseId]);

  // Size the canvases and draw the "before" picture once the photo is prepared (before the first frame arrives).
  useEffect(() => {
    if (!ready || !work.current) return;
    frames.current = { sent: 0, inFlight: false, pending: null, last: null };
    for (const c of [before.current, after.current]) {
      if (!c) continue;
      c.width = ready.rect.width;
      c.height = ready.rect.height;
    }
    before.current?.getContext('2d')!.drawImage(work.current, -ready.rect.x, -ready.rect.y);
  }, [ready, work]);

  const realAge = data?.c.actualAge ?? 0;
  const target: AgeTarget = sim?.target ?? DEFAULT_TARGET;
  const settings = useMemo(
    () =>
      ready && grades && overrides
        ? effectiveSettings(ready.available, grades, realAge, target, overrides)
        : null,
    // `target` is a new object on every database read; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, grades, overrides, realAge, JSON.stringify(target)],
  );

  // Re-render on every change of a switch, a slider, a grade or the age target.
  useEffect(() => {
    if (!settings) return;
    if (after.current) after.current.dataset.ready = 'false';
    request(
      (Object.entries(settings) as [ConcernId, SimSetting][])
        .filter(([, s]) => s.on && (s.value > 0 || (!s.mirror && s.left > 0)))
        .map(([concernId, s]) =>
          s.mirror ? { concernId, intensity: s.value } : { concernId, intensity: s.value, left: s.left },
        ),
    );
  }, [settings, request]);

  useEffect(() => () => Object.values(timers.current).forEach((id) => window.clearTimeout(id)), []);

  if (!data) return null;
  const { patient } = data;
  const ids = settings ? (Object.keys(settings) as ConcernId[]) : [];
  const anyOn = ids.some((id) => settings![id]!.on);
  const anyGrade = (grades ?? []).some(usable);
  const targetAge = targetAgeOf(realAge, target);
  const signed = data.c.status === 'signed';

  /** A change the doctor touched becomes an override: kept here at once, written to the database after a pause. */
  const write = (next: Partial<Record<ConcernId, SimSetting>>) => {
    setOverrides((old) => ({ ...old, ...next }));
    for (const [id, s] of Object.entries(next) as [ConcernId, SimSetting][]) {
      window.clearTimeout(timers.current[id]);
      timers.current[id] = window.setTimeout(() => void setOverride(caseId, id, s), SAVE_DELAY);
    }
  };
  const update = (id: ConcernId, patch: Partial<SimSetting>) =>
    write({ [id]: { ...settings![id]!, ...patch } });
  /** Switching on a change whose default is 0 starts it at MANUAL_START, so switching on always shows something. */
  const switched = (s: SimSetting, on: boolean): SimSetting =>
    on && !s.on && s.value === 0 && s.left === 0
      ? { ...s, on, value: MANUAL_START, left: MANUAL_START, mirror: true }
      : { ...s, on };
  const toggle = (id: ConcernId) => write({ [id]: switched(settings![id]!, !settings![id]!.on) });
  const setAll = (on: boolean) =>
    write(Object.fromEntries(ids.map((id) => [id, switched(settings![id]!, on)])));
  const setSide = (id: ConcernId, side: 'R' | 'L', v: number) =>
    update(id, side === 'R' ? { value: v, last: 'R' } : { left: v, last: 'L' });
  /** The side moved last is the one the doctor means; mirroring and matching copy it to the other side. */
  const lastValue = (c: SimSetting) => (c.last === 'L' ? c.left : c.value);
  const setMirror = (id: ConcernId, mirror: boolean) => {
    const c = settings![id]!;
    const v = mirror ? lastValue(c) : c.value;
    update(id, { mirror, value: v, left: mirror ? v : c.left });
  };
  const match = (id: ConcernId) => {
    const c = settings![id]!;
    update(id, { value: lastValue(c), left: lastValue(c) });
  };
  const reset = () => {
    Object.values(timers.current).forEach((id) => window.clearTimeout(id));
    timers.current = {};
    setOverrides({});
    void resetOverrides(caseId);
    setMessage(t.sim.resetDone);
  };
  const chooseTarget = (next: AgeTarget) => {
    setMessage(null);
    void setAgeTarget(caseId, next);
  };
  const applyCustom = (text: string) => {
    setCustomText(text);
    const age = Number(text);
    if (text.length >= 2 && age >= TARGET_AGE_MIN) chooseTarget({ kind: 'custom', age });
  };

  /** Saves the current "after" picture over the whole photo, with the label burned in (for the report and client app). */
  const save = async () => {
    const image = frames.current.last;
    const place = placement.current;
    if (!photo || !image || !rect || !place) return;
    const bmp = await createImageBitmap(photo.blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const box = document.createElement('canvas');
    box.width = image.width;
    box.height = image.height;
    box.getContext('2d')!.putImageData(image, 0, 0);
    ctx.drawImage(
      box,
      place.x + rect.x / place.scale,
      place.y + rect.y / place.scale,
      rect.width / place.scale,
      rect.height / place.scale,
    );
    burnSimulationLabel(ctx, label);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.92));
    if (!blob) return;
    await replaceSimulation({
      id: uid(),
      caseId,
      photoId: photo.id,
      targetAge,
      strength: 1,
      blob,
      createdAt: Date.now(),
    });
    await audit(caseId, 'simulation.create', undefined, {
      targetAge,
      changes: ids.filter((id) => settings![id]!.on),
    });
    setMessage(t.sim.saved);
  };

  const maxPercent = Math.round(MAX_INTENSITY * 100);
  const pct = (v: number) => Math.round(v * 100);
  const gradeText = (id: ConcernId) => {
    const own = (grades ?? []).filter((g) => g.concernId === id && usable(g));
    if (!own.length) return null;
    return own.map((g) => num(g.grade)).join(' · ');
  };

  /** Split position from a pointer on the picture; the direction never depends on the text direction. */
  const splitAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setSplit(Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100)));
  };
  /** Opens the change whose region is under the pointer; the smallest region wins (the skin region holds all). */
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!rect || !ready) return;
    const box = e.currentTarget.getBoundingClientRect();
    const p = {
      x: ((e.clientX - box.left) / box.width) * rect.width,
      y: ((e.clientY - box.top) / box.height) * rect.height,
    };
    const hit = ready.outlines
      .filter((o) => pointInPolygon(p, o.points))
      .sort((a, b) => area(a.points) - area(b.points))[0];
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

  const shown = status === 'ready' && settings;

  return (
    <>
      <Header title={`${t.nav.simulate} — ${patient.displayName}`} back={`/doctor/case/${caseId}/grading`} />
      <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(2rem+var(--tabbar-h))] pt-4">
        <CaseSteps caseId={caseId} />

        {/* Age target (PRD F3): real age, three offsets, or a typed approximate age. */}
        {signed && (
          <div className="mb-3">
            <Notice tone="warn">{t.sim.signedLock}</Notice>
          </div>
        )}
        <section
          className="mb-3 rounded-md border border-border bg-surface px-3 py-2"
          aria-label={t.sim.target}
        >
          {/* A signed case keeps its approved target: the client package reads it (hard rule: nothing reaches the patient without approval). */}
          <fieldset disabled={signed} className="disabled:opacity-60">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block w-24">
                <span className="label">{t.sim.realAge}</span>
                <input
                  className="w-full"
                  inputMode="numeric"
                  dir="ltr"
                  value={realAge || ''}
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(/\D/g, '').slice(0, 3));
                    if (v > 0) void setRealAge(caseId, v);
                  }}
                />
              </label>
              <span className="pb-2 text-control text-primary-on-tint" data-testid="target-age">
                <bdi>{t.sim.targetIs(num(targetAge))}</bdi>
              </span>
              {AGE_NORMS_DRAFT && (
                <span
                  className="mb-2 inline-flex items-center rounded-md bg-draft-bg px-2 py-0.5 text-[12px] text-draft-fg"
                  title={t.sim.normsDraft}
                >
                  {t.grading.unverified}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t.sim.target}>
              {AGE_OFFSETS.map((o) => (
                <Chip
                  key={o}
                  active={target.kind === 'offset' && target.offset === o}
                  onClick={() => {
                    setCustomOpen(false);
                    chooseTarget({ kind: 'offset', offset: o });
                  }}
                >
                  {t.sim.offsets[o]}
                </Chip>
              ))}
              <Chip
                active={target.kind === 'custom' || customOpen}
                onClick={() => {
                  setCustomOpen(true);
                  setCustomText(String(target.kind === 'custom' ? target.age : targetAge));
                }}
              >
                {t.sim.custom}
              </Chip>
            </div>
            <div className="mt-2">
              <Button onClick={reset} disabled={!overrides || Object.keys(overrides).length === 0}>
                {t.sim.reset}
              </Button>
            </div>
            {(customOpen || target.kind === 'custom') && (
              <label className="mt-2 block w-40">
                <span className="label">{t.sim.customAge}</span>
                <input
                  className="w-full"
                  inputMode="numeric"
                  dir="ltr"
                  value={customOpen ? customText : String(target.kind === 'custom' ? target.age : '')}
                  onFocus={() => setCustomOpen(true)}
                  onChange={(e) => applyCustom(e.target.value.replace(/\D/g, '').slice(0, 3))}
                />
              </label>
            )}
          </fieldset>
          {AGE_NORMS_DRAFT && <p className="mt-2 text-caption text-muted">{t.sim.normsDraft}</p>}
        </section>

        {message && (
          <div className="mb-3">
            <Notice tone="primary">{message}</Notice>
          </div>
        )}
        {status === 'ready' && grades && !anyGrade && (
          <div className="mb-3 flex flex-col items-start gap-2">
            <Notice tone="warn">{t.sim.noGrades}</Notice>
            <LinkButton variant="ghost" to={`/doctor/case/${caseId}/grading`}>
              {t.sim.toGrading}
            </LinkButton>
          </div>
        )}

        {(status === 'no-photo' || status === 'no-face') && (
          <div className="flex flex-col items-start gap-3">
            <Notice tone="warn">{status === 'no-photo' ? t.sim.noPhoto : t.sim.noFace}</Notice>
            <LinkButton to={`/doctor/case/${caseId}/capture`}>{t.sim.toCapture}</LinkButton>
          </div>
        )}
        {status === 'error' && <Notice tone="danger">{t.sim.error}</Notice>}
        {status === 'preparing' && <p className="text-control text-ink-2">{t.sim.preparing}</p>}

        {/* The canvases exist from the start so the worker's first frame can be drawn; they show once the photo is ready. */}
        <div
          className={shown ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-5' : 'hidden'}
        >
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
                <canvas
                  ref={before}
                  role="img"
                  aria-label={t.sim.before}
                  className="block h-auto max-h-[46vh] w-auto max-w-full lg:max-h-[calc(100vh-190px)]"
                />
                <canvas
                  ref={after}
                  role="img"
                  aria-label={t.sim.after}
                  className="absolute inset-0 h-full w-full"
                  style={{ clipPath: `inset(0 0 0 ${split}%)` }}
                />
                {rect && ready && selected && (
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox={`0 0 ${rect.width} ${rect.height}`}
                    preserveAspectRatio="none"
                    aria-hidden
                    data-selected={selected}
                  >
                    {ready.outlines
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
                <div
                  className="pointer-events-none absolute inset-y-0 w-0.5 bg-ink"
                  style={{ left: `calc(${split}% - 1px)` }}
                />
                <div
                  className="pointer-events-none absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-pill border-2 border-ink bg-bg/70 text-ink shadow-lg"
                  style={{ left: `${split}%` }}
                  aria-hidden
                >
                  ‹›
                </div>
                <span className="pointer-events-none absolute left-2 top-2 rounded-tag bg-bg/80 px-2 py-0.5 text-caption">
                  {t.sim.before}
                </span>
                <span className="pointer-events-none absolute right-2 top-2 rounded-tag bg-bg/80 px-2 py-0.5 text-caption text-primary-on-tint">
                  {t.sim.after}
                </span>
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
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-section font-semibold text-primary-on-tint">{t.sim.changes}</h2>
              <Button onClick={() => setAll(!anyOn)}>{anyOn ? t.sim.allOff : t.sim.allOn}</Button>
            </div>
            <p className="mb-2 text-caption text-muted">{t.sim.tapHint}</p>
            <ul className="flex flex-col gap-1.5">
              {ids.map((id) => {
                const s = settings![id]!;
                const name = t.concerns[id];
                const sides = ready!.bilateral.includes(id);
                const apart = sides && !s.mirror;
                const graded = gradeText(id);
                const manual = !!overrides?.[id];
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
                    data-manual={manual ? 'true' : undefined}
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
                        onClick={() => toggle(id)}
                        className={`relative h-7 w-12 shrink-0 rounded-pill transition ${s.on ? 'bg-primary' : 'bg-track'}`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-pill bg-ink transition-all ${s.on ? 'start-6' : 'start-1'}`}
                        />
                      </button>
                      <span className={`min-w-0 flex-1 text-body ${s.on ? '' : 'text-muted'}`}>{name}</span>
                      <bdi
                        className={`text-end text-control ${s.on ? 'text-primary-on-tint' : 'text-muted'}`}
                      >
                        {apart ? `${num(pct(s.value))}% · ${num(pct(s.left))}%` : `${num(pct(s.value))}%`}
                      </bdi>
                    </div>
                    {(graded || manual) && (
                      <div className="mt-1 flex flex-wrap gap-1.5 text-caption">
                        {graded && <Tag>{t.sim.gradeOf(graded)}</Tag>}
                        {manual && <Tag tone="primary">{t.sim.manual}</Tag>}
                      </div>
                    )}
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
                          <Button
                            onClick={() => match(id)}
                            disabled={!s.on || s.value === s.left}
                            aria-label={t.sim.matchOf(name)}
                          >
                            {t.sim.match}
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <Button variant="primary" className="mt-3 w-full" onClick={() => void save()} disabled={signed}>
              {t.sim.save}
            </Button>
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
