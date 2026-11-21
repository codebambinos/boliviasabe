// The service worker (SPEC 16, T26; wiki #197). Built by vite-plugin-pwa with injectManifest.
// It precaches the app shell and serves index.html for every app route, so the installed app opens without signal.
// Data is not cached here: the last lists come from the persisted TanStack Query cache (src/data/persist.ts).
// A new version installs in the background and takes over on the next open: no skipWaiting, no reload (#200).
// T27 adds the push and notificationclick handlers to this file.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }));
