import type { Area } from './data/treatments';

/** Intake questionnaire keys (docs/SAFETY.md §2). */
export type Intake = {
  pregnant_or_breastfeeding: boolean;
  active_infection_site: Area[];
  allergy_lidocaine: boolean;
  allergy_ha_or_component: boolean;
  anticoagulants: boolean;
  autoimmune_disease: boolean;
  herpes_history: boolean;
  keloid_tendency: boolean;
  prior_filler: Area[];
  prior_threads: Area[];
  permanent_filler: Area[];
  recent_procedures_30d: boolean;
  isotretinoin_6m: boolean;
  bleeding_disorder: boolean;
  neuromuscular_disease: boolean;
  unrealistic_expectations_flag: boolean;
  /** Fitzpatrick I–VI as 1–6, null = not recorded. */
  fitzpatrick: number | null;
};

export const BOOLEAN_INTAKE_KEYS = [
  'pregnant_or_breastfeeding',
  'allergy_lidocaine',
  'allergy_ha_or_component',
  'anticoagulants',
  'bleeding_disorder',
  'autoimmune_disease',
  'herpes_history',
  'keloid_tendency',
  'recent_procedures_30d',
  'isotretinoin_6m',
  'neuromuscular_disease',
  'unrealistic_expectations_flag',
] as const satisfies readonly (keyof Intake)[];

export const AREA_INTAKE_KEYS = ['active_infection_site', 'prior_filler', 'prior_threads', 'permanent_filler'] as const;

export const emptyIntake = (): Intake => ({
  pregnant_or_breastfeeding: false,
  active_infection_site: [],
  allergy_lidocaine: false,
  allergy_ha_or_component: false,
  anticoagulants: false,
  autoimmune_disease: false,
  herpes_history: false,
  keloid_tendency: false,
  prior_filler: [],
  prior_threads: [],
  permanent_filler: [],
  recent_procedures_30d: false,
  isotretinoin_6m: false,
  bleeding_disorder: false,
  neuromuscular_disease: false,
  unrealistic_expectations_flag: false,
  fitzpatrick: null,
});
