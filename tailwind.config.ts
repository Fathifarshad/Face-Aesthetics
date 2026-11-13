import type { Config } from 'tailwindcss';

/** Colours are read from the CSS variables in src/styles.css (docs/BRAND.md §3). No hex values here. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        track: token('track'),
        border: token('border'),
        ink: { DEFAULT: token('ink'), 2: token('ink-2') },
        muted: token('muted'),
        line: token('line'),
        primary: {
          DEFAULT: token('primary'),
          hover: token('primary-hover'),
          deep: token('primary-deep'),
          tint: token('primary-tint'),
          'on-tint': token('primary-on-tint'),
        },
        'on-primary': token('on-primary'),
        priority: { DEFAULT: token('priority'), strong: token('priority-strong') },
        risk: { bg: token('risk-bg'), fg: token('risk-fg') },
        danger: token('danger'),
        ok: token('ok'),
        draft: { bg: token('draft-bg'), fg: token('draft-fg') },
        photo: token('photo'),
        paper: {
          DEFAULT: token('paper'),
          2: token('paper-2'),
          ink: token('paper-ink'),
          muted: token('paper-muted'),
          border: token('paper-border'),
        },
      },
      borderRadius: { tag: '6px', sm: '10px', md: '12px', lg: '14px', card: '14px', photo: '18px', xl: '20px', pill: '999px' },
      fontFamily: { sans: ['"Vazirmatn Variable"', 'Vazirmatn', 'Tahoma', 'sans-serif'] },
      fontSize: {
        label: '11px',
        caption: '12px',
        control: '13px',
        body: '14px',
        section: '15px',
        cta: '16px',
        title: '18px',
      },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
    },
  },
  plugins: [],
} satisfies Config;
