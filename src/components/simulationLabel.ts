import { cssToken } from '../lib/tokens';

/**
 * Burns the fixed simulation label into the bottom of a canvas (hard rule 7, docs/BRAND.md §6): every
 * simulated image carries it, on screen and in anything exported from that canvas. It cannot be turned off.
 */
export function burnSimulationLabel(ctx: CanvasRenderingContext2D, text: string): void {
  const { width, height } = ctx.canvas;
  // 11 px on a 390 px wide phone screen, scaled with the canvas so it stays readable when the image is shown smaller or larger.
  const font = Math.max(11, Math.round((width * 11) / 390));
  const bar = Math.round(font * 2.2);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = cssToken('bg', 0.72);
  ctx.fillRect(0, height - bar, width, bar);
  ctx.fillStyle = cssToken('paper');
  ctx.font = `600 ${font}px Vazirmatn, Tahoma, sans-serif`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height - bar / 2, width - font);
  ctx.restore();
}

/** Height of the label bar for a canvas of the given width, in canvas pixels. */
export const simulationLabelHeight = (width: number): number => Math.round(Math.max(11, Math.round((width * 11) / 390)) * 2.2);
