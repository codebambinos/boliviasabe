# SPEC 18 — 24 h reminder «¿Alguna respuesta te sirvió?»

> **Status:** Implemented
> **Depends on:** SPEC 15 (T27: `notifications.actor_id` / `pushed_at`, `dispatch_push`, `push_details`, `/api/push`, `lib/push/message.ts`), SPEC 13 (question states `open` / `solved` / `closed`). Board card: T28 (issue #21).
> **Date:** 2026-11-21
> **Objective:** Once an hour, the database sends a single push «¿Alguna respuesta te sirvió?» to the author of every question that is still open 24 h after its first answer, and resends any push from the last hour that never left.

## Why this spec exists

- The wiki (`reglas-finales` › Preguntas › Recordatorio, #44) says: 24 h after the first answer, if the question is still open, send one push, only once.
- SPEC 15 left the reminder out. It is the only notification in `reglas-finales` › Notificaciones that is still missing.
- Since T27, pg_net lost at least one push (notification #63, «Error in the HTTP2 framing layer»). Its row was saved, but the push never went out, and nothing retries it.

## Scope

**In:**

- **Hourly job (`pg_cron`, migration `0009_reminders.sql`).**
  - One `pg_cron` job, `bs-hourly-push`, runs `select public.run_hourly_push_jobs()` at minute 7 of every hour (`7 * * * *`).
  - It runs entirely in SQL. There is no Vercel endpoint and no `CRON_SECRET`.
- **The reminder (`public.queue_answer_reminders()`).** It inserts one notification for every question that meets all of these:
  - `status = 'open'`.
  - Its **first answer** (the oldest one still in `answers`) is **between 24 h and 48 h old**.
    - Older questions never get a reminder, so the seed and the test questions do not flood anyone on release.
    - The 24 h of slack also covers a missed run.
  - It has **no `reminder` notification yet**. A partial unique index enforces "only once", even if two runs overlap.
- **The new row.**
  - `kind = 'reminder'`, `ref_kind = 'question'`, `ref_id` = the question.
  - `user_id` = the author of the question, `actor_id = null` (nobody caused it).
  - The existing `notifications_dispatch_push` trigger sends it. Nothing new is needed for delivery.
- **The text of the push (`lib/push/message.ts`).**
  - Title «¿Alguna respuesta te sirvió?».
  - Body: the start of the question, at most 80 characters (`snippet`).
  - Tap opens `/p/:id`. Tag `reminder-<questionId>`.
- **The switch.** `reminder` belongs to the «Respuestas» switch (`PREF_OF.reminder = 'answers'`), so Ajustes gets no new switch.
  - As with `answer`, the row is always saved (the bell shows it), and `/api/push` skips the push when «Respuestas» is off.
- **`push_details` (recreated in `0009`).** It gains a `reminder` branch:
  - `text` = question text, `url` = `/p/<id>`, item kind `question`.
  - The question has to be visible to its author: not hidden by them, and fewer than 3 reports.
- **Resending lost pushes (`public.resend_pending_pushes()`).**
  - It calls `/api/push` again for every notification created **between 5 and 65 minutes ago** whose `pushed_at` is still `null`.
  - `pushed_at` stays `null` only when `/api/push` never processed the row.
    - `sendPush` sets `pushed_at` before every outcome, even when it skips the push (prefs off, item gone, no devices).
    - So a resend can never push twice.
- **One pg_net call.** The body of `dispatch_push` (read the Vault `push_url` / `push_secret`, then `net.http_post`) moves to `public.request_push(p_id bigint)`.
  - The trigger and the resend both use it.
  - Without the Vault secrets, it does nothing, as today.
- **`run_hourly_push_jobs()`** runs both and returns `{ "reminders": n, "resent": n }`, so a manual run shows what it did.
- **RLS tests** (`supabase/tests/rls.sql`): a 0009 block (see acceptance criteria).
- **Docs.**
  - `supabase/README.md`: a «Hourly job (T28)» section explaining how to see the job, run it by hand and read its history in `cron.job_run_details`.
  - `.env.example`: remove the `CRON_SECRET` block.
- **Wiki first (`boliviasabe-docs`).**
  - `huecos-cerrados.md`: #112 changes from "pg_cron calls `/api/cron/recordatorios`" to "pg_cron runs SQL in the database". A new case #208 records the 24–48 h window, the «Respuestas» switch and the hourly resend.
  - `log.md`, the `index.md` count, and `stack.md` › 3.2.
  - Issue #21: same wording.

**Extra (asked by Diego while waiting for the production test; wiki #209):**

- The top bar's «Entrar» becomes «Iniciar sesión». The sign-in sheet title becomes «Inicia sesión en BoliviaSabe», Yo says «Inicia sesión para guardarlas», and the e-mail submit says «Continuar».
- The city picker no longer keeps its focus ring after a mouse or finger pick. The keyboard still shows it.

**Out:**

- The bell (T24, Aldrin).
  - `reminder` rows show up in `notifications` with `actor_id = null`. The bell's copy and grouping are his.
- A fifth switch in Ajustes.
- Reminding again, or a second reminder at 72 h. Once means once.
- Reminders for questions without answers, or for questions already solved or closed.
- Retrying a push that `/api/push` processed but the phone did not show. That is the push service's job (TTL 24 h).
- Retrying beyond the 65-minute window. An older lost push stays only in the bell.
- Vercel Cron and any `/api/cron/*` endpoint.

## Data model

Migration `supabase/migrations/0009_reminders.sql`:

```sql
create extension if not exists pg_cron;

-- Only once per question, even if two runs overlap
create unique index notifications_one_reminder_idx on public.notifications (ref_id) where kind = 'reminder';

-- The pg_net call of dispatch_push, now shared with the resend (Vault push_url / push_secret)
public.request_push(p_id bigint) returns void            -- security definer; no-op without the Vault secrets; never raises
public.dispatch_push()                                    -- trigger: perform public.request_push(new.id)

public.queue_answer_reminders() returns integer           -- rows inserted
  -- open questions whose first answer is >= 24 h and < 48 h old, with no 'reminder' row yet
  -- insert (user_id = author, kind = 'reminder', ref_kind = 'question', ref_id = question, actor_id = null)
  -- on conflict do nothing

public.resend_pending_pushes() returns integer            -- rows re-requested
  -- notifications with pushed_at is null and created_at between now() - 65 min and now() - 5 min

public.run_hourly_push_jobs() returns jsonb               -- { "reminders": n, "resent": n }

public.push_details(p_id bigint)                          -- recreated with the 'reminder' branch

select cron.schedule('bs-hourly-push', '7 * * * *', 'select public.run_hourly_push_jobs()');
```

- All new functions are `security definer` with `set search_path = public`, and are revoked from `public`, `anon` and `authenticated`.
- `lib/push/message.ts`: `NotificationKind` gains `'reminder'`, and `PREF_OF.reminder = 'answers'`. `buildMessage` gets the `reminder` case.
- No new columns, tables, client data or environment variables. `CRON_SECRET` goes away.

## Implementation plan

1. **Wiki and board.**
   - Update `huecos-cerrados.md` (#112, new #208), `log.md`, the `index.md` count and `stack.md` › 3.2 in `boliviasabe-docs`, then push.
   - Rewrite the body of issue #21 with the same decision.
2. **Migration `0009_reminders.sql`.**
   - `request_push`, and `dispatch_push` using it.
   - `queue_answer_reminders`, `resend_pending_pushes`, `run_hourly_push_jobs`.
   - The unique index, `push_details` with `reminder`, the grants and the `cron.schedule`.
   - Before writing it, check `pg_cron` setup against the current Supabase docs.
   - Run it with `npx supabase db reset` on the local stack.
3. **RLS tests.** Add the 0009 block to `supabase/tests/rls.sql` and run it locally.
4. **Push text.** In `lib/push/message.ts`, add the `reminder` kind, `PREF_OF` and the `buildMessage` case. `npm run typecheck` passes.
5. **Docs.** Add the «Hourly job (T28)» section to `supabase/README.md`, and remove `CRON_SECRET` from `.env.example`.
6. **Production (only with Diego's permission).**
   - `npx supabase db push --remote`.
   - Check that `cron.job` lists `bs-hourly-push`.
   - Do the manual test in the acceptance criteria, then open the PR (`Closes #21`).

## Acceptance criteria

**Database (`supabase/tests/rls.sql`, local stack):**

- [ ] An open question whose first answer is 25 h old gets exactly 1 `reminder` row for its author, with `ref_kind = 'question'` and `actor_id` null.
- [ ] Running `queue_answer_reminders()` a second time inserts 0 rows. Inserting a second `reminder` for the same question by hand fails on the unique index.
- [ ] No reminder for: a first answer 23 h old; a first answer 49 h old; a `solved` question; a `closed` question; a question without answers.
- [ ] With «Respuestas» off (`notif_prefs.answers = false`), the row is still created.
- [ ] `resend_pending_pushes()` counts a row with `pushed_at` null created 10 min ago. It skips rows created 2 min ago, rows created 2 h ago, and rows with `pushed_at` set.
- [ ] `run_hourly_push_jobs()` returns `{ "reminders": n, "resent": n }`.
- [ ] `push_details` of a reminder returns `kind = 'reminder'`, the question text, `url = '/p/<id>'` and `visible = true`. It returns `visible = false` if the author hid that question.
- [ ] `anon` and `authenticated` cannot execute `request_push`, `queue_answer_reminders`, `resend_pending_pushes` or `run_hourly_push_jobs`.
- [ ] The rest of `rls.sql` still passes.

**Production (with Diego's permission for the migration and the test data):**

- [ ] `select jobname, schedule from cron.job` shows `bs-hourly-push | 7 * * * *`, and `cron.job_run_details` shows a successful run after the next minute 7.
- [ ] Manual test of the reminder:
  - Account A asks, account B answers.
  - Move that answer's `created_at` back 25 h and run `select public.run_hourly_push_jobs()`.
  - A's phone receives «¿Alguna respuesta te sirvió?» with the start of the question.
  - Tapping it opens that question.
- [ ] Running `run_hourly_push_jobs()` again sends nothing new: `reminders: 0`.
- [ ] With «Respuestas» off on A, a second test question gets its row, but A's phone receives no push.
- [ ] The test questions, answers and notifications are deleted afterwards (also listed in T38).

**Code:**

- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] `git grep -i "SECRET\|SERVICE_ROLE"` shows no values. `CRON_SECRET` is no longer in `.env.example`.
- [ ] The wiki (#112, #208, log, index, `stack.md`) and issue #21 describe pg_cron → SQL, not `/api/cron/recordatorios`.

## Decisions taken and discarded

| Decision | Discarded | Why |
|---|---|---|
| `pg_cron` runs SQL that inserts the rows; the existing trigger sends the push | `pg_cron` → pg_net → `/api/cron/recordatorios` with `CRON_SECRET` (issue #21, wiki #112) | Delivery already lives in the database since T27. An endpoint would add a function, a secret in three places and one more network hop that can fail, without adding anything. |
| Only questions whose first answer is 24–48 h old | Every open question with an answer older than 24 h | On release, the seed and the test questions would all get a reminder at once. The 24 h window also catches up after a missed run. |
| A partial unique index for "only once" | Only a `not exists` check | Two overlapping runs (a slow run, or a manual run during a scheduled one) could insert twice without it. |
| Under the «Respuestas» switch; the row is always saved | A fifth «Recordatorios» switch; filtering the row like `urgent` | The wiki lists 4 switches. The reminder is about your answers. The bell must show it even with the push off, the same as `answer`. |
| Title «¿Alguna respuesta te sirvió?», body = the question | Body with an answer count | The question is what the person recognizes. A count adds a query and goes stale. |
| Resend rows with `pushed_at` null that are 5–65 min old | No resend; retry forever | Covers lost pg_net calls like #63. `pushed_at` makes it idempotent. Five minutes leaves room for a slow first call, and 65 minutes overlaps the hourly run without retrying the same row for ever. |
| `request_push` shared by the trigger and the resend | Copying the pg_net call | One place reads Vault and calls `/api/push`. |
| Minute 7 of every hour | Minute 0 | Avoids the minute when other scheduled jobs usually run. Nothing depends on the exact minute. |

## Identified risks

- **`pg_cron` not enabled or not allowed on the project.** The job would not exist, and the migration would fail on `create extension`.
  - Step 2 checks the Supabase docs.
  - Step 6 checks `cron.job` and `cron.job_run_details` on production.
- **The push leaves after the question was solved.** The window is seconds, between the insert and `/api/push`. Accepted.
- **The first answer is deleted.** The next oldest answer becomes "the first". The reminder may come later than 24 h after the original answer, or never if no answer is left. Accepted.
- **Local stack without Vault secrets.** `request_push` does nothing, so reminder rows are created but not pushed, and `resend_pending_pushes` counts rows it cannot send. The tests check the counts, not the delivery.
- **A pushed reminder for a question in review (≥ 3 reports).** `push_details` marks it not visible, so the push is skipped, like any other kind.
