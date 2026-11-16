import type { Modality, TreatmentOption } from '../../data/treatmentOptions';
import type { ConcernId } from '../../data/types';
import type { Area, Modality as V1Modality } from '../../plan/data/treatments';
import { hardBlocks, softFlags, type BlockCode, type FlagCode, type Screened } from '../../plan/engine';
import type { Intake } from '../../plan/intake';

/**
 * The intake checks of the v1 kit (pregnancy, active infection, allergy as hard blocks; anticoagulants, herpes,
 * keloid, prior filler, Fitzpatrick and the rest as warnings) applied to the M6 options, so nothing the v1 plan
 * page protected is lost. The rules stay in src/plan/engine.ts; this file only maps the new fields onto them.
 */
const MODALITY: Record<Modality, V1Modality> = {
  toxin: 'toxin',
  filler: 'HA',
  skinbooster: 'skinbooster',
  polynucleotide: 'skinbooster',
  biostimulator: 'biostimulator',
  thread: 'thread',
  'rf-microneedling': 'device',
  hifu: 'device',
  laser: 'laser',
  peel: 'peel',
};

const AREA: Record<ConcernId, Area> = {
  'forehead-lines': 'forehead',
  'glabellar-lines': 'glabella',
  'crows-feet': 'periorbital',
  'tear-trough': 'periorbital',
  'midface-volume': 'midface',
  'nasolabial-fold': 'midface',
  marionette: 'perioral',
  'lip-volume': 'lips',
  'perioral-lines': 'perioral',
  chin: 'chin',
  jawline: 'jaw',
  masseter: 'jaw',
  temple: 'temple',
  brow: 'forehead',
  neck: 'neck',
  'skin-quality': 'skin',
};

export function screenedOf(o: TreatmentOption): Screened {
  return {
    modality: MODALITY[o.modality],
    // The cheek-support option works on the cheek, not on the fold it supports.
    area: o.support ? 'midface' : AREA[o.concernId],
    productClass: o.modality === 'rf-microneedling' ? 'RF microneedling' : o.modality,
    riskTags: [
      ...(o.risks.includes('vascular') ? (['high-risk-vascular'] as const) : []),
      ...(o.risks.includes('fitzpatrick') ? (['fitzpatrick-caution'] as const) : []),
    ],
  };
}

export function screen(o: TreatmentOption, intake: Intake): { blocks: BlockCode[]; flags: FlagCode[] } {
  const s = screenedOf(o);
  return { blocks: hardBlocks(s, intake), flags: softFlags(s, intake) };
}
