# SPEC 17 — Keep the list in place when opening a question on desktop

> **Status:** Implemented
> **Depends on:** SPEC 04 (routes, `ScrollRestoration`), SPEC 10 (`QuestionDetail` panel on desktop). Board card: «Fix visuales: errores cosméticos» (issue #49).
> **Date:** 2026-11-21
> **Objective:** On desktop, opening or closing a question in ¿Alguien sabe? leaves the list where it was, and the side panel shows each question from its start.

## Why this spec exists

On desktop a question opens in the side panel through the URL (`?p=<id>`), so a reload and Back keep it.
`openQuestion` (`src/components/ShellLayout.tsx`) does this with `setSearchParams`, which is a new navigation.
`<ScrollRestoration />` (`src/router.tsx`) sends every new navigation to the top of the page.
So a click on a question far down the list throws the person back to the top, and they lose their place.
This is a visual bug, not a flow change, so it needs no wiki entry.

## Scope

**In:**

- `openQuestion` on desktop changes `?p=<id>` without moving the window (`preventScrollReset: true`).
- Closing the panel after a deleted question (`onGone` → `setSearchParams({}, { replace: true })`) also keeps the window still.
- The panel `.shell__detail` starts at its top each time a different question opens. Today it keeps the scroll of the previous one, because the element is reused.
- The keyboard focus on the panel heading stays as it is (`focus({ preventScroll: true })` in `QuestionDetail`).

**Out of scope:**

- **Comment and action buttons on phones** that look too big and overflow the card. The user deferred it; it goes in a later spec or in issue #49.
- Back / Forward remembering a different list position per question. Back keeps the default `ScrollRestoration` behavior.
- Phones: a question there is its own page (`/p/:id`). Returning from it already restores the list through `ScrollRestoration`.
- Hoy and its letreros (`SignSheet`): they do not navigate on open.

## Data model

This fix introduces no new data structures. It reuses the `?p=<id>` URL state from SPEC 10.

## Implementation plan

1. In `src/components/ShellLayout.tsx`, `openQuestion`: pass `preventScrollReset: true` to `setSearchParams` next to `state`. Manual test at 1280 px: scroll the list down, click a question, and the list does not move.
2. In the same file, the panel's `onGone`: pass `{ replace: true, preventScrollReset: true }`. Manual test: delete my own question from the panel, and the panel closes without the list jumping.
3. Reset the panel's own scroll when `selectedQuestion` changes. In `src/components/AppShell.tsx`, keep a ref on `<section className="shell__detail">` and set `scrollTop = 0` in an effect keyed on the open question. `AppShell` receives the key through a new `detailKey?: string | number` prop, passed from `ShellLayout` as `selectedQuestion`. Manual test: scroll down inside a long question, open another one, and it shows from its title.

## Acceptance criteria

- [x] At 1280 px, after scrolling the list of ¿Alguien sabe? down, clicking any question leaves `window.scrollY` unchanged.
- [x] Clicking a second question while one is open also leaves the list unchanged.
- [x] The URL still changes to `?p=<id>`, and a reload opens the same question in the panel.
- [x] Browser Back from `?p=<id>` returns to the previous question (or to the empty panel) as before.
- [x] After scrolling inside the panel and opening a different question, the panel shows the new one from its top.
- [x] Deleting my own question from the panel closes it without moving the list.
- [x] At 360 px, tapping a question still opens `/p/:id`, and «Volver» returns to the list at the same position as before this change.
- [x] Changing tabs (Hoy ↔ ¿Alguien sabe? ↔ Yo) still lands at the top of the new tab.
- [x] `npm run typecheck` and `npm run build` pass.

## Decisions

- **Yes:** `preventScrollReset` on the two `setSearchParams` calls. It is the router's own switch for "this navigation is not a new screen", and it touches only these two navigations.
- **No:** removing or customizing `<ScrollRestoration />` with `getKey`. It would change every route, including tab changes, which must still land at the top.
- **No:** moving the open question out of the URL into React state. A reload and Back must keep the question (SPEC 10).
- **Yes:** reset the panel's `scrollTop` to 0 on a different question. The panel is one element reused for every question, so a `key` on `QuestionDetail` alone does not reset it.
- **No (for now):** remembering a list position per question on Back. The user chose "solo no mover la lista".
- **Deferred:** the phone button sizes in the comment box and answer row. The user asked to leave it for later.

## What is **not** in this spec

- The buttons that are too big or overflow on phones in the ¿Alguien sabe? conversation.
- Per-question scroll memory on Back / Forward.
- Any change to phones, Hoy or the flows in the wiki.

Each of those, if it lands, goes in its own spec or in issue #49.
