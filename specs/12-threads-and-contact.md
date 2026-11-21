# SPEC 12 — Threads, «Pedir contacto» and live answers in ¿Alguien sabe?

> **Status:** Approved
> **Depends on:** SPEC 03 (tables `answer_comments` and `contact_requests`, RLS), SPEC 07 (`AuthGate`, pending actions, `draftStore`), SPEC 10 (`QuestionDetail`, the report and ⋯ patterns), SPEC 11 (Supabase adapter, `rpc.ts`, migration `0005`, the refresh rule #181). Board card: T22 (issue #15).
> **Date:** 2026-11-21
> **Objective:** Add the public thread under each answer («Comentar», 500 characters, report and delete), «Pedir contacto» with Aceptar / Ahora no and a box with the other person's details visible only to the two, and live updates (Supabase Realtime) of comments, answers and contact requests on the open question.

## Why this spec exists

The wiki's «2 · ¿Alguien sabe? → Detalle» and `reglas-finales › Conversación` define a conversation under every answer and a private contact exchange, and SPEC 10 left both out. The tables exist since SPEC 03, but nothing reads them, `DataApi` has no method for them, and the reports cannot target a comment. The ticket also asks that a comment shows up «al instante» on another phone, which the 15 s refresh of #181 does not give.

## Scope

**In:**

- **Thread under each answer** (`src/components/AnswerThread.tsx`, `answer-thread.css`):
  - Shows the **2 most recent comments** and, when there are more, **«Ver los N comentarios»** that unfolds the rest (oldest first once unfolded; «Ocultar comentarios» folds it again).
  - Each comment: name, «hace…», text, **⋯** (Reportar 🔒 for others' comments · Borrar for mine, with confirmation). No edit.
  - **«Comentar» 🔒** opens a box right there (up to 500 characters, counter, **Enviar**). The wall comes at Enviar and the text survives the Google redirect (`draftStore` key `comment:<answerId>`, pending action `send-comment`), as the answer box does.
  - Comments are allowed on Solucionada and Cerrada questions too (wiki).
  - In-review comments (3 reports) are hidden for everyone but their author, who sees «En revisión».
- **«Pedir contacto»** (`src/components/ContactRequest.tsx`, `contact-request.css`):
  - **Asker** (only on answers to my question, not on my own answer): a **secondary button «Pedir contacto»** next to «Me sirvió». It opens a small sheet: who it goes to, what both will see, the field **«Tu celular (opcional)»** prefilled with my saved phone, and **Pedir contacto**. Then the answer shows «Esperando que acepte».
  - **Answerer**: inside **their own answer** in the question detail, «<Nombre> te pidió tu contacto», the same optional phone field and **Aceptar** / **Ahora no**.
  - **Accepted**: a box inside that answer, visible only to the two, with the other person's **correo** (always) and **celular** (if they gave one), and **Copiar**, **Llamar** (`tel:`) and **Escribir correo** (`mailto:`).
  - **Ahora no**: the asker sees «Prefirió no compartir su contacto» and cannot ask again for that answer. No expiry.
  - The phone typed in either sheet is saved in `profiles.phone` (it prefills the next time; T29 «Ajustes» will edit it later).
- **Live question** (`src/data/hooks/live.ts`): while a question detail is on screen, one Realtime channel listens to new/removed comments, new answers, ratings and contact requests of that question and refreshes its detail at once. While the channel is not connected (or in mock mode) the 15 s refresh of #181 stays as the fallback. Lists keep the #181 rule.
- **Reports of comments**: `reports.report('comment', …)` and «Ya no quiero ver esto» for comments, with the same reasons and «Gracias por avisar» as the rest.
- **Fix (wiki rule)**: «Me sirvió» on a **Cerrada** question turns it **Solucionada** (without a second +1). SPEC 11 left it Cerrada by mistake.
- **Migration `0006_threads_and_contact.sql`** + checks in `supabase/tests/rls.sql`, applied to the remote project (needs the user's OK, as `0005`).
- **Mock adapter** implements everything new (threads, contact, a no-op live channel), so mock mode keeps working.
- **Wiki first** (step 1): the copy below and the decisions go to `huecos-cerrados.md` and `log.md`.

**Out of scope:**

- **Notifications** (🔔 for comments, contact requests and acceptances), the bell and push (T24, T27). The answerer learns about a request inside their answer only.
- **Comment rate limit** (30 per hour) and the other server limits (T23).
- **«Ajustes»** to choose or edit the shared contact detail (T29). Here: e-mail always, phone if given.
- **Realtime for the lists** (Hoy, ¿Alguien sabe?): they keep #181.
- **Saving comments** (the wiki saves letreros, questions and answers only).
- **Replies to comments** (one level only, wiki).

## Data model

```sql
-- supabase/migrations/0006_threads_and_contact.sql (shape)
-- Comments can be reported and hidden
alter table reports      drop constraint reports_kind_check,      add check (kind in ('sign','question','answer','comment'));
alter table hidden_items drop constraint hidden_items_kind_check, add check (kind in ('sign','question','answer','comment'));
-- An answer is deleted with its thread and its contact requests (wiki #82)
answer_comments.answer_id  → on delete cascade
-- A contact request belongs to one answer; one per answer and asker; never again after «Ahora no»
alter table contact_requests add column answer_id bigint not null references answers on delete cascade,
                             add column requester_phone text, add column owner_phone text,
                             add unique (answer_id, requester_id);
-- Realtime
alter publication supabase_realtime add table answer_comments, answers, ratings, contact_requests;

-- Functions (security definer where they read e-mails or write what the RLS forbids; caller checked inside)
request_contact(p_answer_id bigint, p_phone text)          → jsonb  -- only the asker, not on own answer, once
respond_contact(p_request_id bigint, p_accept boolean, p_phone text) → jsonb  -- only the answerer, only while pending
-- get_question/answer_json gain, per answer: `comments` (visible ones, oldest first) and `contact` (only for the two people)
-- rate_answer: a helpful mark on a closed question solves it
```

The phone each one types is copied into the request (`requester_phone`, `owner_phone`) and into `profiles.phone`; the e-mail is read from `auth.users` by the definer function only when the request is accepted, and only for the two people.

```ts
// src/data/types.ts
export type Comment = {
  id: Id;
  answerId: Id;
  text: string;
  author: Author;
  createdAt: string;
  isMine: boolean;
  inReview: boolean;
};

export type ContactDetails = { email: string; phone: string | null };

/** Only the asker and the answerer receive it; null for everyone else. */
export type ContactState = {
  requestId: Id;
  status: 'pending' | 'accepted' | 'declined';
  requestedByMe: boolean;
  /** The other person's details, only when accepted. */
  other: ContactDetails | null;
};

export type Answer = { /* … */ comments: Comment[]; contact: ContactState | null };
export type ReportKind = ContentKind | 'comment';

// src/data/api.ts (DataApi gains)
comments: {
  create(answerId: Id, text: string): Promise<Comment>;
  remove(id: Id): Promise<void>;
};
contact: {
  request(answerId: Id, phone?: string): Promise<ContactState>;
  respond(requestId: Id, accept: boolean, phone?: string): Promise<ContactState>;
  /** The phone saved in the profile, to prefill the field. */
  myPhone(): Promise<string | null>;
};
live: {
  /** Calls `onChange` when anything of the question changes; returns the unsubscribe. Mock: never calls it. */
  question(questionId: Id, onChange: () => void, onStatus?: (connected: boolean) => void): () => void;
};
reports: { report(kind: ReportKind, …); hideForMe(kind: ReportKind, …) };
```

## Copy (to record in the wiki, step 1)

- Thread: **Comentar** · placeholder «Escribe un comentario» · **Enviar** · «Ver los N comentarios» / «Ver 1 comentario más» · «Ocultar comentarios» · «¿Borrar tu comentario?» (Borrar / Cancelar).
- Pedir contacto (sheet): title «Pedir contacto a <Nombre>» · «Si acepta, los dos verán el dato del otro: tu correo y, si lo pones, tu celular.» · field «Tu celular (opcional)» · **Pedir contacto**.
- Asker, pending: «Esperando que acepte». Declined: «Prefirió no compartir su contacto».
- Answerer: «<Nombre> te pidió tu contacto» · «Si aceptas, los dos verán el dato del otro.» · field «Tu celular (opcional)» · **Aceptar** / **Ahora no**.
- Accepted box: «Contacto de <Nombre>» · correo · celular · **Copiar** («Copiado») · **Llamar** · **Escribir correo**.

## Implementation plan

1. **Wiki and copy.** Record the copy above and the decisions (e-mail + optional phone until T29, where the request shows, live detail, the Cerrada → Solucionada fix confirmed) in `huecos-cerrados.md` and `log.md`.
2. **Migration `0006` and its checks.** Constraints, cascade, `contact_requests` columns, publication, `request_contact`, `respond_contact`, comments and contact in `get_question`, the `rate_answer` fix, `content_author`/`item_visible` for `comment`. `rls.sql` passes locally (a stranger never reads the other's e-mail or phone; only the asker requests; only the answerer responds; no second request after «Ahora no»; a third report hides a comment; deleting an answer takes its thread). **Needs the user:** apply it to the remote project.
3. **Contract, mock and Supabase adapter.** Types, `DataApi`, the mock implementation (threads, contact, no-op live), `src/data/supabase/comments.ts`, `contact.ts`, `live.ts`, the hooks (`useCreateComment`, `useRemoveComment`, `useRequestContact`, `useRespondContact`, `useMyPhone`, `useLiveQuestion`). No screen change yet; typecheck and build pass in both modes.
4. **Thread UI.** `AnswerThread` under every answer, «Comentar» with draft and wall, delete, report and «Ya no quiero ver esto» for comments, «En revisión». Manual test on the preview.
5. **Contact UI.** The asker's button and sheet, «Esperando que acepte», the answerer's Aceptar / Ahora no with the phone field, the accepted box with Copiar / Llamar / Escribir correo, «Prefirió no compartir su contacto». Manual test with two accounts.
6. **Live detail.** `useLiveQuestion` in `QuestionDetail`: Realtime refresh, and the 15 s refresh only while the channel is down. Manual test: two phones, a comment and an answer show up in about a second.
7. **Pass and PR.** 360 px, light and dark, text at 130 %, wiki copy check, spec criteria, PR with `Closes #15`.

## Acceptance criteria

- [x] Under each answer the 2 most recent comments show, «Ver los N comentarios» unfolds the rest, and «Comentar» publishes up to 500 characters (the counter stops at 500).
- [x] A guest can read threads; «Comentar» asks for the account at Enviar and, after Google, the comment written is still there and is sent.
- [x] A comment can be written on Abierta, Solucionada and Cerrada questions, and deleted only by its author; nobody can edit it.
- [ ] A comment written on one phone shows up on another phone that has that question open in under 3 seconds, without touching anything.
- [ ] A new answer and a «Me sirvió» also show up live on the other phone; with Realtime down the detail still refreshes every 15 s.
- [x] «Pedir contacto» appears only to the asker, only on others' answers to their question; after asking, the answer says «Esperando que acepte» and the button does not show again.
- [x] The answerer sees the request inside their answer with Aceptar / Ahora no; after «Ahora no» the asker sees «Prefirió no compartir su contacto» and cannot ask again for that answer.
- [x] After «Aceptar», both see the other's e-mail and, if given, phone, with Copiar, Llamar and Escribir correo; a third account never sees them (checked in `rls.sql` and on screen).
- [x] The phone typed in the sheet is saved in the profile and prefills the field next time.
- [x] A comment can be reported with the 6 reasons, disappears for the reporter at once, and the third report from different people hides it for everyone but its author («En revisión»).
- [x] Deleting an answer without «Me sirvió» deletes its thread and its contact request.
- [x] «Me sirvió» on a Cerrada question turns it Solucionada without a second +1.
- [ ] Mock mode works for everything above except the live channel (it falls back to the 15 s refresh).
- [ ] `npm run typecheck`, `npm run build` and `rls.sql` pass; screens checked at 360 px, light and dark, text at 130 %; texts match the wiki.

> Verified 2026-11-21. `rls.sql` (local) covers the contact rules (only the asker asks, only the answerer answers, «Ahora no» is final, a third person and a guest never see the details, the phone is validated and saved in the profile), the thread (comments on a solved question, 3 reports hide a comment, «En revisión» for its author), the cascade when an answer is deleted and «Me sirvió» on a Cerrada question → Solucionada. In a 360 px browser against the real project (`0006` applied): three comments fold into «Ver 1 comentario más» / «Ocultar comentarios», delete with «¿Borrar tu comentario?», report with «Reportar el comentario» and it disappears for the reporter; «Pedir contacto» → bad phone refused → «Esperando que acepte» → the answerer accepts in their answer → both boxes show the right e-mail and phone with Copiar / Llamar / Escribir correo; with the channel connected the detail stops polling and a comment from another account shows up about 1.4 s after it is saved. Light and dark, text at 130 %, no horizontal overflow. Pending: the two-phone checks on the preview.

## Changes after the phone test

- **«Pedir contacto» opens full screen on a phone** (not as a bottom sheet): with the keyboard or the browser's autofill open, iOS scrolled the page behind the bottom sheet and the taps landed there, so the button did not respond.
- **A comment sent after Google empties its box**, and **«Volver» never returns to Google**: the page reached after signing in is marked as the first of the visit, so «Volver» goes to ¿Alguien sabe? (a question) or Hoy.
- **Tapping the current tab again refreshes it** (Hoy, ¿Alguien sabe? or Yo), besides going back to the top: the way to see what others published on a computer, where there is no pull-to-refresh (wiki #181).

## Decisions

- **Yes:** the shared detail is the account **e-mail**, plus an **optional phone** typed when asking or accepting and saved in the profile (the user's choice). **No:** a mandatory phone, or e-mail only. T29 will let people edit it.
- **Yes:** one Realtime channel per open question for comments, answers, ratings and contact requests (the user's choice). It replaces the 15 s refresh while connected. **No:** comments only; **No:** polling only (does not meet «al instante»).
- **Yes:** the 2 most recent comments + «Ver los N comentarios» (the user's choice). **No:** all always open (long pages on a phone); **No:** collapsed by default (hides the conversation in the demo).
- **Yes:** the answerer sees the request inside their answer (the user's choice); the bell is T24. **No:** a «Pedidos de contacto» card in Yo (T21's screen).
- **Yes:** «Pedir contacto» as a visible secondary button next to «Me sirvió» (the user's choice). **No:** inside ⋯ (hard to find).
- **Yes:** the optional phone field both when asking and when accepting (the user's choice).
- **Yes:** fix «Me sirvió» on a Cerrada question → Solucionada in this spec (the user's choice), as the wiki says.
- **Yes (proposed):** the contact details live in the request row (`requester_phone`, `owner_phone`) and the e-mail is read only by `security definer` functions for the two people; `profiles.phone` stays hidden from others (SPEC 03). **No:** opening `profiles.phone` with a policy.
- **Yes (proposed):** `contact_requests.answer_id` with a unique (`answer_id`, `requester_id`): «Ahora no» is final for that answer by construction. The table had no answer link.
- **Yes (proposed):** realtime events only trigger a refetch of `get_question`; the payloads are not trusted or merged. Simpler, and RLS still decides what each one sees.

## Risks

| Risk | Mitigation |
|---|---|
| Realtime does not connect on some phone or network | The 15 s refresh of #181 runs whenever the channel is not `SUBSCRIBED`; the criteria test it. |
| An e-mail or phone leaks to a third person | Only definer functions read them, only for the two parties and only when accepted; `rls.sql` checks a third account and the anon role. |
| The question detail gets crowded on a phone | 2 comments per answer by default, the contact controls are small secondary elements; checked at 360 px with text at 130 %. |
| The migration changes constraints on tables with data | Only widens checks, adds nullable/derived columns and a cascade; `contact_requests` has no rows yet. Dry run before applying. |
| Time: T23, T09 and T21 still wait | Steps 2–4 (thread) are the demo minimum; contact (5) and live (6) can be cut in that order if time runs out. |
