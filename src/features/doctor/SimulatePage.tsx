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
  setLipType,
  setOverride,
  setRealAge,
  setSimMode,
  setSiteOverride,
  setCodeOn,
  setOption,
  DEFAULT_TARGET,
} from '../../db/simRepo';
import type { SimMode, SimSetting } from '../../db/types';
import {
  codesOf,
  familyBilateral,
  isMdCode,
  isMdFamily,
  MD_CODE_INFO,
  MD_CODES,
  MD_CODES_SOURCE,
  MD_FAMILIES,
  MD_FAMILY_INFO,
  WARNING_CODES,
  type MdCode,
  type MdFamily,
  type MdKey,
} from '../../data/mdCodes';
import { LIP_TYPE_SETTINGS, LIP_TYPES, lipTypeOf, type LipType } from '../../data/lipTypes';
import { MAX_INTENSITY, type Change, type SiteChange } from '../../engine/pipeline';
import type { WorkerRequest } from '../../engine/pipeline.worker';
import { area, pointInPolygon } from '../../engine/shapes';
import { useBi, useNum, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { CaseSteps } from './CaseSteps';
import { defaultOrder } from '../../data/optionSort';
import type { FxType, TreatmentOption } from '../../data/treatmentOptions';
import { screen } from './optionScreening';
import {
  capSettings,
  chosenOptions,
  codeSettings,
  concernsShown,
  effectiveSettings,
  engineInput,
  familiesOff,
  familySettings,
  midfaceGradeOf,
  usable,
} from './simDefaults';
import { codeRange } from '../../data/estimates';
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

/** A slider of the page: a concern (both modes), or an MD Codes family or code (mode B). */
type Key = ConcernId | MdKey;
const isSite = (k: Key): k is MdKey => isMdFamily(k) || isMdCode(k);
/** Lip codes whose fill scales with the lip type (the fullness codes, not the corner, philtrum or perioral lines). */
const LIP_FILL: ReadonlySet<Key> = new Set<Key>(['lip-volume', 'Lp1', 'Lp2', 'Lp3', 'Lp4', 'Lp5']);
type Frame = { changes: Change[]; sites: SiteChange[] };
type P = { x: number; y: number };
const pointsAttr = (pts: readonly P[]) => pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
const centreOf = (pts: readonly P[]) => ({
  x: pts.reduce((t, q) => t + q.x, 0) / pts.length,
  y: pts.reduce((t, q) => t + q.y, 0) / pts.length,
});

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
  const bi = useBi();
  const data = useCase(caseId);
  const photo = useLive(async () => (await frontalPhoto(caseId)) ?? null, [caseId]);
  const grades = useLive(() => listGrades(caseId), [caseId]);
  const sim = useLive(() => getSimState(caseId), [caseId]);

  const before = useRef<HTMLCanvasElement>(null);
  const after = useRef<HTMLCanvasElement>(null);
  const frames = useRef({
    sent: 0,
    inFlight: false,
    pending: null as Frame | null,
    last: null as ImageData | null,
  });
  const gesture = useRef<{ x: number; y: number; drag: boolean } | null>(null);
  const timers = useRef<Partial<Record<Key, number>>>({});
  const [overrides, setOverrides] = useState<Partial<Record<ConcernId, SimSetting>> | null>(null);
  const [siteOverrides, setSiteOverrides] = useState<Partial<Record<MdKey, SimSetting>>>({});
  const [codeOn, setCodeOnState] = useState<Partial<Record<MdCode, boolean>>>({});
  const [open, setOpen] = useState<ReadonlySet<MdFamily>>(new Set());
  const [selected, setSelected] = useState<Key | null>(null);
  const [split, setSplit] = useState(50);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const label = t.sim.label;

  const engine = useEngine(
    photo,
    (msg) => {
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
    },
    data?.patient.sex,
  );
  const { status, ready, work, placement, post } = engine;
  const rect = ready?.rect ?? null;

  /** Sends the newest changes; while a frame is being rendered, only the latest request is kept. */
  const request = useCallback(
    (frame: Frame) => {
      const f = frames.current;
      if (f.inFlight) {
        f.pending = frame;
        return;
      }
      f.inFlight = true;
      post({ type: 'render', id: ++f.sent, changes: frame.changes, sites: frame.sites } satisfies WorkerRequest);
    },
    [post],
  );

  // The doctor's own settings of this case, loaded once; afterwards this page owns them and writes them back.
  useEffect(() => {
    let live = true;
    setOverrides(null);
    void getSimState(caseId).then((s) => {
      if (!live) return;
      setSiteOverrides(s.siteOverrides ?? {});
      setCodeOnState(s.codeOn ?? {});
      setOverrides(s.overrides);
    });
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
  const suggestedLip: LipType | null = ready ? lipTypeOf(ready.lipFullness) : null;
  const lipType: LipType = sim?.lipType ?? suggestedLip ?? 3;
  const target: AgeTarget = sim?.target ?? DEFAULT_TARGET;
  const mode: SimMode = sim?.mode ?? 'area';
  const intake = data?.c.intake;
  /** Options the intake does not contraindicate (v1 checks, optionScreening.ts). */
  const allowed = useCallback((o: TreatmentOption) => !intake || screen(o, intake).blocks.length === 0, [intake]);
  // The treatment option in force per concern (PRD F5.3): it caps the slider and sets the kind of effect.
  const options = useMemo(
    () => (ready && grades ? chosenOptions(ready.available, sim?.options ?? {}, grades, allowed) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, grades, JSON.stringify(sim?.options ?? {}), allowed],
  );
  // PRD F6.1: families whose concern has a chosen non-filler option are off in mode B (M7).
  const off = useMemo(
    () => familiesOff(sim?.options ?? {}, options ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(sim?.options ?? {}), options],
  );
  const settings = useMemo(
    () =>
      ready && grades && overrides && options
        ? capSettings(effectiveSettings(ready.available, grades, realAge, target, overrides), options)
        : null,
    // `target` is a new object on every database read; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, grades, overrides, options, realAge, JSON.stringify(target)],
  );

  // MD Codes codes that can be placed on this photo and their families, top to bottom; a family starts from its
  // concern in mode A (M5b), a code from its family (M5c).
  const codeIds = useMemo(() => (ready ? MD_CODES.filter((c) => ready.zones.some((z) => z.site === c)) : []), [ready]);
  const familyIds = useMemo(() => MD_FAMILIES.filter((f) => codeIds.some((c) => MD_CODE_INFO[c].family === f)), [codeIds]);
  const families = useMemo(
    () => (settings ? familySettings(familyIds, settings, siteOverrides) : null),
    [familyIds, settings, siteOverrides],
  );
  const sites = useMemo(
    () => (families ? codeSettings(codeIds, families, siteOverrides, codeOn) : null),
    [codeIds, families, siteOverrides, codeOn],
  );

  // Re-render on every change of the mode, a switch, a slider, a grade, the age target or the lip type.
  useEffect(() => {
    if (!settings || !sites) return;
    if (after.current) after.current.dataset.ready = 'false';
    // The lip slider is scaled by the lip type: a thin lip changes more than a full one.
    const k = (key: Key) => (LIP_FILL.has(key) ? LIP_TYPE_SETTINGS.gain[lipType] : 1);
    const fx = Object.fromEntries(Object.entries(options ?? {}).map(([id, o]) => [id, o.fx.type])) as Partial<Record<ConcernId, FxType>>;
    const live = Object.fromEntries(
      (Object.entries(sites) as [MdCode, SimSetting][]).filter(([c]) => !off.families.has(MD_CODE_INFO[c].family)),
    ) as Partial<Record<MdCode, SimSetting>>;
    request(engineInput(mode, settings, live, k, fx, off.concerns));
  }, [settings, sites, mode, request, lipType, options, off]);

  useEffect(() => () => Object.values(timers.current).forEach((id) => window.clearTimeout(id)), []);

  if (!data) return null;
  const { patient } = data;
  const concernIds = settings ? concernsShown(mode, Object.keys(settings) as ConcernId[], off.concerns) : [];
  const shownSites = mode === 'mdcodes' ? codeIds.filter((c) => !off.families.has(MD_CODE_INFO[c].family)) : [];
  const shownFamilies = mode === 'mdcodes' ? familyIds.filter((f) => !off.families.has(f)) : [];
  const offFamilies = mode === 'mdcodes' ? familyIds.filter((f) => off.families.has(f)) : [];
  /** The sliders «همه روشن / همه خاموش» acts on: the concerns and, in mode B, the families (codes follow them). */
  const ids: Key[] = [...concernIds, ...shownFamilies];
  const settingOf = (key: Key): SimSetting =>
    isMdFamily(key) ? families![key]! : isMdCode(key) ? sites![key]! : settings![key as ConcernId]!;
  const anyOn = ids.some((id) => settingOf(id).on);
  const nameOf = (key: Key) =>
    isMdFamily(key)
      ? t.sim.siteName(key, bi({ fa: MD_FAMILY_INFO[key].nameFa, en: MD_FAMILY_INFO[key].nameEn }))
      : isMdCode(key)
        ? t.sim.siteName(key, bi({ fa: MD_CODE_INFO[key].nameFa, en: MD_CODE_INFO[key].nameEn }))
        : t.concerns[key];
  /** A code zone is shaded while its slider gives that side something. */
  const filled = (site: MdCode, side: 'R' | 'L' | 'M') => {
    const s = sites?.[site];
    if (off.families.has(MD_CODE_INFO[site].family)) return false;
    return !!s && s.on && (side === 'L' && !s.mirror ? s.left : s.value) > 0;
  };
  const anyGrade = (grades ?? []).some(usable);
  const targetAge = targetAgeOf(realAge, target);
  const signed = data.c.status === 'signed';

  /**
   * A slider the doctor touched becomes an override: kept here at once, written to the database after a pause.
   * Concern sliders and MD Codes sliders are stored apart, so each mode keeps its own settings.
   */
  const write = (next: Partial<Record<Key, SimSetting>>) => {
    const entries = Object.entries(next) as [Key, SimSetting][];
    const concerns = entries.filter(([k]) => !isSite(k));
    const own = entries.filter(([k]) => isSite(k));
    if (concerns.length) setOverrides((old) => ({ ...old, ...Object.fromEntries(concerns) }));
    if (own.length) setSiteOverrides((old) => ({ ...old, ...Object.fromEntries(own) }));
    for (const [id, s] of entries) {
      window.clearTimeout(timers.current[id]);
      timers.current[id] = window.setTimeout(
        () => void (isSite(id) ? setSiteOverride(caseId, id, s) : setOverride(caseId, id, s)),
        SAVE_DELAY,
      );
    }
  };
  const update = (id: Key, patch: Partial<SimSetting>) => write({ [id]: { ...settingOf(id), ...patch } });
  /** Switching on a change whose default is 0 starts it at MANUAL_START, so switching on always shows something. */
  const switched = (s: SimSetting, on: boolean): SimSetting =>
    on && !s.on && s.value === 0 && s.left === 0
      ? { ...s, on, value: MANUAL_START, left: MANUAL_START, mirror: true }
      : { ...s, on };
  /** Codes switched on or off by the doctor: kept here at once and written straight away. */
  const writeCodeOn = (patch: Partial<Record<MdCode, boolean>>) => {
    setCodeOnState((old) => ({ ...old, ...patch }));
    void setCodeOn(caseId, patch);
  };
  /** A family switched on with none of its codes on switches all of them on, so it always shows something. */
  const familyCodesOn = (family: MdFamily) => {
    const own = codesOf(family);
    if (!own.some((c) => codeOn[c] ?? MD_CODE_INFO[c].starts)) writeCodeOn(Object.fromEntries(own.map((c) => [c, true])));
  };
  const toggle = (id: Key) => {
    const s = settingOf(id);
    if (isMdCode(id)) {
      // A code is on when its family is on too: switching a code on switches its family on as well.
      if (s.on) return writeCodeOn({ [id]: false });
      writeCodeOn({ [id]: true });
      const family = MD_CODE_INFO[id].family;
      const f = settingOf(family);
      if (!f.on) write({ [family]: switched(f, true) });
      else if (s.value === 0 && s.left === 0) write({ [id]: { ...s, value: MANUAL_START, left: MANUAL_START, mirror: true } });
      return;
    }
    if (isMdFamily(id) && !s.on) familyCodesOn(id);
    write({ [id]: switched(s, !s.on) });
  };
  const setAll = (on: boolean) => {
    if (on) for (const f of shownFamilies) familyCodesOn(f);
    write(Object.fromEntries(ids.map((id) => [id, switched(settingOf(id), on)])));
  };
  const setSide = (id: Key, side: 'R' | 'L', v: number) =>
    update(id, side === 'R' ? { value: v, last: 'R' } : { left: v, last: 'L' });
  /** The side moved last is the one the doctor means; mirroring and matching copy it to the other side. */
  const lastValue = (c: SimSetting) => (c.last === 'L' ? c.left : c.value);
  const setMirror = (id: Key, mirror: boolean) => {
    const c = settingOf(id);
    const v = mirror ? lastValue(c) : c.value;
    update(id, { mirror, value: v, left: mirror ? v : c.left });
  };
  const match = (id: Key) => {
    const c = settingOf(id);
    update(id, { value: lastValue(c), left: lastValue(c) });
  };
  const reset = () => {
    Object.values(timers.current).forEach((id) => window.clearTimeout(id));
    timers.current = {};
    setOverrides({});
    setSiteOverrides({});
    setCodeOnState({});
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
      mode,
      changes: [...concernIds, ...shownSites].filter((id) => settingOf(id).on),
    });
    setMessage(t.sim.saved);
  };

  const maxPercent = Math.round(MAX_INTENSITY * 100);
  const pct = (v: number) => Math.round(v * 100);
  const gradeText = (id: Key) => {
    if (isSite(id)) return null;
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
    // In mode B the MD Codes zones can be picked as well; the concerns hidden there cannot.
    const candidates: { key: Key; points: { x: number; y: number }[] }[] = [
      ...ready.outlines.filter((o) => concernIds.includes(o.concernId)).map((o) => ({ key: o.concernId as Key, points: o.points })),
      ...ready.zones.filter((z) => shownSites.includes(z.site)).map((z) => ({ key: z.site as Key, points: z.points })),
    ];
    const hit = candidates.filter((o) => pointInPolygon(p, o.points)).sort((a, b) => area(a.points) - area(b.points))[0];
    if (!hit) return;
    if (isMdCode(hit.key)) {
      const family = MD_CODE_INFO[hit.key].family;
      setOpen((old) => new Set([...old, family]));
    }
    setSelected(hit.key);
    // A code's row exists only once its family is open: scroll after that render.
    window.requestAnimationFrame(() => document.getElementById(`change-${hit.key}`)?.scrollIntoView({ block: 'nearest' }));
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

  /**
   * Treatment options of a concern (PRD F5.1, F5.3), in default order with «اول حمایت، بعد چین» (F5.6); the
   * contraindicated ones are left out here and shown on the plan page. Choosing one re-renders at once.
   */
  const midface = midfaceGradeOf(grades ?? []);
  const optionPicker = (id: ConcernId, option: TreatmentOption) => {
    const list = defaultOrder(id, midface).filter(allowed);
    const name = t.concerns[id];
    return (
      <div className="mt-2" data-option={option.id}>
        {list.length > 1 && (
          <div role="radiogroup" aria-label={`${t.options.option}: ${name}`} className="flex flex-wrap gap-1.5">
            {list.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={o.id === option.id}
                aria-label={t.options.choose(bi({ fa: o.nameFa, en: o.nameEn }), name)}
                onClick={() => {
                  setMessage(null);
                  void setOption(caseId, id, o.id);
                }}
                className={`min-h-touch rounded-md border px-2.5 text-caption ${
                  o.id === option.id ? 'border-primary bg-primary-tint font-semibold text-primary-on-tint' : 'border-border text-ink'
                }`}
              >
                {bi({ fa: o.nameFa, en: o.nameEn })}
              </button>
            ))}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-ink-2">
          {list.length <= 1 && <span>{bi({ fa: option.nameFa, en: option.nameEn })}</span>}
          <span>{t.options.cap(num(pct(option.fx.maxStrength)))}</span>
          {option.status === 'draft' && (
            <span className="inline-flex items-center rounded-md bg-draft-bg px-2 py-0.5 text-[12px] text-draft-fg">{t.options.unverified}</span>
          )}
        </div>
      </div>
    );
  };

  /** One slider row: a concern, or an MD Codes family or code in mode B. */
  const row = (id: Key) => {
      const s = settingOf(id);
      const name = nameOf(id);
      const sides = isMdFamily(id) ? familyBilateral(id) : isMdCode(id) ? MD_CODE_INFO[id].bilateral : ready!.bilateral.includes(id);
      const code = isMdCode(id);
      const family = isMdFamily(id) ? id : null;
      const familyCodes = family ? shownSites.filter((c) => MD_CODE_INFO[c].family === family) : [];
      const expanded = !!family && open.has(family);
      const apart = sides && !s.mirror;
      const graded = gradeText(id);
      const manual = isSite(id) ? !!siteOverrides[id] : !!overrides?.[id];
      const option = isSite(id) ? null : (options?.[id] ?? null);
      const max = option ? pct(option.fx.maxStrength) : maxPercent;
      const slider = (value: number, aria: string, onChange: (v: number) => void) => (
        <input
          type="range"
          min={0}
          max={max}
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
          className={`rounded-md border px-3 py-2 ${code ? 'ms-4' : ''} ${selected === id ? 'border-primary' : s.on ? 'border-border' : 'border-border/50'} ${s.on ? 'bg-surface' : ''}`}
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
          {code && (
            // M7: approximate range per code (0 to the bolus cap × slider) and the warning codes (PRD F6.2).
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-caption" data-code-range={s.on ? codeRange(id, s.value).max : 0}>
              {s.on && (
                <Tag>
                  <bdi>
                    {apart
                      ? `${t.est.right} ${t.est.codeRange(t.options.range(num(0), num(codeRange(id, s.value).max, 1)))} · ${t.est.left} ${t.est.codeRange(t.options.range(num(0), num(codeRange(id, s.left).max, 1)))}`
                      : `${t.est.codeRange(t.options.range(num(0), num(codeRange(id, s.value).max, 1)))} ${MD_CODE_INFO[id].bilateral ? t.options.perSide : ''}`}
                  </bdi>
                </Tag>
              )}
              {s.on && (
                <span className="inline-flex items-center rounded-md bg-draft-bg px-2 py-0.5 text-[12px] text-draft-fg">{t.options.unverified}</span>
              )}
              {WARNING_CODES.has(id) && (
                <span data-warning-code={id}>
                  <Tag tone="danger">{t.est.warning}</Tag>
                </span>
              )}
            </div>
          )}
          {option && !isSite(id) && optionPicker(id, option)}
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
          {family && familyCodes.length > 0 && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`codes-${family}`}
              onClick={() =>
                setOpen((old) => {
                  const next = new Set(old);
                  if (!next.delete(family)) next.add(family);
                  return next;
                })
              }
              className="mt-1 flex min-h-touch w-full items-center justify-between rounded-md border border-border px-2.5 text-caption text-ink-2"
            >
              <span>{t.sim.codesOf(family, num(familyCodes.length), num(familyCodes.filter((c) => settingOf(c).on).length))}</span>
              <span aria-hidden>{expanded ? '−' : '+'}</span>
            </button>
          )}
          {(id === 'lip-volume' || id === 'Lp') && (
            <div className="mt-2" role="radiogroup" aria-label={t.sim.lipType} data-lip-fullness={ready?.lipFullness.toFixed(3)}>
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-caption text-ink-2">
                <span>{t.sim.lipType}</span>
                {LIP_TYPE_SETTINGS.status === 'draft' && (
                  <span className="inline-flex items-center rounded-md bg-draft-bg px-2 py-0.5 text-[12px] text-draft-fg">
                    {t.grading.unverified}
                  </span>
                )}
              </div>
              <div className="flex gap-1.5">
                {LIP_TYPES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={lipType === n}
                    aria-label={t.sim.lipTypeOf(num(n), t.sim.lipTypes[n])}
                    onClick={() => void setLipType(caseId, n)}
                    className={`flex h-11 min-w-11 flex-1 items-center justify-center rounded-md border text-control ${
                      lipType === n
                        ? 'border-primary bg-primary-tint font-semibold text-primary-on-tint'
                        : 'border-border text-ink'
                    } ${suggestedLip === n ? 'underline decoration-primary decoration-2 underline-offset-4' : ''}`}
                  >
                    <bdi>{num(n)}</bdi>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-caption text-muted">
                {t.sim.lipTypes[lipType]}
                {suggestedLip !== null && ` · ${t.sim.lipSuggested(num(suggestedLip))}`}
              </p>
            </div>
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
  };


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
                {rect && ready && mode === 'mdcodes' && sites && (
                  // PRD F6.1: an approximate shaded zone with the code name for each filled site; no point, depth or tool.
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox={`0 0 ${rect.width} ${rect.height}`}
                    preserveAspectRatio="none"
                    aria-hidden
                    data-md-zones={ready.zones.filter((z) => filled(z.site, z.side)).length}
                  >
                    {ready.zones
                      .filter((z) => filled(z.site, z.side))
                      .map((z) => {
                        const c = centreOf(z.points);
                        return (
                          <g key={`${z.site}:${z.side}`}>
                            <polygon points={pointsAttr(z.points)} className="fill-primary/15 stroke-primary/50" strokeWidth={Math.max(1, rect.width / 400)} />
                            <text
                              x={c.x}
                              y={c.y}
                              textAnchor="middle"
                              dominantBaseline="central"
                              className="fill-ink font-semibold"
                              style={{ fontSize: Math.max(10, rect.width / 34) }}
                            >
                              {z.site}
                            </text>
                          </g>
                        );
                      })}
                  </svg>
                )}
                {rect && ready && selected && (
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox={`0 0 ${rect.width} ${rect.height}`}
                    preserveAspectRatio="none"
                    aria-hidden
                    data-selected={selected}
                  >
                    {(isSite(selected)
                      ? ready.zones.filter((z) => z.site === selected || MD_CODE_INFO[z.site].family === selected)
                      : ready.outlines.filter((o) => o.concernId === selected)
                    ).map((o) => (
                      <polygon
                        key={`${'site' in o ? o.site : o.concernId}:${o.side}`}
                        points={pointsAttr(o.points)}
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
            {mode === 'mdcodes' && <p className="mt-1 text-caption text-ink-2">{t.sim.mdDisclaimer}</p>}
          </div>

          <aside className="lg:sticky lg:top-[85px] lg:max-h-[calc(100vh-101px-var(--tabbar-h))] lg:overflow-y-auto lg:pe-1">
            {/* Volume mode (M5b): exactly one is on, so no area gets volume twice. */}
            <div role="radiogroup" aria-label={t.sim.modeLabel} className="mb-3 grid grid-cols-2 gap-1.5">
              {(['area', 'mdcodes'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => {
                    setSelected(null);
                    void setSimMode(caseId, m);
                  }}
                  className={`min-h-touch rounded-md border px-2 py-1.5 text-control ${
                    mode === m ? 'border-primary bg-primary-tint font-semibold text-primary-on-tint' : 'border-border text-ink'
                  }`}
                >
                  {t.sim.modes[m]}
                </button>
              ))}
            </div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-section font-semibold text-primary-on-tint">{t.sim.changes}</h2>
              <Button onClick={() => setAll(!anyOn)}>{anyOn ? t.sim.allOff : t.sim.allOn}</Button>
            </div>
            <p className="mb-2 text-caption text-muted">{t.sim.tapHint}</p>
            {mode === 'mdcodes' && <h3 className="mb-1 text-control font-semibold text-ink-2">{t.sim.smoothingGroup}</h3>}
            <ul className="flex flex-col gap-1.5">{concernIds.map(row)}</ul>
            {mode === 'mdcodes' && (
              <>
                <h3 className="mb-1 mt-3 text-control font-semibold text-ink-2" dir="auto">
                  {t.sim.mdGroup}
                </h3>
                <p className="mb-1 text-caption text-muted">{t.sim.mdNote}</p>
                <p className="mb-2 flex flex-wrap items-center gap-1.5 text-caption text-muted">
                  <span className="inline-flex items-center rounded-md bg-draft-bg px-2 py-0.5 text-[12px] text-draft-fg">{t.grading.unverified}</span>
                  <span dir="ltr">{t.sim.mdSource(MD_CODES_SOURCE)}</span>
                </p>
                {offFamilies.length > 0 && (
                  <p className="mb-2 text-caption text-ink-2" data-families-off={offFamilies.join(',')}>
                    {t.est.nonFiller(offFamilies.map((f) => nameOf(f)).join('، '))}
                  </p>
                )}
                <ul className="flex flex-col gap-1.5">
                  {shownFamilies.flatMap((f) => [
                    row(f),
                    ...(open.has(f) ? shownSites.filter((c) => MD_CODE_INFO[c].family === f).map(row) : []),
                  ])}
                </ul>
              </>
            )}
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
