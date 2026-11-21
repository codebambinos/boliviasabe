# SPEC 10 — ¿Alguien sabe?: list, ask, detail, answer and close

> **Status:** Implemented
> **Depends on:** SPEC 01 (data layer and mock adapter), SPEC 04 (routes and `ShellLayout`), SPEC 05 (Hoy, whose list/search/tags pattern is reused), SPEC 06 (upload sheet pattern), SPEC 07 (`AuthGate`, pending actions, drafts), SPEC 08 («Tu barrio»). Board card: T20 (issue #13). Unlocks T22, T23 and T39's questions part.
> **Date:** 2026-11-21
> **Objective:** Replace the temporary «¿Alguien sabe?» screen with the real one: a list of questions, «Preguntar» (with similar questions, urgent and the limits), the question detail with its answers, and the answer, «Me sirvió» and «Ninguna me sirvió» actions, all running on the mock adapter.

## Why this spec exists

`src/pages/PreguntasPage.tsx` and `QuestionDetailPage.tsx` are placeholders from SPEC 04. The data layer already has everything the wiki asks for (`questions.list/get/similar/create/remove/closeWithoutSolution`, `answers.create/markHelpful/markNotHelpful/remove`, `saved`, `reports`, the question limits in `src/data/mock/rules.ts`), and the hooks exist in `src/data/hooks/questions.ts`. What is missing is every screen. The flow is fixed by `flujo-final.md › 2 · ¿Alguien sabe?` and `reglas-finales.md › Preguntas`; this spec fixes the technical shape and the copy the wiki leaves open.

The yapitas of «Me sirvió» and of closing come from the data layer (the mock now, `/api/stellar/premiar` through T39 later): the screens only call the hooks.

## Scope

**In:**

- **List** (`src/pages/PreguntasPage.tsx`, `src/components/QuestionCard.tsx`, `question-card.css`): the same top bar as Hoy (already in the shell), the title, a search field and the tag chips (`ChipRow`), as Hoy does. The order and the 30 + «Ver más» come from `useQuestions`. Card: text in 3 lines, thumbnail if there is a photo, zone, «hace…», «Urgente» in coral while active, «N respuestas» and «✓ Solucionada» / «Cerrada». Empty states: no results → «Nadie preguntó eso todavía» + **Preguntar esto** (opens Preguntar with the search text already written); a city with no questions → «Sé el primero en preguntar en tu ciudad» + **Preguntar**. Pull-to-refresh like Hoy (`usePullToRefresh`).
- **Question detail** (`src/components/QuestionDetail.tsx`, `question-detail.css`), one component with two homes:
  - **Phone:** `/p/:id` (`QuestionDetailPage`), full screen, outside the shell, with «Volver» (`useGoBack`) that returns to where the person was. Opening a card on a phone navigates there with the usual view transition.
  - **Desktop (≥ 64 rem):** the shell's side panel (`AppShell › detail`) shows the same component for the question selected with `?p=<id>` on `/preguntas`; with nothing selected it keeps the empty text. A shared `/p/:id` link opened on desktop is the full page.
  - **Header:** status, «Urgente», zone, «Preguntado por Ana R. · hace…», text, photo (tap → large), **Guardar** 🔒, **Compartir por WhatsApp** (same `wa.me` link as the letrero, with the text and `/p/:id`), and **⋯**: Reportar 🔒 (the reasons and «Gracias por avisar» of the letrero's report), Borrar (mine and with no answers; confirms; an urgent question's yapitas are not returned).
  - **Answers:** the ones with «Me sirvió» first, then the oldest first. Each: name, badge, stars, «hace…», text, **Guardar** 🔒, **⋯** (Reportar 🔒 · Borrar if mine and without «Me sirvió»).
  - **If the question is mine:** **Me sirvió** always visible on every answer (+5 to the helper; the first one marks the question Solucionada, +1 for closing; works on a Cerrada one without a second +1), **⋯ No me sirvió** (no yapitas), and **Cerrar sin solución** («Ninguna me sirvió», only while Abierta and with answers) with a confirmation → Cerrada, +1.
  - **«Tu respuesta» box** 🔒 (up to 1000 characters) when the question is not mine, is Abierta, and the person has not answered yet. The wall comes at **Enviar** and the text survives the Google redirect with `draftStore` + `useDraftSaver` (SPEC 07 pattern).
  - **After the first answers load or change** the detail refreshes through the hooks' invalidation; nothing polls.
- **Preguntar** (`src/components/AskQuestionSheet.tsx`, `ask-question-sheet.css`), a full-screen `Sheet` opened by the FAB of the tab (🔒, with the pending action `open-ask`):
  - **Limits first.** With 3 open questions that have answers: «Cierra una de tus preguntas para hacer otra» and those questions as cards (tap → their detail). With 10 today: «Llegaste al límite de hoy» + «Puedes volver a hacerlo mañana». The check reads `useMyQuestions` and is only a convenience: the authoritative `limit` error of `questions.create` shows the same messages (T23 makes the server enforce it).
  - **«¿Qué necesitas?»** (3 to 300, counter), **«Preguntas parecidas»** after 3 words (up to 3, tapping one opens its detail **without losing what was typed**: the sheet stays below), optional **photo** (`preparePhoto`, same errors as SPEC 06), **Urgente (−5)** switch, **Más detalles** (zone, defaulting to the profile's, and up to 3 tags).
  - **Urgente** is off, with its reason under it, when the balance is short («Te faltan N yapitas») or an urgent one is already active («Ya tienes una pregunta urgente»). The balance comes from `useWallet`.
  - **Publicar** disabled with «Falta…» under it, as the letrero's. On success the sheet closes and the new question's detail opens; if it was urgent and the charge failed, the new question's detail says «No pudimos cobrar, se publicó normal» (the detail is a page outside the shell on a phone, so a toast of the shell would be lost).
  - **«Pregúntale a tus grupos»** card at the top of the new question's detail, once, with **Compartir por WhatsApp**.
  - Close with something written asks «¿Descartar la pregunta?» (Seguir editando / Descartar), as SPEC 06.
- **`ShellLayout`**: the FAB on «¿Alguien sabe?» opens `AskQuestionSheet`; `useShell` gains `openAsk(text?)` and `selectedQuestion`; the desktop panel gets `detail`. `pendingAction.ts` gains `{ kind: 'open-ask' }`.
- **Wiki records first** (step 1): the copy the wiki leaves open (see Decisions) goes to `huecos-cerrados.md` and `log.md` before the PR.

**Out of scope (for future specs):**

- **Threads of comments, «Pedir contacto» and the reports of comments** (T22).
- **Limits enforced by the server** and the daily counters (T23); here only the mock's rules and the messages.
- **The real Supabase adapter** and the real payments (T39 and T17's routes): the screens use the hooks.
- **Notifications** (🔔 to the asker, to the neighbors of the zone, the 24 h reminder) and the question «¿Te avisamos cuando te respondan?» with the permission prompts (T24, T27, T28).
- **The Open Graph preview** of a shared link (T25). The share text is plain.
- **Mis preguntas / Guardados screens** in Yo (T21).
- **Editing** a question or an answer (the wiki has no edit).

## Data model

No new tables and no change to `DataApi`: everything already exists (`questions`, `answers`, `saved`, `reports`, `activity`, the wallet). New client-only pieces:

```ts
// src/components/pendingAction.ts
type PendingAction = /* … */ | { kind: 'open-ask' };

// src/components/useShell.ts (ShellContext gains)
openAsk: (text?: string) => void;   // Preguntar, with the text already written («Preguntar esto»)
selectedQuestion: Id | null;        // desktop panel, from `?p=<id>` on /preguntas
openQuestion: (id: Id) => void;     // phone: navigate to /p/:id · desktop: set `?p=<id>`

// draftStore key for the answer box: `answer:<questionId>` → { text }
```

## Implementation plan

1. **List.** Write the wiki records for the copy of this spec. Build `QuestionCard`, the real `PreguntasPage` (search, tag chips, 30 + «Ver más», empty states, pull-to-refresh) and `openQuestion` in `ShellLayout` (it opens `/p/:id` on a phone and sets `?p=` on desktop; the detail itself is still `UnavailablePage`). Manual test on the mock at 360 px: the list shows the seed questions in the wiki order, the search finds by text, an empty search says «Nadie preguntó eso todavía».
2. **Detail, read only.** `QuestionDetail` (header, ⋯ with Guardar / Reportar / Borrar, answers in order, large photo, WhatsApp share), `QuestionDetailPage` at `/p/:id` (loads by id, «Volver» returns to the list at the same scroll, not-found state) and the desktop panel. Manual test: open a question from the list on a phone width and on desktop; Back returns to the same place; save and report work; a deleted/unknown id shows the unavailable page.
3. **Preguntar.** `AskQuestionSheet` with limits, similar questions, photo, Urgente, Más detalles, discard confirmation, the FAB wiring, the `open-ask` pending action and «Preguntar esto». Manual test: publish a normal and an urgent question (balance drops by 5 on the mock), reach each limit, the urgent switch off with its reason, a similar question opens without losing the text.
4. **Answer.** The «Tu respuesta» box with `draftStore`, the wall at Enviar, the visibility rules (not mine, Abierta, not answered) and deleting my answer. Manual test: answer, reload mid-draft, sign in from Google mid-draft and keep the text; the box disappears after answering and on my own question.
5. **Me sirvió and close.** **Me sirvió**, **No me sirvió** and **Cerrar sin solución** with its confirmation, the order change, the status chips and the +5 / +1 in the wallet. Manual test: all the cases of `reglas-finales.md › Yapitas` for questions (first «Me sirvió» → Solucionada +1, a second one +5 only, a Cerrada one becomes Solucionada with no second +1).
6. **Pass and PR.** «Pregúntale a tus grupos», back behavior in every path, 360 px, light and dark, text at 130 %, `git grep` for forbidden words, wiki sync, PR (`Closes #13`).

## Acceptance criteria

- [x] The list shows the questions in the wiki order (urgent active → my zone → city → Solucionadas and Cerradas; guests: urgent → city), 30 per page with «Ver más», and each card shows the text in 3 lines, thumbnail, zone, «hace…», «Urgente», the answer count and the status.
- [x] Searching with no result says «Nadie preguntó eso todavía» and «Preguntar esto» opens Preguntar with the search text already written; a city with no questions says «Sé el primero en preguntar en tu ciudad».
- [x] Opening a question on a phone goes to `/p/:id` full screen and «Volver» (and Android back) returns to the list in the same place; on desktop the same detail shows in the side panel and a shared `/p/:id` opens as a full page.
- [x] The question cannot be answered by its own author, nor twice by the same person, nor when it is not Abierta (the box is not shown and the data layer would refuse it).
- [x] A guest tapping Preguntar, Guardar, Reportar, Enviar, «Me sirvió» sees the account wall and, after signing in, the original action runs; a written answer or question survives the Google redirect.
- [x] Preguntar blocks with the right message at 3 open questions with answers and at 10 today, shows «Preguntas parecidas» after 3 words, keeps the text when one is opened, and turns Urgente off with «Te faltan N yapitas» or «Ya tienes una pregunta urgente».
- [x] Publishing opens the new question's detail with «Pregúntale a tus grupos»; an urgent one costs 5 yapitas, and when the charge fails it is published as normal with «No pudimos cobrar, se publicó normal».
- [x] On my question, «Me sirvió» gives +5 to the helper, the first one marks it «✓ Solucionada» with +1, and «Ninguna me sirvió» asks for confirmation and marks it «Cerrada» with +1; on a Cerrada question «Me sirvió» makes it Solucionada without another +1.
- [x] Answers show the ones with «Me sirvió» first and then the oldest first; Borrar appears only on mine (a question without answers, an answer without «Me sirvió»).
- [x] No screen shows «XLM», «estelares», «tokens», «cripto», «blockchain», «puntos» alone or any value in bolivianos, and the texts match the wiki.
- [x] `npm run typecheck` and `npm run build` pass, CI is green, the screens were checked at 360 px, light and dark, with text at 130 %, and the PR body has `Closes #13`.

> Verified 2026-11-21 in a 360 px browser on the mock adapter (light and dark, text at 130 %, no horizontal overflow on the list, the detail and Preguntar), and on desktop for the side panel. Seen working: list and search empty state, `/p/:id` with Volver, desktop `?p=<id>` panel, Preguntar (similar questions, urgent −5 with its blocker, publish → detail with «Pregúntale a tus grupos»), the daily limit message, the account wall at Enviar and Reportar, an answer that survives the sign-in, «Me sirvió» (first one → Solucionada) and «Ninguna me sirvió». Not exercised on screen: the «Cierra una de tus preguntas» list (needs 3 open questions with answers) and Android back; both rely on the same code paths as the daily limit and the other sheets. Real phone feel is for Diego to check on the PR's preview.

## Decisions

- **Yes:** one spec with six steps, one commit per step (the user's choice). Each step leaves the app working on the mock.
- **Yes:** one `QuestionDetail` component for the phone page and the desktop panel (the user's choice). It avoids two copies of the most complex screen.
- **Yes:** the desktop selection lives in the URL (`?p=<id>`), so reload and Back keep it. **No:** component state in the shell, which loses it on reload.
- **Yes:** ⋯ has Guardar, Reportar and Borrar (the user's choice), reusing the letrero's report reasons and copy; T22 only adds threads, contact and the reports of comments.
- **Yes:** the limits are checked on the client from `useMyQuestions` to avoid opening a form that cannot be sent, and the `limit` error of `create` shows the same messages. **No:** adding a «can ask» method to `DataApi`; T23 enforces the real limit on the server and the contract does not change.
- **Yes:** «Preguntas parecidas» opens the other question above the sheet, so the draft is not lost. **No:** navigating away from the sheet.
- **Yes:** WhatsApp share as a plain `wa.me` link with the text and the `/p/:id` URL, like the letrero. The preview image waits for T25.
- **Yes:** the answer box uses `draftStore`, which SPEC 07 made for exactly this (the wall comes at Enviar).
- **No:** polling the detail. The hooks invalidate after each mutation; real-time comes with T22/T39.
- **Pending decision:** the wiki gives no copy for the confirmations and a few states. This spec proposes: «¿Descartar la pregunta?» (Seguir editando / Descartar); «¿Borrar tu pregunta?» with «Si era urgente, las 5 yapitas no se devuelven»; «¿Borrar tu respuesta?»; «¿Cerrar sin solución?» with «Si ninguna respuesta te sirvió, tu pregunta queda Cerrada y ganas 1 yapita»; the empty answers text «Todavía nadie respondió. Compártela en tus grupos»; the placeholder «Escribe tu respuesta»; the counter «N/300». Diego confirms them and step 1 records them in the wiki.

## Risks

| Risk | Mitigation |
|---|---|
| The screen is large and the detail has many states (mine / not mine, Abierta / Solucionada / Cerrada, answered or not) | One component with the state table of the wiki turned into the acceptance criteria; step 5 walks every case of the yapitas table on the mock. |
| The desktop panel and the phone page diverge | A single `QuestionDetail`; only the container changes. |
| Opening a similar question loses the draft | The similar question opens over the sheet (a nested `Sheet`/overlay), and the form state lives in the Preguntar sheet, which stays mounted. |
| The mock and the future Supabase adapter (T39) behave differently on limits or order | The screens only use the hooks and the `DataError` codes; T39 must pass the same flows. |
| Time: this is the largest screen left | Steps 1–3 are the demo minimum (list, detail, ask); steps 4–6 can be cut to «answer + Me sirvió» if the deadline presses. |
