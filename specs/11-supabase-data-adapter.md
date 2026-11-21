# SPEC 11 — Supabase data adapter: signs, questions, answers, saved, reports, activity and movements

> **Status:** Approved
> **Depends on:** SPEC 01 (the `DataApi` contract and the mock adapter, the behavioral oracle), SPEC 03 (tables, RLS, `author_trust`, notifications trigger), SPEC 07 (auth adapter and its lazy loading), SPEC 08 (wallet and `wallet_keys`), SPEC 09 (`/api/stellar/premiar` and `/gastar`), SPEC 10 (the screens that consume the hooks). Board card: T39 (issue #43). Unlocks T09 (seed), T21 (Yo / Movimientos), T22, T23, T24.
> **Date:** 2026-11-21
> **Objective:** With `VITE_DATA_SOURCE=supabase`, make every `DataApi` method except `auth` and `wallet.get` (already real) run on Supabase (tables, RLS, SQL functions and Storage), request the yapitas from the T17 routes after each action is saved, and leave the screens and the mock adapter untouched.

## Why this spec exists

Today, with `supabase`, only accounts, profile and balance are real (SPEC 07, SPEC 08). Everything else runs on the mock, in memory: a published letrero or question is lost on reload, nobody else sees it, and the WhatsApp link of a question does not open for another person. This is the step that turns the demo into a shared app. The contract does not change (`src/data/api.ts`), so the pages, hooks and the mock mode stay as they are. The mock remains the oracle: when this spec says «same as the mock», the mock's `rules.ts` and `adapter.ts` are the reference for order, copy of errors and edge cases.

The tables and the RLS already exist (SPEC 03). What does not exist: a Storage bucket, the reads that need per-caller fields (my vote, saved by me, in review, answer count), the writes that the RLS forbids to clients on purpose (`questions.status`, `questions.urgent_until`) and the hiding at 3 reports. They are solved here with one new migration of SQL functions and the adapter code.

## Scope

**In:**

- **Migration `0005_data_adapter.sql`** (new file; `0001`–`0004` are on the remote project and are not edited):
  - **Storage:** bucket `photos`, public read. Insert only for an authenticated user into a path that starts with their profile id (`<profile_id>/<uuid>.jpg`); delete only their own path. Photos and thumbnails live there.
  - **Read functions** (`security invoker`, so RLS still applies; they return JSON shaped like the `Sign`, `Question` and `Answer` types of `src/data/types.ts`): `list_signs`, `get_sign`, `list_questions`, `get_question` (with its answers), `similar_questions`, `my_signs`, `my_questions`, `my_answers`, `saved_items`. Every one of them already applies, for the caller: the items they hid (`hidden_items`), the items with 3 or more reports from different people (hidden for everyone but their author, who gets `inReview: true`), `myVote`, `savedByMe`, `isMine`, counts, and the author's `stars` and `badge` from `author_trust`.
  - **Order** (same as the mock and the wiki): signs newest first, tie broken by helpful − not helpful; questions urgent-active → caller's zone → rest of the city newest first → Solucionadas and Cerradas at the end (guests: urgent → city → closed). Search is case- and accent-insensitive (`unaccent`) over the text/title, zone and tags. Pagination is a 30-item page with an opaque offset cursor.
  - **Write functions** (`security definer`, `search_path` fixed, each one checks the caller with `current_profile_id()` and raises the same exceptions the adapter maps to `DataError`): `rate_answer(answer_id, helpful)` (inserts the rating, and on the first «Me sirvió» sets the question to `solved`; works on a `closed` one without changing its status), `close_question(question_id)` (only the author, only `open` with at least one answer → `closed`), `report_content(kind, id, reason)`, `hide_content(kind, id)`.
  - **Tests** in `supabase/tests/rls.sql` for every function and for the bucket policies.
- **Adapter** (`src/data/supabase/`): `signs.ts`, `questions.ts`, `answers.ts`, `saved.ts`, `reports.ts`, `activity.ts`, `movements.ts`, `mappers.ts` (row → type), `errors.ts` (Postgres/PostgREST/Storage error → `DataError`: `forbidden`, `not_found`, `limit`, `unauthenticated`, `offline`…), `photos.ts` (upload with the thumbnail, remove on delete), `rewards.ts` (calls `/api/stellar/premiar` and `/gastar` with the session token).
- **Rewards after saving.** After a successful insert/RPC the adapter asks the route for the reward and **does not wait for it to give the result**: `signs.create` (`letrero`), `signs.vote` helpful (`sirvio-l`), `answers.markHelpful` (`ayuda`, and `cierre` when it solves the question), `questions.closeWithoutSolution` (`cierre`). A failure or a `pending` answer never fails the action: the reward stays `pending` in `rewards` (SPEC 09) and Movimientos offers «Reintentar». The `rewarded` flag of `signs.create` stays `true` unless the sign was past 10 per day, which is T23 (here always `true`).
- **Urgent.** `questions.create` inserts the question as normal, then calls `/api/stellar/gastar`; the route charges the −5 and, only after the charge is confirmed, **sets `urgent_until = now + 24 h`** (service role). If the charge fails, the question stays normal and the adapter returns `urgentCharged: false` (the screen already shows «No pudimos cobrar, se publicó normal»). This changes `planCharge` and its `RewardFacts` (SPEC 09): `urgent` stops meaning «already marked urgent» and the check becomes «mine, open, not urgent yet».
- **Movements** (`wallet.movements`, `wallet.retry`): the list comes from the caller's `rewards` rows (RLS: own rows only), newest first, with `status`, `amount`, `reason` and the explorer link built from `tx_hash`. `retry` calls the route with `reason` and `refId` parsed from `memo_key` (`letrero:<id>`, `sirvio-l:<signId>-<voterId>`, `ayuda:<id>`, `cierre:<id>`). `bienvenida` has no retry button (T16 already retries it in the background) and `urgente` rows in `error` are not shown (nothing was charged). The balance keeps coming from the chain (`wallet.get`, already real).
- **`src/data/source.ts`:** with `supabase` the adapter is fully real except what has no `DataApi` method yet. `followRealSession` and `followRealBalance` (the bridges that kept the mock in sync) are removed from the supabase path; they stay for the mock only if the mock mode still needs them.
- **Docs:** `src/data/README.md` and `supabase/README.md` get the new files and the order «apply migration → deploy»; the wiki gets the technical decisions (`tecnico.md`) and the log, in the same pass.

**Out of scope (for future specs):**

- **Seed data** of 5 neighbors, signs and questions (T09). Until then a new city list is empty and shows the empty states.
- **Server-side limits and daily counters** (T23): 10 rewarded signs/day, 3 rewarded answers per question, 3 per pair per day, 10 questions/day, 3 open with answers. The SQL functions here do **not** enforce them; the mock's rules keep showing the messages on the client side only in mock mode.
- **Comment threads, «Pedir contacto», the reports of comments** (T22) and their tables' adapter.
- **Notifications screen, push and the 24 h reminder** (T24, T27, T28). The SPEC 03 trigger already inserts the rows.
- **Realtime** and polling: the hooks keep invalidating after each mutation.
- **The Yo / Tilcho / Movimientos screens** (T21): only the data method behind them.
- **Editing** content (the wiki has none) and **moderation tooling** (the team reviews in the Supabase panel).

## Data model

No new tables. One new Storage bucket and SQL functions. The `DataApi` and the `src/data/types.ts` types do not change.

```sql
-- supabase/migrations/0005_data_adapter.sql (shape; the exact bodies are written in step 2)
-- Storage
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict do nothing;
-- policies on storage.objects: insert/delete when (storage.foldername(name))[1] = current_profile_id()::text

-- Reads (security invoker; return jsonb arrays shaped like the TS types)
list_signs(p_city text, p_search text, p_tags text[], p_offset int)         → jsonb
get_sign(p_id bigint)                                                        → jsonb
list_questions(p_city text, p_search text, p_tags text[], p_offset int)     → jsonb
get_question(p_id bigint)                                                    → jsonb   -- {question, answers}
similar_questions(p_text text)                                               → jsonb   -- up to 3
my_signs() / my_questions() / my_answers() / saved_items()                   → jsonb

-- Writes the client cannot do through the tables (security definer, caller checked inside)
rate_answer(p_answer_id bigint, p_helpful boolean)   → jsonb   -- inserts the rating, solves the question on the first helpful
close_question(p_question_id bigint)                 → jsonb
report_content(p_kind text, p_id bigint, p_reason text) → void -- also hides it for the reporter
hide_content(p_kind text, p_id bigint)               → void
```

```ts
// src/data/supabase/errors.ts — Postgres/PostgREST code or message → DataError code
// 42501 / RLS violation → 'forbidden'   ·   no row → 'not_found'   ·   23505 duplicate → 'forbidden' (own vote, second answer, second report)
// P0001 with the function's tag (e.g. 'closed_question') → 'forbidden'   ·   no network → 'offline'   ·   no session → 'unauthenticated'

// src/data/supabase/rewards.ts
export function requestReward(reason: PremiarReason, refId: number): void;                 // fire and forget; never throws
export function requestCharge(refId: number): Promise<'confirmed' | 'not_charged'>;       // awaited by questions.create
```

## Implementation plan

Each step leaves the app working: steps 3 to 8 replace one method group at a time inside `source.ts` (the rest still runs on the mock), so the preview can be tested after each one.

1. **Wiki and plan.** Record in `tecnico.md`, `huecos-cerrados.md` and `log.md` (repo `boliviasabe-docs`) the technical decisions of this spec: the SQL functions, the public `photos` bucket, `urgent_until` set by the server after the charge, and Movimientos listed from `rewards`. Commit only when asked.
2. **Migration `0005` and its tests.** Write the bucket, policies and every function; extend `supabase/tests/rls.sql` (own-sign vote refused, 3 reports hide for everyone but the author, `rate_answer` solves on the first helpful and does not change a closed one, `close_question` refused when not mine / no answers / not open, bucket path of another profile refused). `npx supabase db reset` + the script pass locally. **Needs the user:** apply it to the remote project (`npx supabase db push --remote`, SPEC 03's README) before the preview can use it.
3. **Plumbing and letreros read.** `mappers.ts`, `errors.ts`, the lazy loader in `source.ts` and `signs.list/get`. Hoy shows the (empty) real list in the preview; a letrero inserted by hand in the Supabase panel shows up with the right fields.
4. **Publish, vote and delete a letrero.** `photos.ts` (photo + 480 px thumbnail), `signs.create/vote/remove`, `rewards.ts` and the `letrero` and `sirvio-l` requests. Manual test: publish from a phone, reload, open from another browser; the +1 is in the balance.
5. **Saved, reports and «Ya no quiero ver esto».** `saved.*`, `reports.report/hideForMe`, `inReview` for the author. Manual test: three accounts report one letrero → it disappears for the others and the author sees «En revisión».
6. **Questions.** `questions.list/get/similar/create/remove/closeWithoutSolution`, the change to `gastar` (server sets `urgent_until` after the charge) and `requestCharge`, with its e2e scenario in `scripts/stellar/e2e.ts`. Manual test: ask normal and urgent; the urgent one rises to the top only after the −5 is confirmed.
7. **Answers and ratings.** `answers.create/markHelpful/markNotHelpful/remove` through the table and `rate_answer`; the `ayuda` and `cierre` requests. Manual test: the whole «Me sirvió» / «Ninguna me sirvió» flow of SPEC 10 with two accounts, and the +5 / +1 in the helper's wallet.
8. **Activity and movements.** `activity.*` and `wallet.movements/retry`. Manual test: a stopped Stellar (wrong env in a preview) leaves the reward `pending` and «Reintentar» pays it later, once.
9. **Cut-over and cleanup.** `source.ts` uses the real adapter for everything; remove the bridges (`followRealSession`, `followRealBalance`) from the supabase path; update both READMEs; one end-to-end test on the preview with throwaway users (create, delete in the order of the memory note) covering the criteria below; `git grep` for secrets and for `@stellar/stellar-sdk` under `src/`.

## Acceptance criteria

- [ ] With `VITE_DATA_SOURCE=supabase`, a letrero and a question published by one account are still there after reloading and show up for another account on another device.
- [ ] A signed-in user cannot vote their own letrero, answer their own question, answer twice, or mark «Me sirvió» on a question that is not theirs; the **database** refuses it (checked in `rls.sql`, not only on screen).
- [ ] Publishing a letrero uploads the photo and the 480 px thumbnail to `photos/<profile_id>/…`, the card in Hoy uses the thumbnail, and another user cannot write or delete in that folder.
- [ ] The third report from three different people hides the item for everyone except its author, who sees it «En revisión»; the reporter stops seeing it at the first report, and «Ya no quiero ver esto» hides it only for that person.
- [ ] The lists follow the wiki order and search accent- and case-insensitively; 30 per page with «Ver más» returns the next 30 without repeating items.
- [ ] «Me sirvió» on the first answer marks the question «✓ Solucionada»; on a Cerrada question it does not change the status; «Cerrar sin solución» works only on an Abierta question with answers and only for its author.
- [ ] An urgent question is published as normal first and becomes urgent (top of the list for 24 h) only after the −5 is confirmed; when the charge fails it stays normal and the screen shows «No pudimos cobrar, se publicó normal»; the −5 is never charged twice.
- [ ] A client cannot set `questions.status` or `questions.urgent_until` directly (the RLS still refuses it).
- [ ] When Stellar fails, the letrero, the vote or the answer is saved anyway, the movement is «Pendiente» and «Reintentar» completes it once.
- [ ] `wallet.movements` lists the caller's rewards newest first with the right amount, reason and explorer link, and shows only the caller's own.
- [ ] Mis letreros, mis preguntas, mis respuestas and Guardados load from Supabase for the caller only.
- [ ] Each `DataError` code the screens handle (`forbidden`, `not_found`, `limit`, `unauthenticated`, `offline`) comes out of the adapter for its case; the screens did not change.
- [ ] With `VITE_DATA_SOURCE=mock` the app behaves exactly as before and `npm run typecheck`, `npm run build`, `npm run stellar:e2e` and `rls.sql` pass.
- [ ] No secret reaches the browser bundle, `@stellar/stellar-sdk` is not imported from `src/`, and `git grep -i "SECRET\|SERVICE_ROLE"` shows no values.
- [ ] The screens were checked on a phone at 360 px, light and dark, with the text at 130 %, against the preview.

## Decisions

- **Yes:** one spec with three blocks (letreros, preguntas/respuestas, actividad/movimientos) and nine steps, one commit per step (the user's choice). **No:** splitting letreros and preguntas into two specs; it would duplicate the migration, the review and the phone tests.
- **Yes:** SQL functions (RPC) for the writes the RLS forbids and for the reads with per-caller fields (the user's choice). They run in one transaction, validate the caller inside and keep the rules next to the data. **No:** one `/api` route per action (more latency and surface) and **No:** triggers alone (they cannot express «Cerrar sin solución»).
- **Yes:** read functions are `security invoker`, so RLS still decides what a caller can see; only the write functions that must bypass the RLS are `security definer`.
- **Yes:** public `photos` bucket with a path per profile (the user's choice). Photos are already public because a letrero opens without an account. **No:** private bucket with signed URLs (short-lived links break shared and cached pages).
- **Yes:** the adapter asks for the reward after saving and does not wait for it (the user's choice), as the wiki rule «a Stellar failure never blocks» requires; the exception is the urgent charge, which is awaited because the screen must know if it worked. **No:** a database webhook; it needs a secret and the route needs the user's session.
- **Yes (proposed, not asked):** `urgent_until` is set by `/api/stellar/gastar` only after the charge is confirmed. Setting it first (by an RPC) would let a client mark a question urgent and never pay.
- **Yes (proposed, not asked):** Movimientos is listed from the `rewards` table, not by reading the chain. Every payment already goes through a `rewards` row, which carries the `tx_hash` for the explorer link and gives the numeric `Movement.id` the contract needs; the balance is still read from the chain. The issue text said «leídos de la cadena»: this is the one place where this spec departs from it, to keep the list fast and the ids stable. A payment made outside the app would not appear.
- **Yes (proposed, not asked):** pagination by offset (`p_offset`, opaque cursor of 30). The question order is computed, so a keyset cursor is not simple; with seed-size data it is enough. A new item published while paging can repeat or skip one.
- **Yes (proposed, not asked):** the SQL functions do not enforce the daily limits and the 3-rewarded-per-question cap: they are T23, together with the server routes.
- **No:** editing migrations `0001`–`0004` (they are applied on the remote project); everything new goes in `0005`.

## Risks

| Risk | Mitigation |
|---|---|
| The migration is not applied on the remote project before the preview is tested, so every call fails | Step 2 ends with an explicit «apply to remote» ask to the user; the adapter maps a missing function to `offline`, and the cut-over step (9) verifies the functions exist. |
| A `security definer` function has a gap and bypasses the RLS | Each one checks `current_profile_id()` first, fixes `search_path`, and has an allowed and a denied case in `rls.sql`. |
| The read functions and the mock disagree on order or on which items are hidden | The mock is the oracle: the same flows of SPEC 10 are walked on the preview, and step 5 and 6 test hiding and order with several accounts. |
| Changing `planCharge` breaks the SPEC 09 e2e | The e2e scenarios are updated in step 6 and must pass before the commit. |
| Photo upload succeeds and the insert fails (or the reverse), leaving orphans or a letrero with no photo | Upload first, insert second; on insert failure remove the uploaded files; an orphan file is harmless and invisible. |
| Time: this is the largest spec left and T22, T23, T09 and T21 wait for it | Steps 3–4 (letreros) and 6–7 (questions) are the demo minimum; step 8 (activity, movements) can come after T09 if the deadline presses. |
| Offset pagination repeats or skips an item while new ones arrive | Accepted for the demo; recorded as a decision. |
