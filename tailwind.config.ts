import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0A0A0B',
        surface: '#141416',
        'surface-2': '#1C1C20',
        border: '#2C2A26',
        ink: '#F4EFE4',
        'ink-secondary': '#B5AE9F',
        'ink-tertiary': '#8C8577',
        gold: {
          DEFAULT: '#D4AF37',
          hover: '#E6C65C',
          deep: '#A8862A',
          tint: '#2A2414',
          ink: '#F1D98A',
        },
        warn: { bg: '#3A2A10', ink: '#F5C26B' },
        priority: '#F08A4B',
        danger: '#F0524F',
        ok: '#7FD6A0',
      },
      borderRadius: { sm: '10px', md: '12px', lg: '14px', xl: '20px' },
      fontFamily: { sans: ['"Vazirmatn Variable"', 'Vazirmatn', 'Tahoma', 'sans-serif'] },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
    },
  },
  plugins: [],
} satisfies Config;
