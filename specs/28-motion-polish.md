# SPEC 28 — Motion polish and attention details

> **Status:** Implemented
> **Depends on:** SPEC 27 (motion tokens, press states, `DESIGN.md` › Motion), SPEC 21 (Yo profile card and balance), SPEC 12 (live question detail, threads, contact box), SPEC 10 (question cards), SPEC 05 (Hoy tiles and Guardar). Board card: T44 (issue #82).
> **Date:** 2026-11-22
> **Objective:** Make the moments that matter (earning yapitas, saving, things that arrive or change by themselves, moving between tabs) feel alive with short motion, without changing any flow, text or rule.

## Why this spec exists

After T43 the app follows `DESIGN.md`, but several moments still change abruptly. Two examples: the balance in the top bar swaps its number with no sign that you just earned something, and an answer that arrives live simply pops into the list.
These are the moments the pitch is about (a neighbor helps, someone earns a yapita). A little motion there makes them noticeable.
Everything here is decoration on top of what exists: same screens, same buttons, same order, same texts.

## Scope

**In** — in three blocks that can be merged separately, in this order:

**Block 1 · Yapitas and saving**
- **A1 · Balance in the top bar** (`AppShell.tsx`, `.shell__balance`): the number changes with the same cross-fade as Yo (`yo-fade`). When the balance **goes up** while the app is open, the ★ disc pulses once: scale 1 → 1.15 → 1 with a short orange glow that fades, about 420 ms. No pulse on first load, when the balance goes down (−5), or when it goes from loading to a number.
- **A2 · Bar toward 100** (`ProfileCard.tsx`, `.progress`): the fill uses `transform: scaleX(progress)` with `transform-origin: left` instead of `width`, and grows or shrinks over `--m-panel`. On first render it shows the current value without animating.
- **A6 · «A N les sirvió»** in the letrero sheet (`SignSheet.tsx`): when the count changes with the sheet open, the line cross-fades (`yo-fade`).
- **B1 · Guardar** (tile, letrero sheet, question, answer): when the button **becomes saved**, the bookmark icon settles in from scale 0.85 to 1 (no overshoot) while it fills. The pulse plays when the pressed state turns on, which for a letrero (the Hoy tile and the letrero sheet) is at the tap (it changes before the server answers) and in a question or answer is when the server answers. Unsaving, or a failed save going back, only changes color.

**Block 2 · Things that arrive or change by themselves**
- **A4 · «Sin conexión» banner** (`OfflineBanner.tsx`, `.offline__bar`): it slides down from under the top bar with a fade when the connection drops, and slides back up when it returns. The space it takes animates with it, so the page does not jump.
- **B2 · Live answers and comments** in the question detail: an answer or comment whose id was not there when the question opened enters once with a short rise and a soft background that fades in about 2 s (the same language as `aviso-rise` and `spot-ring`). This includes your own. What was there on open, or after reopening or reloading, does not animate.
- **B3 · «Copiado»** in the contact box (`ContactRequest.tsx`): the icon and label cross-fade between Copiar and ✓ Copiado, both ways.
- **B4 · «✓ Solucionada» / «Cerrada»** in the question card (`QuestionCard.tsx`) and in the detail (`QuestionDetail.tsx`): when the status changes while the card or the detail is on screen, the new tag enters with a fade. On first render it does not animate. The detail's existing «Me sirvió» celebration (`qd-done-*`) stays as it is.
- **B5 · «Urgente»** in the question card and in the detail, only while the urgency is active: the tag carries a small coral dot that breathes slowly with opacity only, like the skeleton (1.6 s, `ease-in-out`, infinite). The tag text and colors do not change.

**Block 3 · Navigation** (A3 removed after review; only A5 remains)
- **A3 · Current tab: no animation** (replaces the sliding indicator, removed after review; user's choice). Each tab keeps its own pill, and it appears at once on the tap: no fade of the pill or the label color, and no cross-fade of the tab bar between tabs. `TabList` marks the tapped tab as current before navigating, so the pill does not wait ~200 ms for the route. While a tab change plays (until the new screen has arrived, `NAV_SETTLE_MS` = 330 ms in `transition.ts`), the other tabs take no tap (`aria-disabled`, no press effect), so a second tap cannot cut the running transition short; tapping the current tab never locks, and a change that never arrives frees the tabs after 1.5 s.
- **A5 · Closing a hint** (`Hint.tsx`): on ✕ the hint fades and collapses, and the content below moves up smoothly; it is removed after the animation. The «seen» flag is saved at the tap, as today.

**Block 4 · Cosmetic glint** (added on the user's request during implementation; decoration only, no flow depends on it)
- **Yo's balance coin** (`ProfileCard.tsx`): a light band crosses it every ~4 s, and three tiny sparks twinkle around it, each at its own time («glitter»).
- **Top-bar balance coin** (`AppShell.tsx`, on Hoy and ¿Alguien sabe?): the same band at full strength every ~3.5 s, and three smaller sparks twinkling around it (more glitter, on the user's request).
- **Movimientos coins** (`MovementsCard.tsx`): each floats 2 px up and back every 1.8 s (faster, on the user's request), out of step with the row above, and glints faintly every ~7 s («no tanto como la moneda de Yo»).
- **«✓ Solucionada» in ¿Alguien sabe? cards** (`QuestionCard.tsx`): the same band every ~6 s, each card at its own time.
- Glints come with pauses, never continuous. With «reducir movimiento» everything rests.

**Everywhere**
- Only transform, opacity and color, plus the height of the two things that open or close in place: the offline banner (A4) and a closing hint (A5). Timings with `--m-*` tokens; curves `--ease` / `--ease-enter`.
- With «reducir movimiento» nothing moves: changes show at once, or only through color. The urgent dot stays still.
- No animation blocks a tap: everything under it keeps responding while it runs.
- `DESIGN.md` › Motion names these details so later work follows them.

**Out of scope:**

- **A7 · Pull to refresh with the yapita.** Dropped: the spinner stays (user's choice).
- **A3 · A sliding tab indicator.** Built, then removed after review: it lagged behind the tap and fought the screen's view transition (user's choice).
- New texts (for example a welcome message for the first +5): they need the wiki first.
- Illustrations for empty states, sound or vibration.
- Any change to flows, screens, button order or what a button does.
- Changes to the existing celebrations (bell, «Me sirvió» yapita, `qd-done-*`, fresh letrero).

## Data model

No data changes. Two small hooks in a new file, `src/components/motion.ts`, so components can tell «changed while on screen» from «first render»:

```ts
/** A number that goes up each time `value` changes after its first known (non-null) value.
 *  Use it as a React `key` to replay a CSS animation, or compare with 0 to skip the first render.
 *  `direction` says whether the last change went up or down (numbers only). */
export function useChangeTick<T>(value: T | null): { tick: number; direction: 'up' | 'down' | null };

/** The ids in `ids` that were not there on the first non-empty render: what arrived while on screen. */
export function useArrivedIds(ids: readonly Id[]): ReadonlySet<Id>;
```

New CSS, all in existing files: keyframes `balance-pulse`, `save-settle`, `arrive-rise`, `arrive-glow`, `tag-in`, `urgent-breathe`, `offline-in` / `offline-out`, `hint-out`. No new tokens.

## Implementation plan

1. **Hooks:** `src/components/motion.ts` with `useChangeTick` and `useArrivedIds`. `npm run typecheck`.
2. **Block 1 · A1:** cross-fade and `balance-pulse` on `.shell__balance`, driven by `useChangeTick(balance)` (`direction === 'up'` only). Check with the mock: give a «Me sirvió» → the ★ pulses once; reload → no pulse.
3. **Block 1 · A2:** `.progress > span` to `scaleX`. Check: the bar keeps its look and grows smoothly when the balance rises.
4. **Block 1 · A6 and B1:** `yo-fade` keyed by the count in `SignSheet`; `save-settle` on the bookmark when `aria-pressed` turns true after mount (`useChangeTick`). Check: tile, sheet, question and answer.
5. **Block 2 · A4:** banner in and out, with its height. Check by going offline and back with the page scrolled.
6. **Block 2 · B2:** `useArrivedIds` over answer ids in `QuestionDetail` and comment ids in `AnswerThread`; arrived items get `data-arrived` and the rise and glow. Check with two sessions on Supabase, or the mock's 15 s refresh.
7. **Block 2 · B3, B4 and B5:** Copiado cross-fade; `tag-in` keyed by status via `useChangeTick`; the urgent dot. Check each at 360 px.
8. ~~**Block 3 · A3:** the sliding tab indicator.~~ Removed after review.
9. **Block 3 · A5:** the hint's fade and collapse before removal.
9b. **Block 4:** `shine` on `Yapita` (`strong`, `medium`, `soft`), the sparks, the Movimientos float and `.tag--shine`; the token `--color-shine`.
10. **`DESIGN.md` › Motion:** the new details (pulses that rise and settle back to 1, the breathing dot, things that arrive, the two height exceptions A4 and A5) and the rule that they only play on changes after mount.
11. `npm run typecheck` and `npm run build`.

## Acceptance criteria

- [x] When the balance goes up with the app open, the top bar number cross-fades and the ★ pulses once (about 420 ms, back to scale 1, no smaller than 1).
- [x] Loading the app, a balance going down, or a balance going from loading to a number never pulses.
- [x] The bar toward 100 grows and shrinks smoothly with `scaleX`; on first render it shows its value without animating.
- [x] «A N les sirvió» cross-fades when the count changes with the sheet open.
- [x] Saving shows the bookmark settling from 0.85 to 1 in the tile, the letrero sheet, a question and an answer; unsaving and a failed save only change color.
- [x] The offline banner slides in and out, and the content under it moves with it without a jump.
- [x] An answer or comment that arrives while the question is open rises in once with a fading highlight; nothing animates on open, reopen or reload.
- [x] «Copiar» and «✓ Copiado» cross-fade both ways.
- [x] A status that changes to «Solucionada» or «Cerrada» while on screen fades in, in the card and in the detail; on first render it does not.
- [x] An active «Urgente» tag shows a coral dot that breathes with opacity only; an expired urgency shows no dot.
- [x] Tapping a tab shows its pill at once, with no fade or slide, in the bottom nav, the rail and the sidebar; the tab bar does not fade between tabs (it still fades to and from a standalone page).
- [x] While a tab change plays, tapping another tab does nothing; once the new screen has arrived (~330 ms, at once with reduced motion), every tab answers again.
- [x] Closing a hint fades and collapses it, and the content below moves up smoothly; it does not come back after a reload.
- [x] With «reducir movimiento» on, nothing moves (the dot is still) and every screen works the same.
- [x] Tapping anything while one of these animations runs responds at once.
- [x] No flow, text, screen or button order changed.
- [x] Works at 360 px, 768 px and 1280 px, in light and dark, with text at 130 %.
- [x] Yo's balance coin glints every ~4 s with twinkling sparks; the top-bar coin glints every ~3.5 s with smaller sparks; Movimientos coins float every 1.8 s out of step and glint faintly; «✓ Solucionada» tags in the list glint every ~6 s, not all at once.
- [x] With «reducir movimiento» none of the block 4 decoration moves or shows.
- [x] `DESIGN.md` › Motion describes the new details.
- [x] `npm run typecheck` and `npm run build` pass; `git grep -i "SECRET\|SERVICE_ROLE"` shows no values.

## Changes during implementation

- **`useArrivedIds` takes its baseline from the first loaded render, even an empty one** (`undefined` = not loaded). With «first non-empty render», as the Data model said, the first answer to a question with none would become the baseline and never animate, which breaks the B2 criterion.
- **Two small components** carry the «changed after mount» bookkeeping where it is shown: `BalanceButton` in `AppShell.tsx` (A1; its baseline is taken when it appears, since it is hidden on Yo) and `SavedMark` in `src/components/SavedMark.tsx` (B1, used by the tile, the letrero sheet, the question and the answer). `CopyLabel` in `ContactRequest.tsx` (B3) and `UrgentTag` in `QuestionCard.tsx` (B5, also used by the detail).
- **A2:** the bar animates only after a balance has been shown once (`progress--live`), so the first number lands in place.
- **A3 removed.** The sliding indicator was built (one element moved by the tab index; icons top-aligned; the sidebar tabs as a grid), then tuned after review: the tab bar's view transition cross-faded a still image of the old bar, and the route reached the tabs ~200 ms after the tap. Even with both fixed, the user found it caused too many problems, so it was removed. Then, on request, the tab change lost all motion: no `background-color`/`color` transition on the tabs, the tab bar's view-transition images hidden between tabs (`::view-transition-old(tabbar|sidebar):not(:only-child)`), and `TabList` sets the tapped tab as current with `flushSync` before navigating. Measured: the pill has its final color right after the tap.
- **A4:** the banner's text stays while it leaves (`present`), and offline from the start it is simply there (no animation until the first change).
- **A5:** the hint is removed when its collapse ends, with a 400 ms fallback; its ✕ is disabled while it closes.
- **B1 · the Hoy tile answers at the tap.** Found in the review pass: the tile's bookmark changed only after the save and the refetch of three lists (0.8–1 s in the production build, with no sign of the tap), while the letrero sheet changed at once. `useToggleSaved` now turns a letrero's bookmark over in every cached list and sheet at the tap (`onMutate`) and puts it back if the save fails; questions and answers still wait for the server. Measured: 48–75 ms at 360 px and 1280 px. The sheet goes back to its value before the tap on failure, instead of flipping a second time.

## Decisions

- **Yes:** one spec in three blocks (yapitas and saving; things that arrive or change; navigation) that can be merged separately. If time runs out, the work stops at the end of a block. (User's choice.)
- **No:** two specs (improvements vs new details), or only the yapita moments now.
- **No (after review):** a single tab indicator that slides. It was built and then removed: it moved only once the route caught up with the tap, and the view transition of the tab bar fought it («causa muchos problemas»). (User's choice.)
- **Yes:** the tabs keep their per-tab pill, unchanged from before this spec.
- **Yes:** «new» means an id that was not there when the question opened, your own included. Reopening or reloading animates nothing. (User's choice.)
- **No:** animating only what others send: your own answer appearing would feel different from everyone else's.
- **No:** A7, the spinning yapita on pull to refresh. The spinner stays. (User's choice.)
- **Yes:** the ★ pulse grows to 1.15 and settles back to 1 with a fading glow, only when the balance rises with the app open. It is a pulse, not an overshoot: it never goes below its resting size. (User's choice.)
- **No:** a color-only pulse: too quiet for the main moment of the app.
- **Yes:** the Guardar pulse plays when the button becomes saved, not on every tap. A failed save that goes back shows no pulse. (User's choice.)
- **Yes:** the urgent dot in the card and in the detail, only while the urgency is active. (User's choice.)
- **Yes:** status tags fade in the list and in the detail when they change on screen; the detail's «Me sirvió» celebration is untouched. (User's choice.)
- **Yes:** «changed after mount» decides every animation here (`useChangeTick`, `useArrivedIds`). A screen that opens never plays them, so they mark news, not loading.
- **Yes:** block 4, cosmetic glint on the yapita coins (Yo, top bar, Movimientos) and «Solucionada», with pauses between glints, Movimientos coins floating out of step. Added to this spec because the branch had no commit yet; recorded in `DESIGN.md` as the only decorative loops besides the urgent dot. (User's choice.)
- **No:** continuous glitter, or every coin floating in step: tiring to read next to, and mechanical.
- **Yes:** height may animate for the offline banner and a closing hint, as with «Ver más» in SPEC 27. Without it the page jumps, which is what these points fix.

## Risks

| Risk | Mitigation |
| --- | --- |
| A refetch replaces the whole answers list and everything looks «new». | `useArrivedIds` compares ids, not object identity, and takes its baseline from the first non-empty render. |
| The balance goes up by a refetch after a reload (cached 0, then the real number) and pulses. | `useChangeTick` ignores the change from `null` (loading) to a number, and `balance` is `null` while the wallet loads. A cached old number can still pulse once; acceptable, since the balance did rise. |
| The breathing dot pulls attention all the time. | Opacity only, 1.6 s, small; still with reduced motion. Diego can drop B5 alone if it distracts. |
| Many small animations on one screen feel busy. | Each plays once, on a change, and is short. The breathing dot is the only loop. |
| The banner's height animation competes with the sticky header. | The banner stays inside the sticky header; check while scrolled. |

## What is **not** in this spec

- The spinning yapita on pull to refresh (A7).
- New texts, illustrations, sound or vibration.
- Changes to flows, screens, button order or existing celebrations.

Each one of those, if it lands, goes in its own spec or card.
