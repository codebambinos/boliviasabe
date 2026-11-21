# SPEC 21 — Yo tab: profile, test account, activity and movements

> **Status:** Approved
> **Depends on:** SPEC 01 (`src/data/` hooks), SPEC 07 (session), SPEC 08 («Tu barrio» and the Stellar account), SPEC 09 (Movimientos and «Reintentar»), SPEC 11 (Supabase adapter: `my_*`, `saved_items`, `rewards`), SPEC 16 (precache list in `vite.config.ts`). Board card: T21 (issue #14).
> **Date:** 2026-11-21
> **Objective:** Replace the temporary Yo screen with the final one from the wiki: profile card with stars and «Editar», Mi cuenta de prueba, Mi actividad in four tabs and the full Movimientos list, without Tilcho, with smooth transitions.

## Why this spec exists

`src/pages/YoPage.tsx` is still `YoSample`, a smoke screen («T21 and T29 build the real one»). Compared with `wiki/flujo-final.md` › 3 · Yo and huecos #92, #127, #157, #162, #170, #191, #195:

- Tilcho still shows in the guest view and the profile card. #191 removes him from the whole app.
- The profile card has no stars and no «Editar».
- «Mi actividad» does not exist, although `useMyQuestions`, `useMyAnswers`, `useMySigns` and `useSaved` do.
- Movimientos shows only the last 5, has no «Reintentar» (`useRetryMovement` is unused) and says «Ver registro» instead of «Registro abcd…wxyz» (#157).
- The explorer button says «Ver mi registro público»; the wiki says «Ver en el explorador».
- The reason labels are sample text that is not in the wiki.

## Scope

**In:**

- **Guest view:** «¡Hola, vecino!» + the yapitas sentence + «Entra para guardarlas» + Continuar con Google / Usar mi correo, then Acerca de · Privacidad. No Tilcho.
- **Profile card:** name, «Ciudad · Zona», stars with a decimal comma («4,3»; none → no stars row), badge, balance (pulsing bar while loading, #195), bar towards 100 with «Canje con negocios, próximamente», and an **«Editar»** button.
- **Editar:** `TuBarrioSheet` in edit mode: title «Editar», fields prefilled from the profile, button «Guardar», same validations and suggested zones. Saving updates the session (name, city, zone) and the lists that depend on the city. A toast «Guardado» on success.
- **Mi cuenta de prueba:** short address, Copiar («Copiado»), **«Ver en el explorador»**; states ready / «Preparando tu cuenta» / «Algo falló, intenta de nuevo» + Reintentar (already there; only the button label changes).
- **Mi actividad:** a card with a 4-tab selector: **Mis preguntas · Mis respuestas · Mis letreros · Guardados**.
  - Rows: questions show text + status + answer count; answers show the answer text and open its question; letreros show a thumbnail + title; Guardados lists letreros, preguntas and respuestas together, newest saved first.
  - Content hidden by reports shows the «En revisión» tag to its author.
  - Tap → `/p/:id` (question or answer's question), or the letrero's sheet over Yo (letrero).
  - Loading → skeleton rows. Empty → «Aún no tienes preguntas / respuestas / letreros / nada guardado» + the button to do it (Preguntar · Ir a ¿Alguien sabe? · Subir letrero · Ir a Hoy).
  - The selected tab lives in local state (not in the URL); it resets to «Mis preguntas» on a new visit.
- **Movimientos:** the **5 most recent** first, on every screen, then **«Ver más»** adds 10 more in place and **«Ver menos»** folds back to the first ones, scrolling to the card's heading if it was above the screen. «Ver más» loads the next page (`useMovements` pages of 30, shown 10 at a time from what is loaded, fetching the next page when needed).
  - Each row: reason label, ±N yapitas, «hace…», state (Confirmado / Pendiente / Error), **«Registro abcd…wxyz»** link to the explorer when there is a hash.
  - **Pendiente and Error both show «Reintentar»** (#127), with the button busy while it works.
  - Fixed text «Red de pruebas, sin dinero real». Empty → «Gana yapitas subiendo letreros y ayudando».
  - Tapping the balance elsewhere still lands on `#movimientos` (#162).
- **Order on phones** (#157): perfil → Movimientos → Mi cuenta de prueba → Mi actividad → Ajustes. Desktop keeps the existing `yo-grid` two-column layout with Mi actividad added.
- **Reason labels** (recorded in the wiki first, see Data model).
- **Motion** (all with `prefers-reduced-motion: reduce` → no movement, instant):
  - Tab change in Mi actividad: the selector's active pill slides (`--m-in`, `--ease`) and the list cross-fades + rises 4 px (`--m-panel`, `--ease-enter`).
  - «Ver más»: new rows enter with a short staggered fade-up (30 ms per row, max 10).
  - «Ver más» / «Ver menos»: the list's height glides open or closed in one 320 ms movement (no jump at the end). Closing, the extra rows fade out together while the list closes over them; the list folds in the same frame the animation ends.
  - «Reintentar»: the state chip cross-fades from Error/Pendiente to Confirmado.
  - Balance: the number fades in over the pulsing bar when it arrives (no count-up).
  - «Copiado»: the label cross-fades.
  - Editar sheet: existing `Sheet` enter/leave; after «Guardar» the name and zone on the card fade to the new values.
- **Remove Tilcho** (#191): the two `<img>` in `YoPage.tsx`, `.profile__tilcho` in `src/styles/app.css`, `public/tilcho/`, `'tilcho/*.svg'` in `includeAssets` of `vite.config.ts`, and the rule «Tilcho appears only in the Yo tab» in `CLAUDE.md`.

**Out of scope:**

- **Avisos and the bell** → T24 (issue #17).
- **Ajustes** (Mi celular, final order) → T29 (issue #22). The current Ajustes card stays as it is.
- Canje (T32) and any change to how rewards are paid.
- A public profile or tapping names.
- New routes: everything lives in `/yo`.
- Paging inside Mi actividad (the `my_*` RPCs return the full lists; they are small for the demo).

## Data model

No new tables, columns or migrations. No new `DataApi` methods.

Small changes in `src/data/`:

- `useMyQuestions`, `useMyAnswers`, `useMySigns` and `useSaved` accept `{ enabled?: boolean }` like `useWallet`, so a guest never calls them.
- `useSaveProfile` also invalidates `keys.signs()` and `keys.questions()` when the city changes (Hoy and ¿Alguien sabe? follow the profile's city).
- `saveProfile` (Supabase adapter, `src/data/supabase/auth.ts`) calls `ensureWallet()` **only when the profile is new**; an edit never re-prepares the account. Same in the mock adapter.

Reason labels, a `Record<RewardReason, string>` in `src/pages/YoPage.tsx` (or a small `src/components/movements.ts` if `YoPage` gets split):

| `reason` | Label |
|---|---|
| `bienvenida` | Bienvenida |
| `letrero` | Subiste un letrero |
| `sirvio-l` | Tu letrero le sirvió a alguien |
| `ayuda` | Tu respuesta sirvió |
| `cierre` | Cerraste tu pregunta |
| `urgente` | Pregunta urgente |
| `canje` | Canje |

The amount reads «+5 yapitas» / «−5 yapitas» (never «puntos»; the wiki's «±puntos» in flujo-final and stellar-final is corrected to «±yapitas»).

## Implementation plan

1. **Wiki first** (`boliviasabe-docs`): new row in `huecos-cerrados.md` with the reason labels, «Ver en el explorador», the Mi actividad tabs and «Ver más» of 10; fix «±puntos» → «±yapitas» in `flujo-final.md` and `stellar-final.md`; entry in `log.md`. Push to the docs repo.
2. **Remove Tilcho**: `<img>`s, CSS, `public/tilcho/`, `includeAssets`, the `CLAUDE.md` rule. `npm run build` passes and the precache has no Tilcho.
3. **Data tweaks**: `enabled` on the activity and saved hooks; `saveProfile` only prepares the wallet on a new profile (Supabase + mock); city change invalidates signs and questions. `npm run typecheck`.
4. **Split `YoPage.tsx`** into `YoPage` (guest vs signed-in, layout) and components in `src/components/`: `ProfileCard`, `TestAccountCard`, `MovementsCard`, `ActivityCard`, keeping the current Ajustes card as is. Styles in `src/components/yo.css` (tokens only). The screen looks the same as before this step, minus Tilcho.
5. **Profile card**: stars with comma (`toLocaleString('es-BO', { maximumFractionDigits: 1 })`), «Editar» opening `TuBarrioSheet` with a new `mode: 'edit'` + `initial` profile (title «Editar», button «Guardar», toast «Guardado»).
6. **Movimientos**: labels, ±N yapitas, «Registro abcd…wxyz», «Reintentar» on Pendiente/Error with `useRetryMovement`, 10 + «Ver más» with `fetchNextPage`.
7. **Mi actividad**: tab selector (`role="tablist"`, arrow keys), the four lists with skeletons, «En revisión», empty states with their buttons, navigation to `/p/:id` and `/l/:id`.
8. **Order and layout**: phone order from #157; desktop `yo-grid` with the new card.
9. **Motion** from the Scope list, each wrapped in `prefers-reduced-motion`.
10. **Check** on a phone at 360 px, light and dark, text at 130 %, with the mock and with Supabase (seed accounts in `wiki/pitch.md`).

## Acceptance criteria

- [ ] No Tilcho anywhere: `git grep -i tilcho` only finds the wiki/specs history, and `public/tilcho/` is gone.
- [ ] Guest Yo shows «¡Hola, vecino!», the yapitas sentence, both sign-in buttons and Acerca de · Privacidad, and makes no `my_*`, `saved_items` or `rewards` request.
- [ ] Signed in, the profile card shows name, «Ciudad · Zona», stars with a comma («4,3») when there are ratings, the badge and the balance; while the balance loads it shows the pulsing bar, never another account's number.
- [ ] «Editar» opens the sheet prefilled; «Guardar» with a new zone updates the card without a reload and shows «Guardado»; changing the city makes Hoy list the new city; the wallet is not prepared again (no Friendbot call).
- [ ] «Editar» keeps «Guardar» off with «Falta tu nombre» / «Falta tu zona» like «Tu barrio».
- [ ] Mi cuenta de prueba: «Copiar» copies the full address and shows «Copiado»; «Ver en el explorador» opens stellar.expert testnet; «Preparando tu cuenta» and the error + Reintentar states still work.
- [ ] Movimientos shows 5 rows on every screen; with more than 5 there is «Ver más», which adds 10 in place; with no more there is no «Ver más».
- [ ] After «Ver más», «Ver menos» returns to the first rows and brings the Movimientos heading into view.
- [ ] Each movement shows its wiki label, «+N yapitas» / «−N yapitas», «hace…», its state and «Registro abcd…wxyz» when it has a hash.
- [ ] A Pendiente or Error movement shows «Reintentar»; tapping it disables the button and the row updates when the server answers.
- [ ] Mi actividad has the four tabs; each lists the right items, opens the right detail, shows skeletons while loading and its empty text + button when empty.
- [ ] My hidden-by-reports content shows «En revisión» in Mi actividad.
- [ ] On a phone the order is perfil → Movimientos → Mi cuenta de prueba → Mi actividad → Ajustes; tapping the balance in the header lands on Movimientos.
- [ ] Tab change, «Ver más», «Reintentar» and «Editar» animate; with «reducir movimiento» nothing moves.
- [ ] No «puntos», «XLM», «tokens», «cripto» or bolivianos on screen.
- [ ] Works at 360 px in light and dark with text at 130 %; touch targets ≥ 44 px.
- [ ] The wiki has the new huecos row, the «±yapitas» fix and the log entry.
- [ ] Tapping Sistema, Claro or Oscuro switches the theme on in a circle that grows from that option; with «reducir movimiento» it changes at once.
- [ ] `npm run typecheck` and `npm run build` pass; `git grep -i "SECRET\|SERVICE_ROLE"` shows no values.

## Changes during implementation

- **`useEditProfile`** (`src/data/hooks/session.ts`) instead of changing `useSaveProfile`: «Editar» does not change who is signed in, so it keeps balance, movements and activity in cache (no pulsing bar) and only refetches signs, questions, activity and saved. «Tu barrio» keeps `useSaveProfile` as it was.
- **City after «Editar»:** the viewing city is shell state, not the profile's, so Yo calls `shell.setCity(newCity)` after saving.
- **Guardados** is grouped by kind (Letreros · Preguntas · Respuestas), each newest saved first: `saved_items` returns three lists with no saved date, so one mixed order is not possible without a server change.
- **Spec number:** written as SPEC 18, renumbered to **SPEC 21** after pulling main, which had already taken 18 (answer reminder), 19 (WhatsApp previews) and 20 (stellar:reset). The wiki decision went the same way: #209 → **#213**.
- **A letrero from Mi actividad opens its sheet over Yo** (`openSign` from the shell) instead of navigating to `/l/:id`: since SPEC 19, `/l/:id` opens Hoy in the letrero's city, which would take the person out of Yo.
- **`openUpload`** was added to `ShellContext` for the «Subir letrero» button of the empty Mis letreros tab.
- The mock adapter already prepared the wallet only the first time; only the Supabase adapter changed.
- `DESIGN.md` and `PRODUCT.md` said Tilcho lives in Yo; both now say he is not in the app (#191).
- **Layout on a wide frame:** two columns that stack on their own (left: profile, cuenta, Ajustes; right: Movimientos, Mi actividad), instead of one grid with shared rows, so a long Movimientos or «Ver más» never leaves gaps on the left. On a phone the column wrappers use `display: contents` and CSS `order` keeps the wiki order (#157); the keyboard order there follows the columns.
- **Scope added (user's request): Ajustes › Tema switches on, not cross-fades.** Tapping Sistema, Claro or Oscuro makes the new theme grow as a circle from the tapped option until it covers the screen (`withThemeReveal` in `src/components/themeFade.ts` sets the center and radius; the 480 ms `clip-path` animation is pure CSS, `html.theme-reveal` in `src/styles/app.css`, so it starts on the first frame and only `clip-path` moves). Without View Transitions it keeps the cross-fade; with «reducir movimiento» it changes at once. The rest of the Ajustes card is still T29's.

## Decisions

- **Yes:** Mi actividad as one card with four tabs. Everything is visible in Yo for the demo, with no new routes. (User's choice.)
- **No:** a page per activity list (`/yo/preguntas`…): more routes and Back handling for the same data.
- **Yes:** Movimientos in Yo with the 5 most recent first + «Ver más» / «Ver menos», on every screen: Mi cuenta de prueba and Mi actividad stay close, and with more than 5 there is always «Ver más». (A first try showed 10 on a wide screen; with the seed's 8 movements the button never appeared there, so the user asked for 5 everywhere.) Keeps #162 (tap balance → Movimientos) simple. (User's choice.)
- **No:** an «Ir a mi cuenta de prueba» jump button under a long list: it fixes one card only, adds a floating control the wiki does not have and leaves the list long.
- **No:** a separate `/yo/movimientos` page.
- **Yes:** reuse `TuBarrioSheet` with an edit mode. Same validations, suggested zones and full-screen sheet (#170). (User's choice.)
- **Yes:** an edit never calls `ensureWallet`: the account already exists and Friendbot must not be called again.
- **Yes:** the spec proposes the reason labels and the implementation writes them in the wiki before the code (CLAUDE.md: product changes go to the wiki first). (User's choice.)
- **Yes:** add transitions to tabs, «Ver más», «Reintentar», balance and «Editar», using the motion tokens and always respecting «reducir movimiento». (User asked for a smoother feel.)
- **No:** a count-up animation on the balance: it would show numbers that are not the real balance (#195).
- **No:** paging Mi actividad; the RPCs return full lists and the seed is small.
- **Deferred:** Avisos (T24) and Ajustes (T29).

## Risks

- **Editing the city** changes which lists the person sees. If an open list keeps the old city in cache, Hoy shows the wrong city until refresh → invalidate signs and questions on save (step 3).
- **`YoPage.tsx` split** touches the same file T29 will edit. Keep the Ajustes card untouched as its own component so T29 only replaces it.
- **Motion on low-end phones**: keep animations to `opacity` and `transform` only, and cap the stagger at 10 rows.
- **Wiki edits** go to another repo (`boliviasabe-docs`); if they are not pushed, the PR contradicts the wiki. Step 1 is done first.
