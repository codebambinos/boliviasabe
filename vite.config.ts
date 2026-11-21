import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PWA (vite-plugin-pwa) is added in T26.
// `/api` (Vercel functions) is served by `vercel dev` while developing; run it next to `npm run dev`.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000' } },
});
