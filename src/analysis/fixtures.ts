import { rotate } from './geometry';
import type { Point } from './types';

/**
 * Synthetic frontal face (1000×1000 px), symmetric about x = 500, eyes level at y = 400.
 * Known geometry: thirds 1.0, fifths all 1.0, intercanthal 1.0, nose 1.0, lips 1:1.6,
 * iris diameter 23.4 px → 0.5 mm/px, canthal tilt atan(6/60).
 */
export function syntheticFace(): Point[] {
  const p: Point[] = Array.from({ length: 478 }, () => ({ x: 500, y: 500 }));
  const set = (i: number, x: number, y: number) => (p[i] = { x, y });
  const pair = (r: number, l: number, x: number, y: number) => {
    set(r, x, y);
    set(l, 1000 - x, y);
  };
  set(9, 500, 300); // glabella
  set(168, 500, 330); // soft nasion
  set(1, 500, 450); // pronasale
  set(2, 500, 500); // subnasale
  set(0, 500, 540); // labrale superius
  set(13, 500, 560); // stomion upper
  set(14, 500, 562); // stomion lower
  set(17, 500, 594); // labrale inferius
  set(152, 500, 700); // menton
  set(10, 500, 200);
  pair(33, 263, 410, 394); // exocanthion
  pair(133, 362, 470, 400); // endocanthion
  pair(234, 454, 350, 420); // zygion
  pair(172, 397, 380, 640); // gonion
  pair(129, 358, 470, 490); // alar
  pair(61, 291, 452, 561); // cheilion
  // iris R centre (440,400), L (560,400); radius 11.7
  set(468, 440, 400);
  set(469, 451.7, 400);
  set(470, 440, 388.3);
  set(471, 428.3, 400);
  set(472, 440, 411.7);
  set(473, 560, 400);
  set(474, 548.3, 400);
  set(475, 560, 388.3);
  set(476, 571.7, 400);
  set(477, 560, 411.7);
  const browR: [number, number, number][] = [
    [70, 395, 360],
    [63, 415, 352],
    [105, 435, 350],
    [66, 455, 352],
    [107, 470, 356],
  ];
  const browL = [300, 293, 334, 296, 336];
  browR.forEach(([i, x, y], k) => {
    set(i, x, y);
    set(browL[k]!, 1000 - x, y);
  });
  return p;
}

export function rotated(points: readonly Point[], deg: number): Point[] {
  return points.map((q) => rotate(q, { x: 500, y: 400 }, deg));
}
