# SPEC 16 — Installable app (PWA) that opens without internet

> **Status:** Approved
> **Depends on:** SPEC 01 (QueryClient and `src/data/`), SPEC 04 (routes and shell, `OfflineBanner`), SPEC 07 (session and Ajustes in Yo). **SPEC 15 (T27) depends on this one:** it adds `push` and `notificationclick` to the `src/sw.ts` created here, and reuses the iPhone steps sheet. Board card: T26 (issue #19).
> **Date:** 2026-11-21
> **Objective:** Make BoliviaSabe installable on Android and iPhone (manifest, icons, standalone mode and a «Instalar la app» row in Ajustes), and make it open without signal showing the last loaded lists and thumbnails.

## Why this spec exists

`vite-plugin-pwa` has been installed since the start, but it is not configured:

- There is no manifest, no icons and no service worker.
- When the page reloads, TanStack Query forgets everything.

The wiki asks for three things:

- «La app abre sin red (PWA) y muestra lo último cargado» (`reglas-finales`, `flujo-final › Sin señal`, #65).
- An «Instalar la app» row in Ajustes.
- Push (T27), which needs a service worker. On iPhone, it also needs the app installed.

## Scope

**In:**

- **Manifest** through `vite-plugin-pwa` (`vite.config.ts`):
  - `name: 'BoliviaSabe'`, `short_name: 'BoliviaSabe'`, `lang: 'es-BO'`.
  - `description` from `index.html`.
  - `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, `orientation: 'portrait'`.
  - `background_color` and `theme_color`: `#151110`, because the default theme is dark (#143).
  - The icons listed below.
- **Icons generated from `public/logo.svg`** with `@vite-pwa/assets-generator`:
  - Config in `pwa-assets.config.ts`, and an `npm run pwa:icons` script.
  - Outputs: `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png` (safe margin), `apple-touch-icon-180x180.png` and `favicon.ico`.
  - The logo goes on a solid `#F5F2EF` (fondo) background, so the ink B stays visible on any launcher.
  - The generated PNGs are committed to `public/`. If Yaeko sends another design, the script is run again.
- **`index.html`:** `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent` and `apple-mobile-web-app-title`. The theme script keeps updating `theme-color`.
- **Service worker `src/sw.ts`** (`strategies: 'injectManifest'`, `registerType: 'autoUpdate'` without a forced reload):
  - **Precache** of the app shell (JS, CSS, HTML, icons, `logo.svg`, Tilcho).
  - **Navigation:** `NavigationRoute` to `index.html`, with `/api/` in the denylist, so `/p/:id`, `/l/:id`, `/yo`… open offline.
  - **Photos:** `CacheFirst` for images on the Supabase Storage origin (`VITE_SUPABASE_URL` + `/storage/v1/object/public/`), cache `bs-photos`, at most **150 entries, 7 days**. Opaque or errored responses are not cached.
  - **Google Fonts:** `StaleWhileRevalidate` for the CSS and `CacheFirst` for the font files (1 year, 30 entries), so the type looks the same offline.
  - **Nothing else is cached:** no Supabase REST/Auth calls, no Horizon calls, no `/api/`.
  - **Updates:** the new service worker installs in the background and activates on the next open. No `skipWaiting` and no reload, so no draft is lost.
  - Exported in a way that lets T27 add `push` and `notificationclick` handlers in the same file.
- **Registration:** `registerSW({ immediate: true })` from `virtual:pwa-register` in `src/main.tsx`, only in production builds (`devOptions.enabled: false`). It is tested with `npm run build && npm run preview`.
- **Last loaded data offline** (`src/data/persist.ts`):
  - `PersistQueryClientProvider` replaces `QueryClientProvider` in `main.tsx`.
  - Async persister on **IndexedDB** (`idb-keyval`), key `bs-query-cache`.
  - `maxAge` 24 h; `buster` = the app build version (`__APP_VERSION__` defined in Vite from `package.json` + build time), so a new deploy discards an old cache.
  - Only successful queries are persisted. **Personal queries are never persisted:** the existing `PERSONAL` list (wallet, activity, saved, myPhone) moves to `src/data/query.ts`, so `session.ts` and the persister share it.
  - On a session change, the existing `resetQueries` and `invalidate` keep working. The persisted copy follows the cache, and «Cerrar sesión» removes it at once (`persister.removeClient()`).
  - Offline, each screen shows what it had, with the existing banner «Sin conexión. Ves lo último que cargó». Without a cached copy, the error states keep saying «Sin conexión, intenta de nuevo» + Reintentar.
- **Install (`src/pwa/install.ts` + `useInstall`):**
  - Android and desktop Chrome: it catches `beforeinstallprompt` and exposes `install()`.
  - `installed` comes from `display-mode: standalone` or `navigator.standalone`, and the `appinstalled` event.
  - `platform` is one of `'prompt' | 'ios' | 'installed' | 'unavailable'`.
- **Ajustes › «Instalar la app»** row (in YoPage, above Tema):
  - Android or Chrome with the prompt available: button «Instalar la app» → native prompt.
  - iPhone in Safari: «Instalar la app» opens the **`InstallSteps`** sheet: «Agrega BoliviaSabe a tu pantalla de inicio»:
    1. Toca **Compartir** (with the iOS share icon).
    2. Elige **«Agregar a inicio»**.
    3. Abre BoliviaSabe desde el ícono.

    It ends with the note «Después entra otra vez con tu cuenta» (in Safari and in the installed app the session is not shared). The button is «Entendido».
  - Already installed: the text «Ya la tienes instalada» with no button.
  - Without the prompt and not iPhone (Firefox, an in-app browser): the text «Ábrela en Chrome o Safari para instalarla».
  - Visible as a guest too, because installing does not need an account.
- **Standalone mode:** the layout already uses `viewport-fit=cover`. Check that the top bar and the bottom tab bar respect `safe-area-inset-*` in the installed app on iPhone and Android, and fix it if they do not.
- **Wiki first:** the closed gaps listed in Decisions.

**Not in:**

- Push, permission, and the push handlers of `src/sw.ts` (T27, SPEC 15).
- Offering to install after publishing, which the wiki puts in the permission flow (that is T27).
- The rest of Ajustes: Notificaciones (T27), Mi celular, and Tema and Cerrar sesión, which already exist (T29).
- Publishing offline, or a queue of actions to send when the signal comes back. The forms keep the text and the photo, as they already do.
- Caching full-size photos that were never opened, Horizon balances, or movements.
- Custom splash screens per iPhone size (`apple-touch-startup-image`).

## Data model

There are no new tables or database changes. These are the new local stores and settings:

```ts
// src/data/query.ts
export const PERSONAL_KEYS: readonly QueryKey[]; // moved from hooks/session.ts
export function isPersonalKey(key: readonly unknown[]): boolean;

// src/data/persist.ts
export const persister: Persister; // createAsyncStoragePersister({ storage: idb-keyval, key: 'bs-query-cache' })
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'>; // maxAge 24h, buster, shouldDehydrateQuery

// src/pwa/install.ts
export type InstallPlatform = 'prompt' | 'ios' | 'installed' | 'unavailable';
export function useInstall(): { platform: InstallPlatform; install(): Promise<boolean> };
```

| Store | Name | Content | Lives until |
|---|---|---|---|
| IndexedDB (idb-keyval) | `bs-query-cache` | Dehydrated non-personal queries | 24 h, a new deploy (buster), or Cerrar sesión |
| Cache Storage | `workbox-precache-*` | App shell | The next service worker version |
| Cache Storage | `bs-photos` | Storage images that were already viewed | 150 entries / 7 days |
| Cache Storage | `bs-fonts` (+ CSS) | Google Fonts | 1 year / 30 entries |

New dependencies, pinned with `--save-exact`:
- `@tanstack/react-query-persist-client` and `@tanstack/query-async-storage-persister`, in the same minor version as `@tanstack/react-query`.
- `idb-keyval`.
- `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-expiration` and `workbox-cacheable-response`, at the version `vite-plugin-pwa` 2.0.0 expects.
- Dev: `@vite-pwa/assets-generator`.

`vercel.json`: `/sw.js` and `/manifest.webmanifest` get `Cache-Control: no-cache`, so an update is noticed.

## Implementation plan

1. **Wiki.** Add the closed gaps from Decisions to `huecos-cerrados.md`, update `log.md` and the count in `index.md`, then push `boliviasabe-docs`.
2. **Icons and manifest.**
   - `pwa-assets.config.ts` and `npm run pwa:icons`; the generated PNGs go in `public/`.
   - `vite.config.ts` with `VitePWA` (`injectManifest`, the manifest).
   - A minimal `src/sw.ts` (precache + navigation).
   - `registerSW` in `main.tsx`, the `index.html` tags and the `vercel.json` headers.
   - Check: `npm run build && npm run preview` → Chrome DevTools › Application shows the manifest without errors and the service worker as active; Lighthouse marks it «Installable».
3. **Runtime caches.**
   - Photos (Storage) and Google Fonts in `src/sw.ts`.
   - Check: open Hoy, turn on airplane mode in DevTools, reload → the shell and the thumbnails load.
4. **Persisted cache.**
   - `PERSONAL_KEYS` moves to `query.ts`.
   - `persist.ts`, and `PersistQueryClientProvider` in `main.tsx`.
   - `removeClient()` on Cerrar sesión.
   - Check: load Hoy and Preguntas, then reload offline → the lists show; nothing personal ends up in IndexedDB.
5. **Install.**
   - `src/pwa/install.ts`, `InstallSteps` (sheet + css) and the «Instalar la app» row in YoPage.
   - Safe areas in standalone mode.
   - Light and dark, 360 px, text at 130 %.
6. **Phone test and close (with Diego).**
   - Preview deploy (PR).
   - Install it on Android (Chrome) and on iPhone (Safari → Agregar a inicio).
   - Airplane mode → the app opens with the last lists.
   - Production check after the merge.
   - Spec set to Implemented.

## Acceptance criteria

- [ ] `npm run typecheck` and `npm run build` pass. `dist/` has `manifest.webmanifest`, `sw.js` and the icons.
- [ ] Lighthouse (or DevTools › Application) shows the app as installable, with no manifest errors, and the maskable icon looks right in the preview.
- [ ] On Android Chrome, «Instalar la app» in Ajustes opens the native prompt; once installed, the row says «Ya la tienes instalada» and the app opens without the browser bar.
- [ ] On iPhone Safari, «Instalar la app» shows the 3 steps and the note; following them installs the app, and it opens standalone with the bars inside the safe areas.
- [ ] With airplane mode, the installed app opens. Hoy and Preguntas show the last lists with their thumbnails and the banner «Sin conexión. Ves lo último que cargó». A detail that was opened before shows too.
- [ ] Offline, a screen with nothing cached shows «Sin conexión, intenta de nuevo» + Reintentar (not a blank page or the browser dinosaur).
- [ ] After Cerrar sesión, `bs-query-cache` holds no personal or session query (it is removed, then re-saved with the public lists only). Wallet, activity, saved, myPhone and the session are never in it.
- [ ] A new deploy: after closing and reopening the app, the new version is running, with no reload in the middle of typing.
- [ ] No Supabase REST/Auth, Horizon or `/api/` responses appear in Cache Storage.
- [ ] Mock mode (`VITE_DATA_SOURCE=mock`) still works, with the cache persisted the same way.
- [ ] Light and dark mode, 360 px and text at 130 % on the new row and sheet.

## Changes during implementation

- **Photos load with `crossorigin="anonymous"`** (`FadeImage` and the sizer thumbnail of the letrero detail). Without it, Supabase Storage photos are opaque responses, which the photo cache does not keep. Supabase Storage answers CORS, so nothing else changes.
- **Cerrar sesión and the persisted copy.** `removeClient()` deletes it, but the persister writes the in-memory cache again right away. What comes back is only the public lists, which refetch as a guest. The acceptance criterion now says that instead of «does not exist».
- **The default theme is now the phone's** (wiki #201, Diego after installing it on an iPhone; replaces #143).
  `index.html` and Ajustes › Tema default to `system` (options in the order Sistema / Claro / Oscuro), and the
  status bar color follows the phone while it does. The manifest keeps `#151110`: a manifest cannot follow the
  system, and it only paints the Android splash.
- **Reads and publishes fail right away without signal** (`networkMode: 'always'` in `query.ts`). TanStack's default pauses them until the network returns, so a question never opened before kept loading forever offline (Diego's iPhone test). Hoy and ¿Alguien sabe? show their error only when they have no list, so a failed refresh never covers the saved list.
- **The session is never persisted either**, besides the personal keys: it holds the person's profile.

## Decisions

- **The last data loaded is kept by persisting the TanStack Query cache (IndexedDB, 24 h)**, not by caching the API in the service worker. It works the same with Supabase and the mock, respects the session changes (#195), and Supabase responses depend on the token, so caching them could mix accounts. *Discarded:* `NetworkFirst` over Supabase REST; and having only the shell open offline, which does not fulfil «muestra lo último cargado».
- **Personal queries are never persisted**, and Cerrar sesión deletes the persisted copy: on a shared phone, nobody should see someone else's balance or saved items offline.
- **Thumbnails and photos already viewed are cached in the service worker** (CacheFirst, 150 / 7 days). They are immutable public URLs, and without them the offline lists look broken. *Discarded:* text only.
- **The icons are generated from `logo.svg`** with `@vite-pwa/assets-generator`, on the light fondo background. This avoids blocking on a new design, and it is repeatable. *Discarded:* waiting for Yaeko.
- **T26 builds «Instalar la app» and the iPhone steps sheet.** That makes «Se instala en Android y en iPhone» testable from the app, and T27 reuses the sheet. T29 keeps Mi celular (the issue card #22 must be updated: Notificaciones goes to T27 and Instalar goes to T26).
- **Updates are silent, on the next open** (no `skipWaiting`, no reload): a reload must never erase a draft. *Discarded:* the «Hay una versión nueva» notice and the automatic reload.
- **`injectManifest` with `src/sw.ts`**, as SPEC 15 requires: one service worker in TypeScript that T27 extends. *Discarded:* `generateSW`.
- **The service worker is registered only in production builds:** in development, a service worker hides changes and confuses `vite` HMR.

## Risks

- **iPhone keeps a separate session (and cache) in the installed app:** the person has to sign in again. Mitigation: the note «Después entra otra vez con tu cuenta» in the sheet.
- **`beforeinstallprompt` does not fire** (already installed, or the browser's engagement rules): the row would show «Ábrela en Chrome o Safari…» even in Chrome. Mitigation: check `getInstalledRelatedApps` or the standalone state before showing it, and accept the browser menu as the alternative.
- **A stale cache after a breaking data change:** the `buster` with the build version discards it on every deploy.
- **Vercel caching `sw.js`:** without `no-cache`, updates take long to arrive. Mitigation: the header in `vercel.json`.
- **Storage space:** IndexedDB only holds JSON (no photos), and photos are capped at 150. If the browser evicts the cache, the app still opens and shows the error states.
