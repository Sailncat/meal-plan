/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// `vite build --mode preview` makes a build for a private claude.ai preview page.
export default defineConfig(({ mode }) => ({
  // Relative paths, so the same build works on GitHub Pages (under /meal-plan/) and in previews.
  base: './',
  resolve: {
    alias:
      mode === 'preview' ? [{ find: /^\.\/fonts$/, replacement: fileURLToPath(new URL('./src/fonts.preview.ts', import.meta.url)) }] : [],
  },
  build: { outDir: mode === 'preview' ? 'dist-preview' : 'dist' },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registered in main.ts, where failures are caught
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Meal plan',
        short_name: 'Meal plan',
        description: 'Plan your week of meals, macros and meal prep.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#EFE9DF',
        theme_color: '#8E2433',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // woff2 only (every browser with offline support reads it), and only the Latin subsets the app uses.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/*vietnamese*'],
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
}));
