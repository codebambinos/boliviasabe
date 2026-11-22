# SPEC 24 — Avisos: the bell's list and the entry in Yo

> **Status:** Implemented
> **Depends on:** SPEC 22 (Avisos data: `Notice`, `useNotices`, `useUnreadNotices`, `useMarkNoticeRead`, `useMarkAllNoticesRead`, mock with the 8 kinds), SPEC 12 (`useRespondContact`, `ContactBox`), SPEC 19 (`/l/:id` opens Hoy with the letrero's sheet), SPEC 21 (Yo cards and motion), SPEC 23 (Mi celular, `Toast` in a portal). Board card: T24 (issue #17).
> **Date:** 2026-11-21
> **Objective:** Build the Avisos screen: the bell and a row in Yo open one sheet that lists the person's notices, opens each one, marks them read and lets them answer a contact request.

## Why this spec exists

T40 (SPEC 22) left the data ready: notices already built (who, a piece of text, where it opens, grouped «Me sirvió»), the bell's live count and marking read.
The screen is still the placeholder `AvisosSheet` in `src/components/ShellLayout.tsx`, which always says «Sin avisos por ahora». The bell already shows the count (`useUnreadNotices`), but nothing lists the notices, and Yo has no way in.
Rules: `flujo-final` › 3 · Yo › Avisos, `reglas-finales` › Notificaciones, huecos #110, #126, #202-#208, #214.

## Scope

**In:**

- **One sheet «Avisos»** (`Sheet`, `variant="bottom"`), opened from the bell (all tabs, signed in) and from a row in Yo. It replaces the placeholder in `ShellLayout.tsx`.
  - Header: title «Avisos» and, when something is unread, the button **«Marcar todo como leído»**.
  - The list (`useNotices`), newest first, 30 at a time, then **«Ver más»** (`fetchNextPage`) at the end, like Movimientos.
  - **Each notice:** an icon for its kind, the line from the table below, the piece of text (2 lines at most), «hace…».
  - **Unread** notices are highlighted (soft background + a dot); the highlight fades out when they become read.
  - **Tap** a notice → it is marked read (`useMarkNoticeRead`) and opens what it points to, after the sheet closes (`afterSheetPop`):
    - `open.kind === 'question'` → the shell's `openQuestion(id)` (desktop panel or `/p/:id`).
    - `open.kind === 'sign'` → navigate to `/l/:id` (Hoy with the letrero's sheet, SPEC 19).
    - `open === null` → the sheet shows, in place of the list, **«Esto ya no está disponible»** + **«Ir a Hoy»** and a way back to the list. The notice is still marked read.
  - Empty → «Sin avisos por ahora». Loading → skeleton rows. Error → «Algo falló, intenta de nuevo» + Reintentar.
- **Texts of each notice** (as the push, `lib/push/message.ts`; `actor` missing → «Un vecino»):

  | `kind` | Line |
  |---|---|
  | `answer` | «Ana respondió tu pregunta» |
  | `comment` | «Ana comentó en un hilo» |
  | `helpful` | «A Ana le sirvió tu respuesta» |
  | `sign_helpful` | «A Ana le sirvió tu letrero»; with `count > 1`: «A 4 vecinos les sirvió tu letrero» (#214) |
  | `contact_request` | «Ana te pide tu contacto» |
  | `contact_accepted` | «Ana aceptó compartir su contacto» |
  | `urgent` | «Pregunta urgente en Sarco» (`zone`; missing → «en tu zona») |
  | `reminder` | «¿Alguna respuesta te sirvió?» |

  Under the line: `text` when there is one.
- **Contact request inside the notice** (`kind === 'contact_request'`, `contact.status === 'pending'`, not requested by me):
  - Buttons **Aceptar** / **Ahora no** in the notice (`useRespondContact` with `contact.requestId` and the question id from `open`).
  - One line above them: «Si aceptas, compartes tu correo y tu celular de Ajustes.» when Mi celular has a number, or «Si aceptas, compartes tu correo.» when it does not (`useMyPhone`). Aceptar sends the saved phone.
  - While it works, the tapped button shows the spinner. Answering marks the notice read.
  - Once accepted (`contact.status === 'accepted'` with `other`), the notice shows the other person's details with the same `ContactBox` as the thread (#110). «Ahora no» → the line «Preferiste no compartir tu contacto».
  - A `contact_accepted` notice also shows the `ContactBox` with the other person's details.
  - To share a different number, the person taps the notice and answers in the question (unchanged).
- **Entry in Yo:** a card «Avisos» after Mi actividad and before Ajustes, with one row: bell icon, «Avisos», and «N sin leer» or «Al día». Tapping it opens the same sheet.
- **Bell:** unchanged count logic (SPEC 22); the number pops softly when it changes.
- **Motion** (off with «reducir movimiento»): the sheet enters and leaves like the others; rows from «Ver más» rise in one after another (as Movimientos); the unread highlight fades out when read; the «Esto ya no está disponible» step slides in over the list; the bell's number pops on change; the contact buttons cross-fade into the result.

**Out of scope:**

- Data, SQL, Realtime and the mock's notices (SPEC 22, Diego).
- A push tap opening Avisos («o en Avisos», `flujo-final` › Transversal): push already opens the element itself.
- A `/avisos` route or page.
- Deleting notices, or filters by kind.
- Changing the notification switches (Ajustes › Notificaciones, T27).

## Data model

No new tables, migrations or `DataApi` methods. The screen uses SPEC 22's contract as is:

```ts
type Notice = {
  id: Id; kind: NoticeKind; createdAt: string; read: boolean;
  actor: string | null; count: number; text: string | null; zone: string | null;
  open: { kind: 'question' | 'sign'; id: Id } | null;
  contact: ContactState | null;
};
useNotices()            // pages of 30: data.pages[].items, fetchNextPage
useUnreadNotices()      // the bell's number, live
useMarkNoticeRead()     // mutate(notice)
useMarkAllNoticesRead() // mutate()
```

New in `src/components/`:

- `notices.ts`: `noticeLine(notice): string` (the table above) and the icon per kind.
- `ContactBox` exported from `ContactRequest.tsx` (today it is local).

## Implementation plan

1. **Wiki first** (`boliviasabe-docs`): new row in `huecos-cerrados.md` (next free number) with the sheet and its header, the line per kind, the contact buttons and their line, «Preferiste no compartir tu contacto», «Esto ya no está disponible» inside the sheet, the Yo card («N sin leer» / «Al día») and «Ver más»; `flujo-final.md` › Avisos points to it; entry in `log.md`.
2. **`notices.ts`**: `noticeLine` and icons. Export `ContactBox` from `ContactRequest.tsx`.
3. **`AvisosSheet.tsx`** (`src/components/`): header with «Marcar todo como leído», list with skeleton / error / empty, «Ver más», tapping a notice (mark read, close, open), the «Esto ya no está disponible» step. Replace the placeholder in `ShellLayout.tsx`; the shell passes `openQuestion` and navigation.
4. **`NoticeContact`** inside the notice: Aceptar / Ahora no with the saved phone and its line, spinner, result (`ContactBox` or «Preferiste no compartir tu contacto»).
5. **Yo:** the «Avisos» card with its row; it opens the shell's sheet (a new `openAvisos` in `ShellContext`).
6. **Motion** from the Scope list, all respecting «reducir movimiento».
7. **Check** at 360 px and on desktop, light and dark, text at 130 %, with the mock (the 8 kinds, the group, the unavailable one, the pending request) and with Supabase (seed accounts).

## Acceptance criteria

- [x] Signed in, the bell shows the unread count; tapping it opens the «Avisos» sheet. A guest sees no bell count and no Avisos card.
- [x] The Yo card «Avisos» shows «N sin leer» or «Al día» and opens the same sheet.
- [x] Each of the 8 kinds shows its line from the table, its text (at most 2 lines) and «hace…»; with no actor it says «Un vecino».
- [x] A grouped letrero shows «A N vecinos les sirvió tu letrero» as one notice.
- [x] Unread notices are highlighted; tapping one marks it read, the bell's number goes down, and it opens its question (panel on desktop, `/p/:id` on a phone) or its letrero (Hoy with its sheet).
- [x] A notice with `open === null` shows «Esto ya no está disponible» + «Ir a Hoy» inside the sheet, and a way back to the list.
- [x] «Marcar todo como leído» clears every highlight and sets the bell to 0; it is hidden when nothing is unread.
- [x] A pending contact request shows Aceptar / Ahora no with the right line (with or without Mi celular); Aceptar shows the other person's details; Ahora no shows «Preferiste no compartir tu contacto»; both mark it read.
- [x] With more than 30 notices, «Ver más» loads the next ones at the end of the list.
- [x] Empty → «Sin avisos por ahora»; loading → skeleton; error → «Algo falló, intenta de nuevo» + Reintentar.
- [x] The sheet, the new rows, the read highlight, the unavailable step, the bell's number and the contact result animate; with «reducir movimiento» nothing moves.
- [x] Works at 360 px and on desktop, in light and dark, with text at 130 %; touch targets ≥ 44 px.
- [x] No «puntos», «XLM», «tokens», «cripto» or bolivianos on screen; the texts match the wiki.
- [x] The wiki has the new huecos row and the log entry.
- [x] On a phone, tapping an answer, «Me sirvió» or comment notice opens the conversation scrolled to that answer or comment, framed (border + breathing ring) for about 3 s; other kinds open the question at its top. On desktop it shows ¿Alguien sabe? with the card framed and the conversation in the panel with the answer or comment framed.
- [x] When the unread number goes up, the bubble bounces, golden sparkles burst and the bell rings for about 10 s; going down or signing in plays nothing; with «reducir movimiento» nothing moves.
- [x] `npm run typecheck` and `npm run build` pass; `git grep -i "SECRET\|SERVICE_ROLE"` shows no values.

## Changes during implementation

- **The wiki row is #216.**
- **Scope added (user's request): a question opens framed.** On a **phone**, tapping a question's notice opens the conversation (`/p/:id`) and scrolls to the **answer or comment** the notice is about, framed with a fuchsia border and a ring that breathes out twice, fading after 2.8 s (`focus` in the navigation state, read by `QuestionDetail`; a hidden older comment unfolds its thread). Answers, «Me sirvió» and comments are found by their text, which the notice carries in full; urgent, contact and reminder notices open the question at its top; if nothing matches, it opens at the top. On **desktop** it goes to ¿Alguien sabe? in the question's city (`fetchQuestion`, started while the sheet closes) with its card framed the same way (`data-spotlight` on `QuestionCard`), and the conversation in the panel with the answer or comment framed. The requests are dropped from history, so Back or a reload do not replay them. The scroll is tried again after the screen change, whose scroll restoration would otherwise undo it.
- **Scope added (user's request): the bell celebrates a new notice.** When the unread number goes up, for about 10 s (5 cycles of 2 s, each a burst and a rest) the bubble bounces, six golden sparkles burst around it and the bell rings (`BellButton.tsx`). Going down plays nothing, and the first count after signing in is not treated as new. Small elements with transform and opacity only; off with «reducir movimiento». This replaces the soft pop on every change.
- **Motion classes of their own** (`aviso--rise`, `aviso--fade`, `avisos__step` in `avisos-sheet.css`): the sheet lives in the shell and opens on any tab, so it does not rely on Yo's `yo.css`.
- **The unavailable step keeps the list's scroll:** «Volver a Avisos» returns to the same place in the list.
- **«Aceptar» says «Aceptando…»** with the spinner while it works; «Ahora no» shows the spinner too.
- **Yo order:** `.yo-grid__avisos` takes `order: 5` and Ajustes moves to 6, so phones show perfil → Movimientos → cuenta → Mi actividad → Avisos → Ajustes; on desktop the card goes in the right column under Mi actividad.

## Decisions

- **Yes:** one sheet from the bell and from a Yo row, no new route. The placeholder sheet already lives in the shell, and every tab has the bell. (User's choice.)
- **No:** a `/avisos` page: a route, Back handling and transitions for the same list.
- **Yes:** Aceptar / Ahora no inside the notice, sharing the e-mail and the phone saved in Ajustes › Mi celular, with a line that says so. (User's choice.)
- **No:** the phone field inside the notice: the row grows too much. To share another number, the person answers from the question.
- **Yes:** «Ver más» at the end of the list, like Movimientos. (User's choice.)
- **No:** loading older notices on scroll: inside a sheet it is easier to fail or jump.
- **Yes:** the same motion as SPEC 21 and SPEC 23. (User's choice.)
- **Yes:** an unavailable notice shows «Esto ya no está disponible» inside the sheet instead of leaving it: the person stays in Avisos and can go back to the list. Same text and «Ir a Hoy» as `UnavailablePage` (#126).
- **Yes:** the lines follow the push texts (#203), so a push and its notice say the same; the group uses «vecinos» as in #214.
- **Yes (added):** on a phone a notice goes straight to the conversation and the exact answer or comment, framed. (User's choice, after a first try that only framed the card in the list.) On desktop the list and the panel are both on screen, so both are framed.
- **Yes:** the answer or comment is found by its text, which the notice already carries in full (0010_notices.sql), so SPEC 22's SQL does not change. If the text was edited or deleted, the question opens at its top.
- **Yes (added):** a new notice makes the bell celebrate (bounce, sparkles, ring), only when the count goes up. (User's choice.)
- **Yes:** the Yo card sits after Mi actividad and before Ajustes, the order in which `flujo-final` lists Yo.

## Risks

- **Opening from a sheet:** the sheet owns a history entry. Opening the question or the letrero must wait for it to close (`afterSheetPop`), or Back lands in the wrong place.
- **Live count vs. the list:** a new notice can arrive while the sheet is open. SPEC 22 invalidates the list and the count together, so a new row appears at the top; the highlight must not jump the scroll position.
- **Answering a contact from Avisos and from the question** at the same time: `useRespondContact` invalidates both the question and the notices, so both show the final state.
