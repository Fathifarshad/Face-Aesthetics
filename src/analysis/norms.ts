/**
 * Default reference ranges (docs/ANALYSIS_SPEC.md §4). Editable by the clinical lead.
 * TODO(clinical): every tolerance below is a placeholder default; references come from the spec.
 * Nothing here is reviewed until `reviewed` is true. These are proportion deviations, NOT validated clinical scales.
 */
export type Norm = {
  /** Ideal value (point reference). */
  reference?: number;
  /** Acceptable band; deviation is measured from its nearest edge. */
  range?: readonly [number, number];
  /** Deviation unit used for severity: d = |value − reference| / tolerance. */
  tolerance: number;
  referenceLabel: string;
  unit: string;
  descriptive?: boolean;
  reviewed: boolean;
};

export const NORMS = {
  'thirds.middleToLower': { reference: 1, tolerance: 0.08, referenceLabel: '≈ 1.0', unit: '', reviewed: false },
  'lowerFace.ratio': { reference: 0.5, tolerance: 0.06, referenceLabel: '≈ 1 : 2', unit: '', reviewed: false },
  fifths: { reference: 0, tolerance: 0.1, referenceLabel: 'each ≈ 1.0', unit: '', reviewed: false },
  'intercanthal.ratio': { reference: 1, tolerance: 0.1, referenceLabel: '≈ 1.0', unit: '', reviewed: false },
  'canthalTilt.R': { range: [4, 8], tolerance: 3, referenceLabel: '+4° … +8°', unit: '°', reviewed: false },
  'canthalTilt.L': { range: [4, 8], tolerance: 3, referenceLabel: '+4° … +8°', unit: '°', reviewed: false },
  'lips.upperToLower': { reference: 1 / 1.6, tolerance: 0.12, referenceLabel: '≈ 1 : 1.6', unit: '', reviewed: false },
  'mouth.width': { reference: 1, tolerance: 0.1, referenceLabel: '≈ medial limbus lines', unit: '', reviewed: false },
  'nose.width': { reference: 1, tolerance: 0.1, referenceLabel: '≈ 1.0', unit: '', reviewed: false },
  'faceShape.bizygomaticToBigonial': {
    tolerance: 1,
    referenceLabel: 'descriptive',
    unit: '',
    descriptive: true,
    reviewed: false,
  },
  'brow.asymmetry': { reference: 0, tolerance: 1.5, referenceLabel: 'R ≈ L', unit: 'mm', reviewed: false },
  'symmetry.brows': { reference: 0, tolerance: 4, referenceLabel: '< 4 %', unit: '%', reviewed: false },
  'symmetry.eyes': { reference: 0, tolerance: 4, referenceLabel: '< 4 %', unit: '%', reviewed: false },
  'symmetry.cheeks': { reference: 0, tolerance: 4, referenceLabel: '< 4 %', unit: '%', reviewed: false },
  'symmetry.mouth': { reference: 0, tolerance: 4, referenceLabel: '< 4 %', unit: '%', reviewed: false },
  'symmetry.jaw': { reference: 0, tolerance: 4, referenceLabel: '< 4 %', unit: '%', reviewed: false },
} as const satisfies Record<string, Norm>;

export type MetricId = keyof typeof NORMS;

/**
 * Heuristic image proxies used only to PRE-SELECT a clinician grade (docs/ANALYSIS_SPEC.md §6).
 * Uncalibrated. TODO(clinical): tune on consenting test photos; the doctor always decides.
 * Thresholds are the lower bounds for grades 1, 2, 3, 4.
 */
export const PROXY_THRESHOLDS = {
  /** Relative darkness of the region versus the reference cheek patch (0 = same brightness). */
  teartrough: [0.06, 0.11, 0.17, 0.24],
  nasolabial: [0.05, 0.1, 0.15, 0.21],
  marionette: [0.05, 0.1, 0.15, 0.21],
  /** Lip deficiency: 1 − (total red-lip height / mouth width) / LIP_FULLNESS_REFERENCE. */
  lipsVolume: [0.12, 0.25, 0.38, 0.5],
} as const;

/** TODO(clinical): reference total-lip-height to mouth-width ratio for the selected ethnic norm. */
export const LIP_FULLNESS_REFERENCE = 0.36;

export const ETHNIC_NORM_DEFAULT = 'middle-eastern';
