# SPEC 27 — Visual and motion consistency

> **Status:** Implemented
> **Depends on:** SPEC 05 (Hoy grid, `SignTile`, the fresh-letrero entrance), SPEC 21 (Yo motion, `MovementsCard` «Ver más»), SPEC 24 (the bell celebration). Board card: T43 (issue #76). The `LoadFailedPage` comes from the T31 fixes (PR #71).
> **Date:** 2026-11-22
> **Objective:** Bring the app's CSS and motion in line with `DESIGN.md`: fix two visual bugs, the animations that break its motion rules, the missing press states and the hand-written timings, colors and shadows, and update `DESIGN.md` where the code is right and the doc is not.

## Why this spec exists

A review against `DESIGN.md` (Color, Space, Components, States, Motion), plus a pass at 360 px in light and dark with text at 130 %, found two bugs and a set of small mismatches.
Most of them are CSS. Three are cases where the code is the better choice and `DESIGN.md` is what needs to change.
Already fine and not touched: reduced motion is covered everywhere (the global rule in `app.css`, and every JS animation checks it), there are no 700/800 weights, no px font sizes, and every dark rule has its pair.

## Scope

**In:**

- **V1 · «Cómo llegar» icon:** in the letrero sheet at 360 px the map icon shrinks to 7 px wide (20 expected). Icons inside `.btn` get `flex: none` in `src/styles/app.css`.
- **V2 · «Reintentar» in `LoadFailedPage`** (`src/pages/UnavailablePage.tsx`): `btn` → `btn btn--secondary`, as in every other error state (`DESIGN.md` › States). «Ir a Hoy» stays secondary too.
- **A1 · Tab swipe snap-back:** `SPRING` (`cubic-bezier(0.34, 1.4, 0.64, 1)`, overshoots) in `src/components/useTabSwipe.ts` is replaced by the `--ease-enter` curve (`cubic-bezier(0.22, 1, 0.36, 1)`).
- **A2 · Fresh-letrero ring** (`src/components/sign-tile.css`, `tile-fresh-ring`): stops animating `box-shadow`. The ring becomes a pseudo-element with a 4 px brand outline that animates opacity (and optionally a small scale), same timing and look.
- **A5 · Screen change:** the new screen starts after the old one has gone: `vt-in` and `vt-fade-in` delay 90 ms → 110 ms in `src/components/app-shell.css`.
- **A6 · Press states, by size:**
  - Small targets (`.icon-btn`, `.link-btn`, filter `.chip`, `.tabs__item`): 1 px down and scale .985 in `--m-press`, like `.btn`. `.icon-btn` keeps its sunken background too.
  - Full-width rows (`.row__link`, Ajustes, Avisos and Mi actividad rows): only the sunken background in `--m-press`, no scale.
  - Disabled controls do not move.
- **A7 · Timings:**
  - New tokens in `src/styles/tokens.css`: `--m-sheet-in: 260ms` and `--m-exit: 160ms`.
  - Sheets (`sheet.css`) enter with `--m-sheet-in` and leave with `--m-exit`; toasts (`toast.css`) leave with `--m-exit` (180 ms → 160 ms).
  - `Sheet.tsx` exports `EXIT_MS = 160`. `Toast.tsx` uses it instead of its own 180. The ⋯ menu delay in `SignSheet.tsx` (fixed 180) and the 160 ms waits in `AskQuestionSheet.tsx` and `UploadSignSheet.tsx` use it too.
  - Looping animations (skeleton 1.6 s, spinners 700 ms, `num-wait`) stay as they are.
- **A8 · Spinner:** `.upload__spinner` and its keyframes move from `upload-sign-sheet.css` to `app.css` as `.spinner`. Every use is renamed. `AskQuestionSheet`, `AvisosSheet`, `MyPhoneSheet`, `QuestionDetail` and `TuBarrioSheet` drop the `upload-sign-sheet.css` import if it was only there for the spinner.
- **V3 · Colors to tokens** (same values, nothing changes on screen):
  - `--color-logo-tile: #f5f2ef`: the logo's light tile on the dark ground (`about-sheet.css`, `app-shell.css`, `page-frame.css`).
  - `--color-on-fill: #1f1a17`: ink on the green «Solucionada» tag and on the yapita disc (`app.css`), the same in light and dark.
  - `--color-info-text`: `var(--color-info)` in light, `#9cc0f0` in dark (both dark blocks of `tokens.css`); `.tag--info` uses it and its two dark overrides in `app.css` go away.
  - `--color-on-danger: #fff`: the text on Borrar (`.btn--danger`).
- **V4 · Shadow and radius:** `--shadow-on-photo: 0 1px 3px rgb(0 0 0 / 0.18)` for Guardar over the photo (`sign-tile.css`); `install-steps.css` uses `--r-sm` instead of `0.4rem`.
- **`DESIGN.md`:**
  - Motion: opening and closing a list may animate its height (only that case: Movimientos «Ver más» / «Ver menos»). (A3)
  - Motion: the new-notice celebration (bell rings, bubble bounces, sparkles, wiki #216) is the one exception to «no bounce». (A4)
  - Components › Screen title: Hoy keeps «Hoy en <ciudad>» for screen readers only; the city is already in the top bar. (V5)
  - Motion › Press: small targets move (1 px, .985); full-width rows only darken.
  - Motion: name `--m-sheet-in` and `--m-exit` next to the other timings.

**Out of scope:**

- Changing the Movimientos height animation, the bell celebration or Hoy's title in code (A3, A4 and V5 keep their current behavior).
- The light variant of the logo (`DESIGN.md` › Open items). Only its tile color becomes a token.
- Moving the remaining raw durations that are not sheet or toast exits (for example 280, 320, 420, 520 ms) to tokens.
- New animations, or any change to texts, flows or the wiki.
- Desktop-only layout issues not listed above.

## Data model

This feature adds no data. The only new names are CSS tokens and one exported constant:

```css
/* src/styles/tokens.css, :root */
--m-sheet-in: 260ms;
--m-exit: 160ms;
--color-logo-tile: #f5f2ef;
--color-on-fill: #1f1a17;
--color-info-text: var(--color-info);   /* dark blocks: #9cc0f0 */
--color-on-danger: #fff;
--shadow-on-photo: 0 1px 3px rgb(0 0 0 / 0.18);
```

```ts
// src/components/Sheet.tsx
/** How long a sheet takes to leave; toasts and «after the sheet closes» waits use the same value (--m-exit). */
export const EXIT_MS = 160;
```

## Implementation plan

1. **Bugs:** V1 (`flex: none` for `.btn` icons) and V2 (`btn--secondary`). Check: the letrero sheet at 360 px shows the map icon at 20 px; `/l/3?mock=error` shows a secondary «Reintentar».
2. **Tokens:** add the seven tokens to `tokens.css` (with the dark value of `--color-info-text` in both dark blocks). Nothing uses them yet; `npm run build`.
3. **V3 and V4:** replace the hand-written colors, the shadow and the radius with the tokens; remove the two `.tag--info` dark overrides. Check: light and dark look the same as before.
4. **A1, A2 and A5:** the swipe curve, the fresh-letrero ring as a pseudo-element, the 110 ms delay. Check: release a half swipe (no overshoot), publish a letrero (the ring looks as before), switch tabs (no frame with both screens).
5. **A6:** press states for small targets and rows. Check each one at 360 px by touch emulation.
6. **A7:** `--m-sheet-in` and `--m-exit` in `sheet.css` and `toast.css`; export `EXIT_MS`; use it in `Toast.tsx`, `SignSheet.tsx`, `AskQuestionSheet.tsx` and `UploadSignSheet.tsx`. Check: sheets and toasts leave in the same time; the ⋯ menu action starts right after the menu is gone.
7. **A8:** move the spinner to `app.css` as `.spinner`, rename its uses, drop the imports that only served it. Check: Publicar, Tu barrio, Mi celular, Avisos and «Me sirvió» show the spinner as before.
8. **`DESIGN.md`:** the five updates listed in Scope.
9. `npm run typecheck` and `npm run build`.

## Acceptance criteria

- [x] At 360 px, the «Cómo llegar» icon is 20 × 20 px.
- [x] Every button icon in Hoy, ¿Alguien sabe?, Yo and the letrero sheet keeps its width at 360 px and at 130 % text.
- [x] `LoadFailedPage` has no filled button: «Reintentar» and «Ir a Hoy» are secondary.
- [x] Releasing a half tab swipe returns the screen without passing its resting place.
- [x] The fresh-letrero ring no longer animates `box-shadow` and looks the same.
- [x] Switching screens never shows the old and the new one at the same time.
- [x] `.icon-btn`, `.link-btn`, filter chips and tabs move 1 px down and to .985 when pressed; full-width rows only darken; disabled controls do not move.
- [x] Sheets enter with `--m-sheet-in` and sheets and toasts leave with `--m-exit` (160 ms).
- [x] `SignSheet.tsx`, `Toast.tsx`, `AskQuestionSheet.tsx` and `UploadSignSheet.tsx` have no hand-written 160 or 180 ms exit waits; they use `EXIT_MS`.
- [x] `.upload__spinner` no longer exists; `.spinner` lives in `app.css`, and the spinners in Publicar, Preguntar, Tu barrio, Mi celular, Avisos and «Me sirvió» look as before.
- [x] `git grep -nE "#[0-9a-fA-F]{3,6}\b" -- "src/**/*.css" ":!src/styles/tokens.css"` finds only comments.
- [x] The tile's Guardar shadow uses `--shadow-on-photo`, and `install-steps.css` uses `--r-sm`.
- [x] In light and dark, «Solucionada», the yapita, the info tag, Borrar and the logo tile look the same as before.
- [x] With «reducir movimiento» on, nothing moves and everything still works.
- [x] `DESIGN.md` has the five updates from Scope.
- [x] `npm run typecheck` and `npm run build` pass; `git grep -i "SECRET\|SERVICE_ROLE"` shows no values.

## Changes during implementation

- **A2 · The ring is an `outline` whose color fades, not a pseudo-element.** `.tile__media` clips its children (`overflow: hidden`), so a pseudo-element ring just outside the photo would be cut off. An outline is not clipped, follows the rounded corners, and only its color animates, so it still meets «transform, opacity and colors only».
- **A5 · The bars' fade-in** (`::view-transition-new(topbar|tabbar|sidebar)`, also `vt-fade-in`) moved from 90 ms to 110 ms too, with the screen.
- **V3 · Four more raw colors**, found by the acceptance check and not in the review (user's choice): the ink on the yellow price uses `--color-on-fill`; the black behind a full-screen photo is a new token `--color-photo-backdrop` (`#0d0b0a`); Borrar's hover mixes with `--color-ink`, like the fuchsia button; the chip-row mask uses the keyword `black`, since a mask only reads alpha.
- **A8 · `QuestionDetail`** used the spinner without importing `upload-sign-sheet.css` (it worked only because another screen had loaded it). With `.spinner` in `app.css` that hidden dependency is gone.

## Decisions

- **Yes:** allow animating height only to open and close a list, and say so in `DESIGN.md`. It is what keeps the page from jumping on «Ver más». (User's choice.)
- **No:** a fade without animating the height. It meets the old rule, but the page jumps.
- **Yes:** keep the bell's bounce as the one exception, recorded in `DESIGN.md`. Wiki #216 decided it; the doc had not caught up. (User's choice.)
- **No:** removing the bounce. It would undo a product decision and need a new wiki entry.
- **Yes:** Hoy's title stays for screen readers only, and `DESIGN.md` says so. The city is already in the top bar, and the grid shows more photos above the fold. (User's choice.)
- **No:** showing «Hoy en Cochabamba» like the other tabs. Consistent, but it pushes the grid down.
- **Yes:** press states by size: small targets move, full-width rows only darken. Scaling a whole row looks wrong. (User's choice.)
- **No:** the same 1 px and .985 on everything, rows included.
- **Yes:** one exit time, 160 ms, for sheets and toasts, with `EXIT_MS` exported from `Sheet.tsx` so the JS waits cannot drift from the CSS. (User's choice.)
- **No:** a token for each current value (260, 160, 180). It orders the code but keeps a difference nobody chose.
- **Yes:** the proposed token names, with the same values, so nothing changes on screen. `--color-on-fill` stays dark in both themes because the fills it sits on do not change. (User's choice.)
- **No:** reusing `--color-ink` for ink on fills: it turns light in dark mode and the text on green and orange would become unreadable.
- **Yes:** only `DESIGN.md` records these decisions. They are design rules; no flow or wiki text changes. (User's choice.)
- **Yes:** one spec for all of T43, in the order bugs → motion → timings and pieces → tokens → `DESIGN.md`. All of it is CSS and a few constants. (User's choice.)

## Risks

| Risk | Mitigation |
| --- | --- |
| Moving the spinner breaks a screen that still uses `.upload__spinner`. | Step 7 renames every use found by `git grep upload__spinner`; the criterion checks that the class no longer exists. |
| Dropping `upload-sign-sheet.css` from a sheet also drops another class it used. | Remove an import only after checking that the component uses no other `upload__*` class. |
| The toast leaving in 160 ms instead of 180 ms feels abrupt. | 20 ms is below what a person notices; it matches the sheets. |
| Press states on `.tabs__item` fight with the swipe gesture. | The press is a transform on the button, not on the screen the swipe moves; check by swiping from a tab. |
| `--color-info-text` defined with `var()` in light and a hex in dark diverges from `--color-info` later. | Both live in `tokens.css`, next to each other. |

## What is **not** in this spec

- Code changes to the Movimientos height animation, the bell celebration or Hoy's title.
- The logo's light variant.
- Tokens for the remaining raw durations.
- New animations, texts, flows or wiki changes.

Each one of those, if it lands, goes in its own spec or card.
