export type Point = { x: number; y: number; z?: number };

/** Pixel-space landmarks (478 points when iris refinement is available). */
export type Landmarks = readonly Point[];

export type Pose = { yaw: number; pitch: number; roll: number };

export type Severity = 0 | 1 | 2 | 3 | 4;

export type FindingSource = 'auto' | 'semi' | 'clinician';
export type FindingStatus = 'pending' | 'confirmed' | 'edited' | 'rejected';
export type FindingTab = 'proportions' | 'volume' | 'dynamics' | 'skin' | 'lips';

export type Finding = {
  key: string;
  tab: FindingTab;
  value: number | null;
  /** Pre-formatted value for multi-part metrics (e.g. fifths). */
  display?: string;
  unit: string;
  reference: string;
  deviation: number | null;
  severitySuggested: Severity | null;
  severity: Severity | null;
  confidence: number | 'manual';
  source: FindingSource;
  scaleName?: string;
  status: FindingStatus;
  note?: string;
  /** Treatment-knowledge-base finding keys this measurement feeds. */
  planKeys: string[];
};

export type LuminanceSampler = (x: number, y: number) => number;
