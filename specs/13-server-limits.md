# SPEC 13 — Server-side limits and anti-abuse

> **Status:** Implemented
> **Depends on:** SPEC 03 (tables, RLS, `rewards`), SPEC 09 (`planReward`, `planCharge`, `/api/stellar/premiar` and `/gastar`), SPEC 10 (Preguntar sheet, `limitMessage`, `askLimit`), SPEC 11 (Supabase adapter, `rpc.ts` `toDataError`), SPEC 12 (comments, migration `0006`). Board card: T23 (issue #16).
> **Date:** 2026-11-21
> **Objective:** Make the database and the Stellar routes enforce every limit of `reglas-finales › Límites` and the reward anti-abuse rules, so no call from a browser can skip them, and the screen says which limit was hit and until when.

## Why this spec exists

The mock adapter enforces the limits since SPEC 01, but with `VITE_DATA_SOURCE=supabase` nothing does:

- The browser inserts questions and comments directly, with no cap.
- `/api/stellar/premiar` pays every letrero, «Me sirvió» and close.
- `signs.create` always answers `rewarded: true`.
- `/gastar` charges an urgent question even when another urgent one is active.
- The only checks are in the Preguntar sheet (`askLimit`, `urgentBlocker`), and they are a convenience: anyone can skip them by calling the API by hand.

## Scope

**In:**

- **Publishing limits.** Each is a `BEFORE INSERT` trigger in SQL and runs only when a user is signed in (`auth.uid()` is not null). The service role (seed T09, scripts) is not limited.
  - **10 questions per day** per person, counting the calendar day in Bolivia (`America/La_Paz`).
  - **3 open questions with answers.** The fourth needs one of them closed first; questions without answers do not count.
  - **30 comments per hour** per person, as a sliding window over the last 60 minutes.
  - When a limit is hit, the trigger raises SQLSTATE `BSLIM` with message `limit:<reason>` and hint `<until ISO>`. `until` is the next Bolivian midnight for daily limits and the oldest comment in the window + 1 h for comments. There is no `until` for open questions.
- **«Ya tienes una pregunta urgente» (1 active urgent per person).**
  - The Supabase adapter checks before inserting when `urgent` is true, and rejects with `DataError('limit', { limit: 'urgent_active', until })`, as the mock does. Nothing is published, and the sheet shows the message.
  - As a backstop, `planCharge` refuses when the caller has another question with `urgent_until > now()`. In that case the question stays normal, which is the existing «No pudimos cobrar, se publicó normal» path.
- **Reward caps.** The action is still saved, but no yapitas are paid, and the screen says why.
  - **10 rewarded letreros per day:** `letrero` rewards created today (Bolivia) for the author.
  - **3 rewarded «Me sirvió» per question:** an `ayuda` reward is capped when its rating is not among the first 3 helpful ratings of that question, counted by rating id. The count uses ratings, not rewards, so it does not depend on when `/premiar` runs.
  - **3 rewards per day between the same two people:** `sirvio-l` and `ayuda` rewards created today with the same `source_id` (who gave it) and `profile_id` (who receives it).
  - The memo being checked is never counted against itself. If a reward row with that memo already exists, the reward is not capped, so retries and «Reintentar» still pay.
- **One rule in SQL for every cap.** `reward_cap(...)` returns `null` or the cap hit:
  - `/premiar` asks it before paying (through `RewardFacts`). A capped reward is not paid, no `rewards` row is created, and the route answers `{ status: 'capped', cap }`.
  - The adapter asks `my_reward_cap(reason, refId)` right after saving a letrero, a vote or a «Me sirvió», so the notice is exact and immediate.
- **`rewards.source_id`.** New nullable column. `ensureReward` fills it for `sirvio-l` (the voter) and `ayuda` (the asker). Old rows stay null.
- **Contract (`src/data/`).**
  - `LimitReason` gains `'comments_per_hour'`.
  - New `RewardCap = 'signs_per_day' | 'answers_per_question' | 'pair_per_day'`.
  - `signs.vote` returns `{ sign, rewardCap }`.
  - `answers.markHelpful` returns `{ answer, rewardCap }`, with `rewardCap` null when the reward is paid.
  - `signs.create` keeps `{ sign, rewarded }`, now real.
  - `toDataError` maps `BSLIM` to `DataError('limit', { limit, until })`.
- **Mock adapter** mirrors all of the above: comments per hour, `rewardCap` for votes and «Me sirvió», and the pair cap it already has.
- **Screens.**
  - **Comment box:** «Llegaste al límite de comentarios. Puedes volver a comentar en N min». The draft is kept.
  - **«Me sirvió» on an answer:**
    - Pair cap: «Ya le diste 3 premios hoy a <Nombre>: este queda marcado, sin yapitas.»
    - Per-question cap: the existing «Ya diste 3 «Me sirvió» con premio en esta pregunta: este queda marcado, sin yapitas.», now driven by `rewardCap` instead of the client-side guess.
  - **«Me sirvió» on a letrero:** the same pair message replaces «<Nombre> recibe +1 yapita por ayudarte.» when capped.
  - **Letrero past 10:** «Publicado. Ya subiste 10 letreros hoy, este va sin premio» (copy already exists, now real).
  - **Questions:** the existing `limitMessage` copy for `questions_per_day`, `open_questions` and `urgent_active`, now also reached from the server error.
- **Migration `0007_limits.sql`** and its checks in `supabase/tests/rls.sql`, applied to the remote project with the user's OK.
- **Wiki first** (step 1): the decisions and the copy go to `huecos-cerrados.md` and `log.md`.

**Out of scope:**

- **«Avisos de urgentes: 3 por hora por vecino».** There are no notifications or push yet (T24, T27); the cap goes with them.
- **«Te faltan yapitas»** for urgent questions. It is already handled: the sheet blocks it, and `chargeUrgent` returns `balance`.
- **Limits on answers, votes, reports or saves.** The wiki sets none beyond the existing uniqueness rules.
- **Showing the caps before acting**, such as «Quedan N con premio» (`ideas-pendientes.md`).
- **Strict serialization of simultaneous rewards.** See Risks.

## Data model

Migration `supabase/migrations/0007_limits.sql`:

```sql
alter table public.rewards add column source_id bigint references public.profiles (id);
create index rewards_pair_day_idx on public.rewards (profile_id, source_id, created_at);
create index rewards_reason_day_idx on public.rewards (profile_id, reason, created_at);

-- Start of today in Bolivia, as timestamptz.
create function public.bolivia_day_start() returns timestamptz ...
-- Next Bolivian midnight.
create function public.bolivia_next_midnight() returns timestamptz ...

-- Raises SQLSTATE BSLIM, message 'limit:<reason>', hint = until (ISO, may be empty).
create function public.raise_limit(p_reason text, p_until timestamptz) returns void ...

-- BEFORE INSERT on questions: 10 per day, 3 open with answers (skipped when auth.uid() is null).
create function public.check_question_limits() returns trigger ...
-- BEFORE INSERT on answer_comments: 30 in the last hour (skipped when auth.uid() is null).
create function public.check_comment_limits() returns trigger ...

-- null, 'signs_per_day', 'answers_per_question' or 'pair_per_day'.
-- Never counts p_memo itself; null when a row with p_memo already exists.
create function public.reward_cap(p_reason text, p_recipient bigint, p_source bigint,
                                  p_memo text, p_ref bigint) returns text  -- security definer
-- The caller's view: derives recipient, source and memo like planReward does.
create function public.my_reward_cap(p_reason text, p_ref bigint) returns text  -- definer, authenticated only
```

- `reward_cap` is executable by `service_role` only.
- `my_reward_cap` is executable by `authenticated` only. It returns null when the caller cannot claim that reward.

TypeScript:

```ts
// src/data/errors.ts
export type LimitReason = 'questions_per_day' | 'open_questions' | 'urgent_active' | 'insufficient_balance' | 'comments_per_hour';

// src/data/types.ts
export type RewardCap = 'signs_per_day' | 'answers_per_question' | 'pair_per_day';

// src/data/api.ts
signs.vote(id, value): Promise<{ sign: Sign; rewardCap: RewardCap | null }>;
answers.markHelpful(id): Promise<{ answer: Answer; rewardCap: RewardCap | null }>;

// lib/stellar/rewards.ts
interface RewardFacts {
  // ...existing methods
  /** null when the reward may be paid. */
  rewardCap(plan: RewardPlan, sourceId: number | null, refId: number): Promise<RewardCap | null>;
  /** Another of the caller's questions with urgent_until in the future. */
  otherActiveUrgent(authorId: number, exceptQuestionId: number): Promise<boolean>;
}
type RewardPlan = { ...; sourceId: number | null };  // stored in rewards.source_id
```

## Implementation plan

Branch `feat/t23-limits`, one commit per step.

1. **Wiki.** Record in `huecos-cerrados.md` (#186 onward) and `log.md`:
   - The limits are enforced by the database, only for signed-in users.
   - The 30 comments are a sliding hour, and the message gives minutes.
   - «3 premiados por pregunta» means the first 3 helpful ratings.
   - The pair cap covers `sirvio-l` and `ayuda`, and its notice names the person.
   - An active urgent question blocks publishing another urgent one.
   - The copy above.
2. **Migration `0007` and its checks.**
   - Add the column, the helpers, both triggers, `reward_cap`, `my_reward_cap` and the grants.
   - `rls.sql` must pass locally:
     - The 11th question today fails with `BSLIM`.
     - The 4th open question with answers fails.
     - The 31st comment in an hour fails, with an `until` about 1 h after the oldest one.
     - The service role inserts past the limits.
     - The 11th letrero today is capped.
     - The 4th helpful rating on a question is capped, and so is the 4th reward of a pair today.
     - A memo that already exists is never capped.
   - **Needs the user:** apply it to the remote project.
3. **Server.**
   - `RewardPlan.sourceId` and `ensureReward` stores `source_id`.
   - `planReward` returns a capped result. `/premiar` answers `{ status: 'capped', cap }` without creating a row.
   - `planCharge` refuses with another active urgent question.
   - `supabaseRewardFacts` uses `reward_cap`, and the in-memory facts of `scripts/stellar/e2e.ts` implement the same counts.
   - `npm run stellar:e2e` passes, including a capped case.
4. **Contract and adapters.**
   - `LimitReason`, `RewardCap`, and the new return shapes of `vote` and `markHelpful`.
   - `toDataError` maps `BSLIM`.
   - Supabase: the `signs.create` / `vote` and `answers.markHelpful` adapters call `my_reward_cap` after saving, and `questions.create` checks urgent before inserting.
   - Mock: comments per hour and `rewardCap`.
   - Hooks and callers are updated with no visible change yet.
   - Typecheck and build pass in both modes.
5. **Screens.**
   - The comment-limit message, and the draft is kept.
   - The «Me sirvió» notices from `rewardCap` in `QuestionDetail` and `SignSheet`; remove the `REWARDED_PER_QUESTION` guess.
   - The Preguntar sheet shows server limit errors with `limitMessage`.
   - Manual test on the preview.
6. **Pass and PR.**
   - 360 px, light and dark, text at 130 %.
   - The copy matches the wiki.
   - `git grep -i "SECRET\|SERVICE_ROLE"` shows no values.
   - The spec criteria are met.
   - PR with `Closes #16`.

## Acceptance criteria

- [x] An 11th question on the same Bolivian day is refused by the database, even with a direct `insert` from the browser console. The sheet says «Llegaste al límite de hoy. Puedes volver a hacerlo mañana».
- [x] With 3 open questions that have answers, a 4th is refused by the database. The sheet says «Cierra una de tus preguntas para hacer otra».
- [x] A 31st comment within an hour is refused by the database. The box says «Llegaste al límite de comentarios. Puedes volver a comentar en N min» and keeps the text.
- [x] With an active urgent question, publishing another urgent one is refused before anything is published («Ya tienes una pregunta urgente»). A direct call to `/gastar` for a second question does not charge.
- [x] The 11th letrero of the day is published, `/premiar` does not pay it (`{ status: 'capped' }`, no `rewards` row), and the screen says «Publicado. Ya subiste 10 letreros hoy, este va sin premio».
- [x] The 4th «Me sirvió» on one question is saved and not paid, and the notice says so.
- [x] A 4th reward in one day from the same person to the same person (letrero vote or «Me sirvió») is saved and not paid, and the notice says «Ya le diste 3 premios hoy a <Nombre>: este queda marcado, sin yapitas.»
- [x] New `sirvio-l` and `ayuda` rows carry `source_id`. A retry of an existing pending reward is never capped.
- [x] Seeding with the service role is not limited.
- [x] Mock mode shows the same messages for the same cases.
- [x] `npm run typecheck`, `npm run build`, `rls.sql` and `npm run stellar:e2e` pass. The screens are checked at 360 px, light and dark, text at 130 %. The texts match the wiki.

> Verified on 2026-11-21.
> - **Automated:**
>   - `rls.sql` (local) has 19 new checks: the 11th question of the day, the 4th open question with answers, the 31st comment with its `until`, no limit for the service role, the 11th letrero, the 4th «Me sirvió» of a question, the 4th reward of a pair, an existing memo never capped, and the `my_reward_cap` / `reward_cap` grants.
>   - `npm run stellar:e2e` passes on testnet, with the capped cases and the second urgent question not charged.
>   - `BSLIM` reaches supabase-js with `code`, `message` and `hint` (checked against the local stack).
>   - typecheck and build pass; `git grep` shows no secret values.
> - **Diego, on a phone, on the preview (`0007` applied to the remote project):**
>   - The comment limit: «Puedes volver a comentar en 6 min» was exact, because the window held one older comment.
>   - Three «Me sirvió» paid and the 4th said «Ya diste 3 «Me sirvió» con premio…».
>   - The 10th question published and Preguntar then showed «Llegaste al límite de hoy».
>   - With an urgent question active, a second one is blocked with «Ya tienes una pregunta urgente».
>   - The notices fit at 360 px.
> - **Not tested by hand:** the pair cap needs 4 rewards between the same two people in one day. It is covered by `rls.sql` and the e2e.

## Decisions

- **Yes:** the publishing limits live in SQL triggers (the user's choice).
  - **No:** create RPCs (more code, and inserts would have to be revoked).
  - **No:** a Vercel route (slower, and it duplicates RLS).
- **Yes:** `rewards.source_id` to count the pair (the user's choice).
  - **No:** parsing the memo (fragile, and `ayuda:<answer>` needs a join to know the asker).
- **Yes:** one SQL helper `reward_cap`, used by both `/premiar` and the adapter (the user's choice), so the notice is exact and immediate.
  - **No:** caps only in `planReward` (the screen could not know the pair cap).
  - **No:** waiting for `/premiar` (Stellar takes seconds).
- **Yes:** the comment message gives minutes until a slot frees (the user's choice).
  - **No:** a clock time.
  - **No:** a generic «más tarde» (the issue asks for «hasta cuándo»).
- **Yes:** the urgent check runs in the adapter before inserting, with `/gastar` refusing as a backstop (the user's choice).
  - **No:** only `/gastar` (it would say «No pudimos cobrar», which hides the reason).
- **Yes:** the pair notice names the person (the user's choice).
  - **No:** one generic «sin yapitas» text.
- **Yes:** the triggers skip the service role (the user's choice), so the T09 seed and the scripts are not limited. A browser always has a user, so it cannot skip them.
- **Yes (proposed):** «3 premiados por pregunta» counts the first 3 helpful ratings by order, not the reward rows. It is deterministic and does not depend on when `/premiar` runs.
- **Yes (proposed):** a capped reward creates no `rewards` row, so Movimientos shows nothing for it. The rating or vote itself is registered, as the wiki says.
- **Yes (proposed):** the limit error travels as SQLSTATE `BSLIM` + `limit:<reason>` + hint `until`. This keeps `toDataError` a simple mapping and separates it from the 23514 validation errors.

## Risks

| Risk | Mitigation |
|---|---|
| Two simultaneous rewards for the same pair or day both see «2 so far» and both pay (a 4th slips through) | It needs two actions within the same second between the same people, so it is accepted for the MVP. The cap is re-checked on every payment, and the unique memo still prevents paying the same fact twice. |
| A trigger blocks a legitimate demo flow (for example, many test questions on the demo day) | Demo data comes from the service role (not limited). The rls tests cover the exact thresholds, and the test users of T39 are deleted in T38. |
| The Bolivian day is computed differently in SQL, the server and the client | SQL uses `America/La_Paz` (UTC−4, no daylight saving time), the same zone the client already uses (`BOLIVIA_TIME_ZONE`). The `until` the screen shows comes from the server. |
| Changing the return shape of `vote` / `markHelpful` breaks a caller | Step 4 changes the contract, both adapters and the hooks together, and the typecheck catches every caller. |
