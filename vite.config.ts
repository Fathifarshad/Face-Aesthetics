/// <reference types="vitest/config" />
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    ...(mode === 'https' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Tanasob — Face Aesthetic Analysis',
        short_name: 'Tanasob',
        description: 'Measured aesthetic analysis and treatment planning',
        lang: 'fa',
        dir: 'rtl',
        theme_color: '#0A0A0B',
        background_color: '#0A0A0B',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,wasm,task}'],
        globIgnores: ['**/vision_wasm_module_internal.*', '**/vision_wasm_nosimd_internal.*'],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: { include: ['src/analysis/**', 'src/plan/**'], exclude: ['src/analysis/landmarker.ts'] },
  },
}));
