// The service worker (SPEC 16, T26; wiki #197). Built by vite-plugin-pwa with injectManifest.
// It precaches the app shell and serves index.html for every app route, so the installed app opens without signal.
// Photos and fonts get runtime caches below. Data is not cached here: the last lists come from the persisted TanStack Query cache (src/data/persist.ts).
// A new version installs in the background and takes over on the next open: no skipWaiting, no reload (#200).
// T27 adds the push and notificationclick handlers to this file.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }));

// Photos already viewed (#197): Supabase Storage public images are immutable, so cache first, at most 150 for 7 days.
registerRoute(
  ({ request, url }) => request.destination === 'image' && url.pathname.startsWith('/storage/v1/object/public/'),
  new CacheFirst({
    cacheName: 'bs-photos',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 7 * 24 * 60 * 60, purgeOnQuotaError: true }),
    ],
  }),
);

// Google Fonts, so the type looks the same offline: the CSS revalidates, the font files are kept for a year.
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'bs-fonts-css' }),
);
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'bs-fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  }),
);
