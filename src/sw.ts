// The service worker (SPEC 16, T26; wiki #197). Built by vite-plugin-pwa with injectManifest.
// It precaches the app shell and serves index.html for every app route, so the installed app opens without signal.
// Photos and fonts get runtime caches below. Data is not cached here: the last lists come from the persisted TanStack Query cache (src/data/persist.ts).
// A new version installs in the background and takes over on the next open: no skipWaiting, no reload (#200).
// The one exception: a page asks for it (`SKIP_WAITING`) when the old version can no longer load the Pollar chunk.
// Push and notificationclick (T27) are at the end.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

// OwnWalletCard: the previous version asked for a Pollar chunk the server no longer has. Only then take over now.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
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

// ---------------------------------------------------------------------------
// Push (SPEC 15, wiki #203). /api/push sends { title, body, url, tag }; a tag replaces an earlier notice about the
// same thing. A tap opens the question or letrero: an open app moves there without reloading, else a new window.
// ---------------------------------------------------------------------------
type PushPayload = { title: string; body: string; url: string; tag: string };

self.addEventListener('push', (event) => {
  let payload: PushPayload;
  try {
    payload = event.data?.json() as PushPayload;
  } catch {
    return;
  }
  if (!payload?.title) return;
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      tag: payload.tag,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = typeof event.notification.data?.url === 'string' ? event.notification.data.url : '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const app = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (app) {
        app.postMessage({ type: 'bs-open', url });
        await app.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
