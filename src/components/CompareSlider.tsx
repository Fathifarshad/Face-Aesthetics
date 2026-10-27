import { useState } from 'react';
import { useObjectUrl } from '../lib/hooks';

/** Before/after slider: drag to reveal the right image over the left. */
export function CompareSlider({ left, right, leftLabel, rightLabel }: { left: Blob; right: Blob; leftLabel: string; rightLabel: string }) {
  const a = useObjectUrl(left);
  const b = useObjectUrl(right);
  const [pos, setPos] = useState(50);
  if (!a || !b) return null;
  return (
    <div className="select-none">
      <div className="relative overflow-hidden rounded-xl border border-border" dir="ltr">
        <img src={a} alt={leftLabel} className="block h-auto w-full" />
        <img src={b} alt={rightLabel} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-gold" style={{ left: `${pos}%` }} />
        <span className="absolute left-2 top-2 rounded bg-bg/80 px-2 py-0.5 text-[12px]">{leftLabel}</span>
        <span className="absolute right-2 top-2 rounded bg-bg/80 px-2 py-0.5 text-[12px] text-gold-ink">{rightLabel}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        className="mt-2 w-full"
        aria-label={`${leftLabel} / ${rightLabel}`}
        dir="ltr"
      />
    </div>
  );
}

export function SideBySide({ left, right, leftLabel, rightLabel }: { left: Blob; right: Blob; leftLabel: string; rightLabel: string }) {
  const a = useObjectUrl(left);
  const b = useObjectUrl(right);
  return (
    <div className="grid grid-cols-2 gap-2" dir="ltr">
      {[
        [a, leftLabel],
        [b, rightLabel],
      ].map(([u, l]) => (
        <figure key={l} className="overflow-hidden rounded-xl border border-border">
          {u && <img src={u} alt={l ?? ''} className="block h-auto w-full" />}
          <figcaption className="px-2 py-1 text-center text-[12px] text-ink-secondary">{l}</figcaption>
        </figure>
      ))}
    </div>
  );
}
