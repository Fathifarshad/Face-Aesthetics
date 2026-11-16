import { useEffect, useState } from 'react';
import { alignTransform } from '../../capture/align';
import { CompareSlider } from '../../components/CompareSlider';
import { Notice } from '../../components/ui';
import type { Photo, Simulation } from '../../db/types';
import { useT } from '../../i18n';
import { cssToken } from '../../lib/tokens';

/** The "after" photo drawn into the "before" photo's frame, eye corners on eye corners (PRD F8.5). */
async function alignedAfter(before: Photo, after: Photo): Promise<Blob | null> {
  const m = alignTransform(before, after);
  if (!m) return null;
  const canvas = document.createElement('canvas');
  canvas.width = before.width;
  canvas.height = before.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = cssToken('photo');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const bmp = await createImageBitmap(after.blob);
  ctx.setTransform(...m);
  ctx.drawImage(bmp, 0, 0, after.width, after.height);
  bmp.close();
  return new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.92));
}

/**
 * Simulation against the real result, to judge how close the simulation came (PRD F8.5). The simulation is
 * drawn on the frontal "before" photo, so the frontal "after" photo is aligned to that photo first.
 */
export function SimVsReal({ before, after, sim }: { before?: Photo; after?: Photo; sim?: Simulation }) {
  const t = useT();
  const [real, setReal] = useState<Blob | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setReal(undefined);
    if (before && after) void alignedAfter(before, after).then((b) => live && setReal(b));
    else setReal(null);
    return () => {
      live = false;
    };
  }, [before, after]);

  if (!sim || real === null) return <Notice>{t.compare.simVsRealNeed}</Notice>;
  if (real === undefined) return null;
  return (
    <div data-sim-vs-real>
      <CompareSlider left={sim.blob} right={real} leftLabel={t.compare.simulation} rightLabel={t.compare.real} />
      <p className="mt-2 text-[12px] text-ink-2">{t.compare.simVsRealNote}</p>
    </div>
  );
}
