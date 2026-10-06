import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {

  const env = loadEnv(mode, '.', '');
  // Local API for `npm run dev` (the backend runs separately from ../backend).
  const devApi = env.DEV_API_TARGET || 'http://127.0.0.1:3002';
  const devProxy = { target: devApi, changeOrigin: true };

  return {
    root: path.resolve(__dirname),
    server: {
      host: "::",
      port: 5173,
      proxy: {
        '/api': devProxy,
        '/uploads': devProxy,
        '/pay': devProxy,
        '/sitemap.xml': devProxy,
        '/sitemap-style.xsl': devProxy,
        '/robots.txt': devProxy,
        '/ws': { target: devApi.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
      },
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['brand-logo.png', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          name: 'CiN - Clean It Neatly',
          short_name: 'CiN Cleaning',
          description: 'UK cleaning services - book and manage your cleans.',
          theme_color: '#4f46e5',
          background_color: '#ffffff',
          display: 'standalone',
          display_override: ['standalone', 'browser'],
          start_url: '/',
          scope: '/',
          lang: 'en',
          orientation: 'any',
          icons: [
            {
              src: 'brand-logo.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'brand-logo.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          // HTML is pre-rendered after this manifest is generated, so pages are always fetched fresh.
          globPatterns: ['**/*.{js,css,ico,png,svg,woff2,webmanifest}'],
          navigateFallback: null,
          navigateFallbackDenylist: [/^\/api\//, /^\/pay\//, /^\/uploads\//, /\.xml$/i, /\/robots\.txt$/i],
          skipWaiting: true,
          clientsClaim: true,
        },
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
