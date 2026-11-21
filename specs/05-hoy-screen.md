# SPEC 05 — Hoy screen

> **Status:** Implemented
> **Depends on:** SPEC 01 (data layer and mock adapter), SPEC 04 (app routes and `ShellLayout`). Board card: T18 (issue #11).
> **Date:** 2026-11-20
> **Objective:** Make `src/pages/HoyPage.tsx` the real Hoy screen, closing the gaps with the wiki (pull-to-refresh and the #163 hint) without changing the shell from SPEC 04.

## Why this spec exists

Almost all of Hoy was built as part of the smoke view (SPEC 01 + T11): grid, sections, search, tags,
lupa, empty states, detail, vote, save, report and delete. SPEC 04 (T12) moved it into
`src/pages/HoyPage.tsx` as a temporary screen inside `ShellLayout`, which owns the city, the lupa,
the letrero detail and Guardar. This spec turns that page into the real one and adds the two
things the wiki asks for that are still missing, so T18 can close.

## Scope

**In:**

- `src/pages/HoyPage.tsx` becomes the real Hoy screen. It drops the inner `HoySample` and reads
  `city`, `setCity`, `searchRef`, `openSign` and `onToggleSave` from `useShell()` (SPEC 04).
- `ShellLayout`, `useShell` and the router stay as SPEC 04 left them.
- Pull-to-refresh on touch screens: a `usePullToRefresh` hook and a small indicator with a simple
  animation. Releasing past the threshold calls `refetch()` on the list.
- Hint copy from wiki #163: «Si un letrero te sirve, ábrelo y dale «Me sirvió»: quien lo subió
  gana una yapita.»
- Wiki #166 (found while testing T18): what you report stops showing for you right away. The mock
  `reports.report` also adds a `hidden` row for the reporter, `useReport` also refreshes
  `saved`, and the «Gracias por avisar» text in `SignSheet` says «Ya no lo verás…».
- Re-checking every point of the issue's «Listo cuando» and of `flujo-final.md` › «1 · Hoy»
  against the page (acceptance criteria below).

**Out of scope (for future specs):**

- Routes, the shell and `/l/:id`. SPEC 04 (T12) already did them; this spec does not touch them.
- The bell's unread count. There is no notifications API in `src/data/` yet. It stays at 0 until
  T24.
- Subir un letrero (T19). The FAB keeps opening the account sheet or doing nothing.
- The real Stellar payment for «Me sirvió» (T17). The page calls `useVoteSign` only.
- Opening the detail from `/l/:id`, a notification, Guardados or Mis letreros (T12, T21, T24, T25).
- The Supabase adapter. T18 is done on the mock adapter, as the issue says.
- Opening Hoy on the profile's city. The wiki does not ask for it in Hoy; it belongs with «Tu
  barrio» (T16).
- Adding «Compartir por WhatsApp» to the ⋯ menu (see Decisions).
- Changes to `SignTile`, and to `SignSheet` beyond the #166 text. They already meet #139, #147,
  #148, #154-156, #159 and #160.
- A «Tuyo» mark on your own tiles. You see it in the detail («Lo subiste tú») and later in Yo ›
  Mis letreros (T21).

## Data model

This feature adds no data structures. The only `src/data/` change is behavior (#166): `report`
also hides the item for the reporter, in the mock and in the `DataApi` contract comment. It uses `useSigns`,
`useToggleSaved`, `useSign`, `useVoteSign`, `useRemoveSign`, `useReport` and `useHideForMe` from
SPEC 01.

`HoyPage` takes no props. It reads the `ShellContext` from SPEC 04 through `useShell()`.

New hook interface:

```ts
// src/components/usePullToRefresh.ts
type PullState = 'idle' | 'pulling' | 'armed' | 'refreshing';
function usePullToRefresh(onRefresh: () => Promise<unknown>, opts?: { enabled?: boolean }): {
  state: PullState;
  distance: number; // px the indicator is pulled down, after resistance (0 to 96)
};
```

Gesture constants: resistance 0.5, threshold 64 px, maximum 96 px.

## Implementation plan

1. In `src/pages/HoyPage.tsx`, fold `HoySample` into `HoyPage`, which reads the shell through
   `useShell()`. Replace the «TEMPORARY» header comment. Manual test: Hoy looks and behaves
   exactly as before.
2. Leave `ShellLayout`, `useShell` and `router.tsx` untouched. `npm run typecheck` passes.
3. Change the Hoy hint to the #163 copy.
4. Create `src/components/usePullToRefresh.ts`. It only listens when
   `matchMedia('(pointer: coarse)')` matches, the window is at `scrollY === 0`, no sheet is open
   (`documentElement.style.overflow !== 'hidden'`) and `enabled` is true. Touch events are
   passive, except `touchmove` while pulling. A mostly horizontal drag (the chip row) is ignored.
   Below 64 px the release goes back to `idle`; at 64 px or more it calls `onRefresh` and stays
   `refreshing` until the promise settles.
5. Create `src/components/PullIndicator.tsx` + `pull-to-refresh.css`. It is a 40 px round chip
   at the top of the list (surface token, no hard shadow) with an arrow:
   - while pulling, it moves down with `distance` and the arrow turns with progress;
   - at `armed`, the arrow points up;
   - at `refreshing`, a spinner turns.
   On release it springs back in 200 ms. With `prefers-reduced-motion: reduce` there is no
   movement or spin: the chip just appears in place with the text. A visually hidden
   `role="status"` says «Actualizando letreros…». Tokens only.
6. Wire the indicator into `HoyPage`: `usePullToRefresh(() => signs.refetch(), { enabled:
   !signs.isPending })`. Add `overscroll-behavior-y: contain` on `html` only while Hoy is mounted,
   so Chrome's own pull-to-reload does not fire on top of it.
7. Walk the acceptance list on the mock adapter at 360, 768 and 1280 px, light and dark, text at
   130 %. Open the PR with `Closes #11` and move the card to In Review.

## Acceptance criteria

- [x] `src/pages/HoyPage.tsx` has no `HoySample` and no «TEMPORARY» comment, and this branch does
      not change `ShellLayout.tsx`, `useShell.ts` or `router.tsx`.
- [x] Hoy works with the mock adapter, with no Supabase (`VITE_DATA_SOURCE` unset).
- [x] No file under `src/pages/` or `src/components/` imports `@supabase/supabase-js` or
      `src/data/mock` (`git grep`).
- [x] The top bar shows the city selector with the 10 cities. Bell and balance show only with an
      account. The balance opens Yo on Movimientos.
- [x] The search and the 18 tag chips filter the list. Two chips at once show letreros with either
      tag.
- [x] With a search that matches nothing: «No encontramos letreros con eso» + «Quitar filtros»,
      which clears both search and tags.
- [x] A city with no letreros (e.g. Cobija on the mock) shows «Tu ciudad recién empieza» and «Ver
      Cochabamba», which switches the city.
- [x] The list is a 2-column grid on a 360 px phone, grouped as Hoy · Esta semana · Antes. «Antes»
      shows «Puede estar desactualizado».
- [x] 30 letreros load first. «Ver más letreros» loads the next 30. Skeleton tiles show while
      loading.
- [x] A tile shows the photo with the price on it, Guardar on the photo, title, zone · hace… and
      «A N les sirvió» («A 1 vecino le sirvió» for one).
- [x] As a guest, Guardar, Me sirvió, No me sirvió and Reportar open the «Crea tu cuenta» sheet
      with its reason line. After signing in, the pending action completes.
- [x] Tapping a tile opens the detail: big photo (tap → full screen), the price as a letrero,
      title, zone, author, «A N les sirvió», Me sirvió, Guardar, ⋯, Cómo llegar and Volver.
- [x] «Me sirvió» shows «¡Gracias, pues! <nombre> recibe +1 yapita por ayudarte» and then «Te
      sirvió». It does not appear on your own letrero, where the main button is Compartir.
- [x] ⋯ on someone else's letrero has No me sirvió (only before voting) and Reportar. ⋯ on yours
      has Borrar, which asks to confirm. After borrar, the letrero is gone from the list.
- [x] Reportar offers the 6 reasons and «Ya no quiero ver esto». After either one, the letrero is
      gone from the reporter's list (#166). After a report, the text says «Ya no lo verás…».
- [x] «Cómo llegar» opens the Maps link, or a Maps search «título zona ciudad», in a new tab.
- [x] The hint reads «Si un letrero te sirve, ábrelo y dale «Me sirvió»: quien lo subió gana una
      yapita.» and does not come back after ✕.
- [x] The lupa appears in the top bar only after scrolling past the search. Tapping it scrolls up
      and focuses the search.
- [x] On a touch phone at the top of Hoy, pulling down past 64 px and releasing shows the spinner
      and refetches the list. Pulling less and releasing does nothing.
- [x] Pull-to-refresh does nothing on desktop (mouse), while a sheet is open, or while the page is
      scrolled down. Chrome's own page reload does not fire.
- [x] With reduced motion on, pull-to-refresh still works with no movement or spin.
- [x] Hoy passes at 360, 768 and 1280 px, in light and dark, with text at 130 %. There is no
      horizontal scroll.
- [x] No on-screen text says «puntos» alone, «XLM», «cripto», «blockchain» or an amount in
      bolivianos.
- [x] `npm run typecheck` and `npm run build` pass. CI is green.
- [x] The PR body has `Closes #11`.

## Decisions

- **Yes:** build on the `HoyPage` and `ShellLayout` that SPEC 04 (T12) merged. The first draft
  of this spec moved Hoy out of `App.tsx` with its own props, but T12 landed first and deleted
  `App.tsx`. Adapting keeps `main` as it is.
- **Yes:** the shell keeps owning the city, the lupa, the letrero detail and Guardar (SPEC 04).
  They survive a tab change there, and other pages (Guardados, Mis letreros) open the same detail.
- **No:** an `onSearchShortcut` prop. It was in the first draft; `ShellLayout` already observes
  `searchRef` itself.
- **Yes:** pull-to-refresh as an in-house hook with a simple animation on touch phones. No new
  dependency, and the gesture is small.
- **No:** a pull-to-refresh library. It adds weight and a dependency for about 80 lines of code.
- **No:** «Compartir por WhatsApp» in the ⋯ menu. `flujo-final.md` still lists it there, but the
  newer #154 and #159 say ⋯ on someone else's letrero holds only No me sirvió and Reportar, and
  Compartir is the bar icon (or the main button on your own). The code already follows #154. The
  `flujo-final.md` line should be fixed in the wiki (not in this PR).
- **Yes:** the tile has no «Subido por…». The issue mentions it, but wiki #138-139 define the tile
  without the author. The author shows in the detail.
- **No:** opening Hoy on the profile's city. Not asked by the Hoy flow; it belongs with T16.
- **No:** a real unread count on the bell. There is no notifications API yet (T24).
- **Yes:** what you report stops showing for you right away (wiki #166, decided while testing
  T18). Before, a reported letrero stayed in your list until 3 reports, and the report seemed not
  to work. It still counts as 1 of the 3 that hide it for everyone.
- **No:** a «Tuyo» mark on the tile. The tile stays as wiki #138-139 define it.
- **Wiki changes:** #166 in `huecos-cerrados.md` and `log.md`, and the Reportar rule in
  `reglas-finales.md`. The ⋯ line in `flujo-final.md` is still a pending documentation fix.

## Risks

| Risk | Mitigation |
| --- | --- |
| Later changes to `ShellContext` break Hoy | Hoy reads only `city`, `setCity`, `searchRef`, `openSign` and `onToggleSave`; typecheck catches a renamed field. |
| The pull gesture fights vertical scroll, or the chip row's horizontal scroll | Start only at `scrollY === 0`, ignore mostly horizontal drags, and stop when the page scrolls. |
| Chrome Android or iOS Safari runs its own pull-to-reload | `overscroll-behavior-y: contain` on `html` while Hoy is mounted. On iOS, test that the rubber band does not move the indicator twice. |
| The Supabase adapter forgets #166 | The `DataApi.reports.report` comment states it. The adapter inserts into `reports` and `hidden_items` (both exist, SPEC 03). |
| The «Me sirvió» flow has to work with no Stellar | The mock adapter answers without Stellar. With the real API, a failure leaves the reward `pending` (CLAUDE.md), and the screen does not wait for it. |

## What is **not** in this spec

- Routes, the shell and `/l/:id` (SPEC 04, T25).
- Subir un letrero (T19).
- The bell's count and the Avisos list (T24).
- The Stellar payment behind «Me sirvió» (T17).
- The Supabase adapter.
- Opening on the profile's city (T16).
- Compartir in the ⋯ menu (wiki #154).

Each one of those, if it lands, goes in its own spec or task.
