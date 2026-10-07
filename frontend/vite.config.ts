import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const isTest = Boolean(process.env.VITEST);
/** Where /api is forwarded. The end-to-end run points this at its own API instance. */
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

const FEATURES = ['warnings', 'resources', 'hazard-reports', 'analytics'];
const FULL = { lines: 100, branches: 100, functions: 100, statements: 100 };

/** Source files of a feature, ignoring tests; empty until the owner adds the feature's code. */
const hasFeatureSource = (name: string): boolean => {
  const dir = here(`./src/features/${name}`);
  return (
    existsSync(dir) &&
    readdirSync(dir, { recursive: true }).some(
      (file) => /\.tsx?$/.test(String(file)) && !/\.test\./.test(String(file)),
    )
  );
};

/** Every use case must reach 100% (master plan §9); the gate is on as soon as a feature has code. */
const featureThresholds = Object.fromEntries(
  FEATURES.filter(hasFeatureSource).map((name) => [`src/features/${name}/**`, FULL]),
);

export default defineConfig({
  plugins: [
    react(),
    ...(isTest
      ? []
      : [
          tailwindcss(),
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'icons/*.png'],
            manifest: {
              name: 'Safe Zone',
              short_name: 'Safe Zone',
              description: 'Disaster alerts and coordination for Sri Lanka',
              theme_color: '#142848',
              background_color: '#142848',
              display: 'standalone',
              start_url: '/',
              icons: [
                { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                {
                  src: 'icons/maskable-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
              ],
            },
            workbox: {
              // The app shell is cached so the site opens offline; API data is cached by our own
              // IndexedDB layer (so it can be scoped per user and wiped on logout), never by the worker.
              navigateFallback: '/index.html',
              navigateFallbackDenylist: [/^\/api\//],
              // woff2: the self-hosted font, so text keeps its look offline.
              globPatterns: ['**/*.{js,css,html,woff2}'],
              runtimeCaching: [
                {
                  urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
                  handler: 'NetworkOnly',
                },
                {
                  // The photos on the landing and sign-in pages are large, so they are not precached;
                  // they are kept after the first visit so those pages still look right offline.
                  urlPattern: ({ url }) => url.pathname.startsWith('/images/'),
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'site-images',
                    expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                  },
                },
                {
                  urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\/.*/,
                  handler: 'StaleWhileRevalidate',
                  options: {
                    cacheName: 'map-tiles',
                    expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  },
                },
              ],
            },
          }),
        ]),
  ],
  build: {
    // The whole app shell is precached by the service worker, so one vendor-heavy chunk is fine.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // zod ships `@__PURE__` hints Rollup cannot place; harmless, and not ours to fix.
        if (warning.code === 'INVALID_ANNOTATION' && String(warning.id).includes('node_modules'))
          return;
        defaultHandler(warning);
      },
    },
  },
  resolve: {
    alias: {
      '@contracts': here('../backend/src/shared/contracts'),
      '@': here('./src'),
    },
  },
  server: {
    port: 5173,
    // The backend contracts live outside this folder; let the dev server serve them.
    fs: { allow: [here('..')] },
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/shared/testing/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/testing/**', 'src/main.tsx', 'src/vite-env.d.ts'],
      reporter: ['text-summary', 'lcov', 'html'],
      thresholds: {
        ...featureThresholds,
        'src/shared/**': { lines: 90, branches: 85, functions: 90, statements: 90 },
      },
    },
  },
});
