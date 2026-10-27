import { dist, lerp, midpoint } from './geometry';
import { LM } from './landmarks';
import type { Landmarks, Point } from './types';

export type ZoneId =
  | 'forehead'
  | 'glabella'
  | 'temple'
  | 'brow'
  | 'crowsfeet'
  | 'cheek'
  | 'teartrough'
  | 'nasolabial'
  | 'lips'
  | 'marionette'
  | 'jawline'
  | 'chin';

export type Zone = { id: ZoneId; side: 'R' | 'L' | 'M'; center: Point; rx: number; ry: number };

/** Generic anatomical zones (not MD Codes points) placed from landmarks. */
export function zonesFromLandmarks(lm: Landmarks): Zone[] {
  const P = (i: number) => lm[i]!;
  const s = dist(P(LM.glabella), P(LM.menton));
  const midX = (P(LM.glabella).x + P(LM.menton).x) / 2;
  const out = (p: Point, k: number): Point => ({ x: p.x + (p.x < midX ? -1 : 1) * k * s, y: p.y });
  const z: Zone[] = [
    { id: 'forehead', side: 'M', center: lerp(P(LM.foreheadTop), P(LM.glabella), 0.45), rx: 0.26 * s, ry: 0.1 * s },
    { id: 'glabella', side: 'M', center: { x: P(LM.glabella).x, y: P(LM.glabella).y - 0.02 * s }, rx: 0.05 * s, ry: 0.05 * s },
    { id: 'lips', side: 'M', center: midpoint(P(LM.labraleSuperius), P(LM.labraleInferius)), rx: 0.11 * s, ry: 0.05 * s },
    { id: 'chin', side: 'M', center: lerp(P(LM.labraleInferius), P(LM.menton), 0.6), rx: 0.08 * s, ry: 0.06 * s },
  ];
  for (const side of ['R', 'L'] as const) {
    const r = side === 'R';
    const zyg = P(r ? LM.zygionR : LM.zygionL);
    const alar = P(r ? LM.alarR : LM.alarL);
    const exo = P(r ? LM.exocanthionR : LM.exocanthionL);
    const endo = P(r ? LM.endocanthionR : LM.endocanthionL);
    const cheil = P(r ? LM.cheilionR : LM.cheilionL);
    const gon = P(r ? LM.gonionR : LM.gonionL);
    const brow = (r ? LM.browR : LM.browL).map(P);
    const eyeC = midpoint(exo, endo);
    const eyeW = dist(exo, endo);
    z.push(
      { id: 'temple', side, center: { x: lerp(zyg, exo, 0.25).x, y: brow[0]!.y - 0.02 * s }, rx: 0.05 * s, ry: 0.07 * s },
      { id: 'brow', side, center: brow[1]!, rx: 0.06 * s, ry: 0.025 * s },
      { id: 'crowsfeet', side, center: out(exo, 0.04), rx: 0.035 * s, ry: 0.045 * s },
      { id: 'teartrough', side, center: { x: eyeC.x, y: eyeC.y + 0.5 * eyeW }, rx: 0.5 * eyeW, ry: 0.2 * eyeW },
      { id: 'cheek', side, center: { x: lerp(zyg, alar, 0.4).x, y: lerp(zyg, alar, 0.4).y - 0.03 * s }, rx: 0.08 * s, ry: 0.06 * s },
      { id: 'nasolabial', side, center: out(lerp(alar, cheil, 0.5), 0.02), rx: 0.03 * s, ry: 0.07 * s },
      { id: 'marionette', side, center: { x: out(cheil, 0.005).x, y: cheil.y + 0.07 * s }, rx: 0.03 * s, ry: 0.05 * s },
      { id: 'jawline', side, center: lerp(gon, P(LM.menton), 0.35), rx: 0.09 * s, ry: 0.04 * s },
    );
  }
  return z;
}

/** Finding key → zones for the heat-map overlay. */
export const FINDING_ZONES: Record<string, ZoneId[]> = {
  'temple.hollowing': ['temple'],
  'midface.volume': ['cheek'],
  teartrough: ['teartrough'],
  nasolabial: ['nasolabial'],
  marionette: ['marionette'],
  jowl: ['jawline'],
  'jawline.definition': ['jawline'],
  'masseter.hypertrophy': ['jawline'],
  'chin.retrusion': ['chin'],
  'chin.peaudorange': ['chin'],
  'lips.volume': ['lips'],
  'lines.perioral': ['lips'],
  'lines.forehead': ['forehead'],
  'lines.glabella': ['glabella'],
  'lines.crowsfeet': ['crowsfeet'],
  'brow.ptosis': ['brow'],
};

export type VesselPath = { id: string; points: Point[] };

/**
 * Approximate superficial vessel courses for a danger-zone overlay.
 * Educational guide only — real anatomy varies widely between individuals.
 */
export function vesselPaths(lm: Landmarks): VesselPath[] {
  const P = (i: number) => lm[i]!;
  const s = dist(P(LM.glabella), P(LM.menton));
  const midX = (P(LM.glabella).x + P(LM.menton).x) / 2;
  const paths: VesselPath[] = [];
  for (const side of ['R', 'L'] as const) {
    const r = side === 'R';
    const k = r ? -1 : 1;
    const gon = P(r ? LM.gonionR : LM.gonionL);
    const cheil = P(r ? LM.cheilionR : LM.cheilionL);
    const alar = P(r ? LM.alarR : LM.alarL);
    const endo = P(r ? LM.endocanthionR : LM.endocanthionL);
    const brow = (r ? LM.browR : LM.browL).map(P);
    const exo = P(r ? LM.exocanthionR : LM.exocanthionL);
    const notch = lerp(gon, P(LM.menton), 0.4);
    paths.push({
      id: `facial-${side}`,
      points: [
        { x: notch.x, y: notch.y + 0.01 * s },
        { x: cheil.x + k * 0.05 * s, y: cheil.y + 0.02 * s },
        { x: alar.x + k * 0.03 * s, y: alar.y },
        { x: endo.x + k * 0.005 * s, y: endo.y + 0.02 * s },
      ],
    });
    paths.push({ id: `supratrochlear-${side}`, points: [brow[4]!, { x: brow[4]!.x + k * 0.01 * s, y: brow[4]!.y - 0.22 * s }] });
    paths.push({ id: `supraorbital-${side}`, points: [brow[2]!, { x: brow[2]!.x + k * 0.03 * s, y: brow[2]!.y - 0.22 * s }] });
    paths.push({
      id: `temporal-${side}`,
      points: [
        { x: exo.x + k * 0.1 * s, y: exo.y + 0.03 * s },
        { x: exo.x + k * 0.11 * s, y: brow[0]!.y - 0.08 * s },
        { x: exo.x + k * 0.06 * s, y: brow[0]!.y - 0.2 * s },
      ],
    });
  }
  const cr = P(LM.cheilionR);
  const cl = P(LM.cheilionL);
  paths.push({ id: 'labial-sup', points: [cr, { x: midX, y: P(LM.stomionUpper).y - 0.012 * s }, cl] });
  paths.push({ id: 'labial-inf', points: [cr, { x: midX, y: P(LM.stomionLower).y + 0.015 * s }, cl] });
  paths.push({ id: 'dorsal-nasal', points: [P(LM.softNasion), P(LM.pronasale)] });
  return paths;
}

/** Infraorbital foramen approximation: below the pupil, ~0.7 eye widths under the eye centre. */
export function infraorbitalPoints(lm: Landmarks): Point[] {
  return (['R', 'L'] as const).map((side) => {
    const exo = lm[side === 'R' ? LM.exocanthionR : LM.exocanthionL]!;
    const endo = lm[side === 'R' ? LM.endocanthionR : LM.endocanthionL]!;
    const c = midpoint(exo, endo);
    return { x: c.x, y: c.y + 0.75 * dist(exo, endo) };
  });
}
