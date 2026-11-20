import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PWA (vite-plugin-pwa) is added in T26.
export default defineConfig({
  plugins: [react()],
});
