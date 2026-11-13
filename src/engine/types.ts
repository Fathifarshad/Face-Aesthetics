/**
 * Contracts of the image engine (docs/PRD.md §5.4, prompts/SUPERPROMPT.md "راهنمای فنی موتور تصویر").
 * The engine is pure TypeScript on ImageData: no React, and no DOM outside the worker entry.
 * Modules arrive per milestone: landmarks/faceFrame/regions (M1), masks/bands/pipeline.worker (M3), warp (M4).
 */
export type Pt = { x: number; y: number };

/**
 * Face coordinate frame. Origin = midpoint of the two outer eye corners (landmarks 33 and 263);
 * x runs along those two points, y is perpendicular toward the chin; unit = their distance in pixels.
 * All region geometry is defined in this frame, then converted to pixels.
 */
export interface FaceFrame {
  origin: Pt;
  xAxis: Pt;
  yAxis: Pt;
  unit: number;
}

/** Effect families of PRD §6: S = band smoothing, W = local warp. */
export type EffectKind = 'smooth' | 'warp';
