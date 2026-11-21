// App icons generated from the logo (wiki #198): `npm run pwa:icons` writes the PNGs and favicon.ico to public/.
// The ink B sits on the light fondo (#F5F2EF), so it stays visible on dark and light launchers.
import { defineConfig, type Preset } from '@vite-pwa/assets-generator/config';

const background = '#F5F2EF';

const preset: Preset = {
  transparent: {
    sizes: [64, 192, 512],
    favicons: [[48, 'favicon.ico']],
    padding: 0.12,
    resizeOptions: { background, fit: 'contain' },
  },
  maskable: { sizes: [512], padding: 0.3, resizeOptions: { background } },
  apple: { sizes: [180], padding: 0.2, resizeOptions: { background } },
};

export default defineConfig({ preset, images: ['public/logo.svg'] });
