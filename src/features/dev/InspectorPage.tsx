import { useRef, useState } from 'react';
import { detectImage } from '../../analysis/landmarker';
import { LM } from '../../analysis/landmarks';
import type { Point } from '../../analysis/types';
import { FaceCanvas } from '../../components/FaceCanvas';
import { Button, Chip, Header, Notice, Page } from '../../components/ui';
import { useT } from '../../i18n';

/** M1 dev tool: draw detected landmarks to verify the named indices in src/analysis/landmarks.ts. */
export function InspectorPage() {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [lm, setLm] = useState<Point[] | null>(null);
  const [all, setAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (f: File) => {
    setError(null);
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    try {
      const d = await detectImage(c);
      setLm(d.landmarks);
    } catch (e) {
      setError(String(e));
    }
    c.toBlob((b) => b && setBlob(b), 'image/jpeg', 0.92);
  };

  return (
    <>
      <Header title={t.inspector.title} back />
      <Page>
        <p className="mb-3 text-[13px] text-ink-secondary">{t.inspector.hint}</p>
        <div className="mb-3 flex gap-2">
          <Button variant="gold" onClick={() => input.current?.click()}>
            {t.inspector.load}
          </Button>
          <Chip active={!all} onClick={() => setAll(false)}>
            {t.inspector.named}
          </Chip>
          <Chip active={all} onClick={() => setAll(true)}>
            {t.inspector.all}
          </Chip>
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
        {error && <Notice tone="danger">{error}</Notice>}
        {blob && <FaceCanvas blob={blob} landmarks={lm} overlay={{ landmarks: all ? 'all' : 'named', midline: true }} alt={t.inspector.title} />}
        {lm && (
          <table className="mt-3 w-full text-[12px]" dir="ltr">
            <tbody>
              {Object.entries(LM).map(([name, idx]) => (
                <tr key={name} className="border-t border-border">
                  <td className="py-1">{name}</td>
                  <td className="py-1 text-gold-ink">{Array.isArray(idx) ? idx.join(', ') : idx}</td>
                  <td className="py-1 text-ink-tertiary">
                    {(Array.isArray(idx) ? [idx[0]!] : [idx as number]).map((i) => `${lm[i]?.x.toFixed(0)}, ${lm[i]?.y.toFixed(0)}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Page>
    </>
  );
}
