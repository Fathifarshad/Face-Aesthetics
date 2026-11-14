/**
 * Reads a design token (src/styles.css :root, docs/BRAND.md §3) for places CSS classes cannot reach:
 * canvas drawing and inline SVG paint. Never write colour literals in components.
 */
export type Token =
  | 'bg'
  | 'surface'
  | 'ink'
  | 'muted'
  | 'line'
  | 'primary'
  | 'primary-on-tint'
  | 'priority'
  | 'priority-strong'
  | 'danger'
  | 'ok'
  | 'mark'
  | 'paper'
  | 'paper-ink'
  | 'risk-fg'
  | `region-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

/** Canvas colour string for a token, resolved at call time. */
export function cssToken(name: Token, alpha = 1): string {
  const channels = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return alpha >= 1 ? `rgb(${channels})` : `rgb(${channels} / ${alpha})`;
}

/** Paint value for SVG `stroke` / `fill` attributes (resolved by the browser). */
export const svgToken = (name: Token): string => `rgb(var(--${name}))`;
