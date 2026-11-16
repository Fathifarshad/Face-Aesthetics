/// <reference types="vitest/config" />
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_NAME } from './src/app/config';

export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    { name: 'app-name', transformIndexHtml: (html: string) => html.replaceAll('%APP_NAME%', APP_NAME.fa) },
    ...(mode === 'https' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: `${APP_NAME.en} — Face Aesthetic Simulation & Planning`,
        short_name: APP_NAME.en,
        description: 'Aesthetic analysis, simulation and treatment planning for physicians',
        lang: 'fa',
        dir: 'rtl',
        theme_color: '#0A0A0B',
        background_color: '#0A0A0B',
        display: 'standalone',
        start_url: './',
        scope: './',
        // PNG icons come from public/icon.svg (scripts/make-icons.mjs); Android and iOS need them to install.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Everything the app needs offline: code, fonts, icons, the MediaPipe WASM and the face model.
        // PNG only for the app icons, so a picture dropped into public/ later is never precached by accident.
        globPatterns: ['**/*.{js,css,html,svg,woff2,wasm,task}', 'icon-*.png', 'apple-touch-icon.png'],
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
