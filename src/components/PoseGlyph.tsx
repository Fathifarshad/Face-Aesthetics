import type { ViewDef } from '../capture/views';

/** Line-art illustration of the target head pose and expression for a capture view. */
export function PoseGlyph({ view, size = 72 }: { view: ViewDef; size?: number }) {
  const stroke = '#D4AF37';
  const soft = '#8C8577';
  const common = { fill: 'none', stroke, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const id = view.id;

  if (id === 'profile-r' || id === 'profile-l') {
    const flip = id === 'profile-l' ? 'scale(-1,1) translate(-80,0)' : undefined;
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden>
        <g transform={flip}>
          <path {...common} d="M44 10c-14 0-24 10-24 26 0 9 3 15 8 20v14h20V60c4 0 8-3 9-7l1-6 5-2-4-6 2-3c-2-14-6-26-17-26z" />
          <circle cx="47" cy="31" r="1.6" fill={stroke} />
          <path d="M28 40c3 2 3 6 0 8" fill="none" stroke={soft} strokeWidth="1.6" />
        </g>
      </svg>
    );
  }

  if (id === 'submental') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden>
        <ellipse {...common} cx="40" cy="30" rx="18" ry="16" />
        <path {...common} d="M28 42c4 10 20 10 24 0M30 46v20M50 46v20" />
        <path d="M62 30c4-8 2-16-4-20M58 10l-1 5 5-1" fill="none" stroke={soft} strokeWidth="1.8" strokeLinecap="round" />
        <path {...common} d="M20 74h40" stroke={soft} />
      </svg>
    );
  }

  const yawShift = id === 'oblique-r' ? -7 : id === 'oblique-l' ? 7 : 0;
  const browY = view.expression === 'brows' ? 25 : 30;
  const browTilt = view.expression === 'frown' ? 3 : 0;
  const mouth =
    view.expression === 'smile'
      ? 'M31 55c4 6 14 6 18 0'
      : view.expression === 'pursed'
        ? ''
        : view.expression === 'clench'
          ? 'M31 55h18M34 53v4M38 53v4M42 53v4M46 53v4'
          : 'M33 56h14';
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden>
      <ellipse {...common} cx="40" cy="40" rx={yawShift ? 19 : 22} ry="28" />
      <g transform={`translate(${yawShift},0)`}>
        <path {...common} d={`M27 ${browY + browTilt}l9 ${-browTilt}M44 ${browY}l9 ${browTilt}`} />
        <circle cx="32" cy="36" r="1.8" fill={stroke} />
        <circle cx="48" cy="36" r="1.8" fill={stroke} />
        <path d="M40 38v9l-3 2" fill="none" stroke={soft} strokeWidth="1.6" strokeLinecap="round" />
        {mouth ? <path {...common} d={mouth} /> : <circle {...common} cx="40" cy="56" r="3" />}
      </g>
      {view.expression === 'clench' && <path d="M30 70v8M50 70v8M36 70l-2 8M44 70l2 8" fill="none" stroke={soft} strokeWidth="1.6" />}
      {view.id === 'frontal' && <path d="M40 4v6M40 70v6" stroke={soft} strokeWidth="1.4" strokeDasharray="2 2" />}
    </svg>
  );
}
