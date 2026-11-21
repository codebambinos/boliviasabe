# SPEC 04 — App routes and empty screens

> **Status:** Approved
> **Depends on:** SPEC 01, SPEC 02. Board card: T12 (issue #6).
> **Date:** 2026-11-20
> **Objective:** Give every wiki route its own URL and screen (`/`, `/preguntas`, `/yo`, `/p/:id`, `/l/:id`, `/privacidad`, `/nueva-contrasena`), with Volver returning to where you were and unknown paths landing on Hoy.

## Why this spec exists

SPEC 02 mounted a minimal router (`/`, `/privacidad`) and kept the tab in history state as an interim hack. Today `src/App.tsx` (618 lines) is a smoke view that holds the tab, city and sheets in `useState`. T12 replaces that with real routes so T15–T25 can build screens on stable URLs.

## Scope

**In:**

- Routes in `src/router.tsx`: `/` (Hoy), `/preguntas`, `/yo` inside one shell layout; `/p/:id` (pregunta), `/l/:id` (letrero), `/privacidad`, `/nueva-contrasena` outside the shell; `*` redirects to `/` (replace).
- `ShellLayout` (`src/components/ShellLayout.tsx`): mounts `AppShell` once with `<Outlet />`. The tab comes from the URL, not from state. It owns what `Screens` owns today: city, AboutSheet, AvisosSheet, auth gate, Lupa observer, `requireAccount` wiring. Shared values reach the pages through Outlet context (`useShell()` hook).
- Existing smoke content kept in its route, moved out of `App.tsx` into `src/pages/HoyPage.tsx`, `PreguntasPage.tsx`, `YoPage.tsx` (the current `HoySample`, `PreguntasSample`, `YoSample` with their helpers). T18, T20 and T21 replace them.
- `src/pages/SignDetailPage.tsx` (`/l/:id`) and `QuestionDetailPage.tsx` (`/p/:id`): own page without tabs, bar with «← Volver» and the logo, an empty body that shows «Esto ya no está disponible» + «Ir a Hoy» (the wiki's missing-item screen). No data fetch yet.
- `src/pages/NewPasswordPage.tsx` (`/nueva-contrasena`): same page frame, empty body (T15 fills it).
- A shared `PageFrame` (stripe, bar, Volver, `h1`, focus to `h1`, `document.title`) extracted from `PrivacyPage`, reused by the four non-shell pages. A shared `useGoBack()` hook: `navigate(-1)` when `location.key !== 'default'`, otherwise `navigate('/', { replace: true })`.
- `<ScrollRestoration />` in the layouts so Back restores the list scroll position.
- Remove the `HomeState` history hack and `openPrivacy`'s `replaceState`: Back from `/privacidad` lands on `/yo` because `/yo` is a real entry.
- Tab buttons and the balance shortcut navigate (`/`, `/preguntas`, `/yo`) with the existing `goWithTransition` / `setDirection`; Back/Forward direction keeps working via the `popstate` listener (generalised from `/privacidad` to "is the destination deeper than the origin").
- `vercel.json` already rewrites to `index.html`; verify, do not change.

**Out of scope (for future specs):**

- Real content of Hoy, ¿Alguien sabe?, Yo, details and the reset-password form (T15, T18–T21).
- Fetching a sign or question by id and the true «no disponible» logic (T18, T20, T25). The empty body here is a static placeholder.
- The `/api` Open Graph function for `/p/:id` and `/l/:id` (T25).
- The desktop window over Hoy for `/l/:id` (wiki #141); T18 decides it.
- Auth-required routes and redirects; guests may open every route.
- Supabase Site URL / Redirect URLs for `/nueva-contrasena` (T13/T15).

## Data model

This feature introduces no new data structures and no tables. It reuses the session from SPEC 01.

```ts
// Route table (shape, not final code)
const routes = [
  { element: <ShellLayout />, children: [
    { path: '/', element: <HoyPage /> },
    { path: '/preguntas', element: <PreguntasPage /> },
    { path: '/yo', element: <YoPage /> },
  ]},
  { path: '/l/:id', element: <SignDetailPage /> },
  { path: '/p/:id', element: <QuestionDetailPage /> },
  { path: '/privacidad', element: <PrivacyPage /> },
  { path: '/nueva-contrasena', element: <NewPasswordPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
];

// Outlet context from ShellLayout
type ShellContext = { city: City; setCity(c: City): void; openAbout(): void; searchRef: RefObject<HTMLInputElement | null>; /* … */ };
```

`Tab` stays in `AppShell.tsx` but is derived: `/` → `hoy`, `/preguntas` → `preguntas`, `/yo` → `yo`.

## Implementation plan

1. Create `PageFrame` and `useGoBack` from `PrivacyPage` and make `PrivacyPage` use them. Manual test: `/privacidad` looks and goes back as before.
2. Add `SignDetailPage`, `QuestionDetailPage` and `NewPasswordPage` on `PageFrame`, and register `/l/:id`, `/p/:id`, `/nueva-contrasena` in `src/router.tsx`. Manual test: each URL opens, Volver works, a fresh tab goes to `/`.
3. Create `ShellLayout` by moving the shell wiring out of `Screens` (AppShell, city, About/Avisos sheets, Lupa observer). Tab derived from `useLocation`; `onTabChange` navigates. Register the three tab routes with the current smoke content still rendered by the layout, so the app behaves exactly as today but on `/`, `/preguntas`, `/yo`.
4. Split the smoke content into `HoyPage`, `PreguntasPage`, `YoPage` under `src/pages/`; `App.tsx` shrinks to `AuthGate` around the router outlet or disappears. Delete the `HomeState` hack.
5. Add `<ScrollRestoration />`; generalise the `popstate` direction listener in `src/router.tsx`. Manual test: scroll Hoy, open `/privacidad`, Back restores position; Back from `/yo`→`/privacidad` lands on Yo.
6. Update the header comments (`App.tsx`, `AppShell.tsx`, `router.tsx`) and `wiki/log.md` is **not** touched (no product change; routes already in `wiki/tecnico.md`).

## Acceptance criteria

- [ ] `/`, `/preguntas`, `/yo`, `/l/1`, `/p/1`, `/privacidad` and `/nueva-contrasena` each open directly (dev server and `vite preview`) without console errors.
- [ ] `/abc` and `/l` (no id) redirect to `/`.
- [ ] Tapping a tab changes the URL; reloading `/preguntas` stays on ¿Alguien sabe?.
- [ ] From Yo, opening Privacidad and then «← Volver», browser Back or Android back lands on `/yo`.
- [ ] Opening `/l/1` in a fresh tab and pressing «← Volver» goes to `/`; with in-app history it goes back one entry.
- [ ] Scroll in Hoy, open a detail route, go Back: the list scroll position is restored.
- [ ] `/l/:id`, `/p/:id`, `/nueva-contrasena` and `/privacidad` show no tab bar, FAB, balance or bell, and each has one `h1` that receives focus.
- [ ] The city picked in Hoy is still selected after switching to ¿Alguien sabe? and back.
- [ ] No `HomeState` or `history.replaceState` hack remains in `src/`.
- [ ] 360 px, light and dark, text at 130 %: no horizontal scroll on any route; touch targets ≥ 44 px.
- [ ] No «XLM», «tokens», «cripto», «blockchain», «puntos» alone or bolivianos amounts in the new copy.
- [ ] `npm run typecheck` and `npm run build` pass; CI is green.
- [ ] The PR body has `Closes #6`.

## Decisions

- **Yes:** keep the smoke screens in their routes. They are the only way to test theme, movements and sheets until T18–T21; only the new routes are empty.
- **No:** emptying them now. It matches the issue wording but destroys working verification.
- **Yes:** details (`/l/:id`, `/p/:id`) outside the shell with their own Volver, as full screen on phones (wiki › Transversal). The desktop window over Hoy (#141) is T18's call.
- **Yes:** `ShellLayout` with `<Outlet />`. State (city, sheets) survives tab changes without a store.
- **No:** each page mounting its own `AppShell`; it remounts the frame and loses the city.
- **Yes:** tab derived from the URL, so reload and share keep the tab. This removes SPEC 02's interim `HomeState`.
- **Yes:** a shared `PageFrame` + `useGoBack`, extracted from `PrivacyPage` instead of copied four times.
- **Yes:** `ScrollRestoration` now (wiki: «Volver regresa… en la misma posición de la lista»), cheap with a data router.
- **Yes:** `/l/:id` = letrero (wiki flujo-final › Detalle de un letrero), `/p/:id` = pregunta. The wiki gives no full naming rule; recorded here.
- **Yes:** `*` redirects to `/` with `replace`, per the issue («lleva a Hoy»).
- **No wiki change needed.** Routes are already in `wiki/tecnico.md`.

## Risks

| Risk | Mitigation |
| --- | --- |
| `Sheet` pushes its own history entries and the tab routes now change URL | Test Android Back with a sheet open on each tab; sheet entries keep the same URL, so the router re-renders without a tab change. |
| View transitions with `navigate` flash on `ScrollRestoration` | Keep `viewTransition` only on forward pushes; verify Back animation reverses. |
| `App.tsx` split touches ~600 lines | Move code verbatim, no logic changes, in one commitable step (4). |
| `/nueva-contrasena` reachable by anyone | It is an empty page here; T15 validates the Supabase recovery token. |

## What is **not** in this spec

- Real screens, data fetching by id, Open Graph function, desktop sign window, reset-password form, route guards. Each goes in its own spec or task.
