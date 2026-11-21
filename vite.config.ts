import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `/api` (Vercel functions) is served by `vercel dev` while developing; run it next to `npm run dev`.
// PWA (SPEC 16): our own service worker (src/sw.ts), registered only in production builds; try it with
// `npm run build && npm run preview`. Icons come from `npm run pwa:icons` (pwa-assets.config.ts).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      devOptions: { enabled: false },
      includeAssets: ['logo.svg', 'favicon.ico', 'apple-touch-icon-180x180.png', 'tilcho/*.svg'],
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'] },
      manifest: {
        name: 'BoliviaSabe',
        short_name: 'BoliviaSabe',
        description: 'Lo que pasa hoy en tu ciudad, lo sabemos entre todos.',
        lang: 'es-BO',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#151110',
        theme_color: '#151110',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000' } },
});
