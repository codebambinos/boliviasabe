# SPEC 03 — Supabase schema, RLS and reputation view

> **Status:** Implemented
> **Depends on:** SPEC 01 (the `DataApi` contract and the `Id` type this schema must match). Board card: T08.
> **Date:** 2026-11-20
> **Objective:** Create the Supabase Postgres schema from the wiki's «Datos» section as three migrations that run from scratch, enforce row-level security so no user can change another user's data, and expose stars and badges through a view.

## Why this spec exists

T09 (sample data), T17 (`/api` routes), the Supabase adapter (SPEC 02) and every screen that lists signs or questions depend on real tables. Until the schema exists, the Supabase adapter cannot be written against it, and the mock keeps guessing. Security is part of the same change: the public anon key is in the browser bundle, so RLS is the only thing that stops one neighbor from editing another's letrero.

## Scope

**In:**

- Supabase CLI setup in the repo (`supabase/config.toml`, `supabase/migrations/`), with the CLI pinned as a dev dependency.
- Three migrations:
  - `0001_core_tables.sql`: every table listed in the wiki's «Datos» section, plus `hidden_items`, with numeric identity keys, constraints, indexes and the `zone_norm` trigger.
  - `0002_rls.sql`: RLS enabled on every table, with explicit policies and two helper functions.
  - `0003_ratings_view_and_notifications.sql`: the `author_trust` view (stars and badge) and the notifications trigger.
- A pgTAP-free SQL test script, `supabase/tests/rls.sql`, that impersonates two users and checks the RLS rules. It is run by hand with `psql` against the local database.
- A `supabase/README.md` with the local run commands.

**Out of scope (for future specs):**

- The Supabase adapter in `src/data/` (SPEC 02).
- Applying the migrations to the remote Supabase project. That is a separate, confirmed action after merge.
- Seed data: 5 neighbors, signs and questions (T09).
- Hiding an item after 3 reports, and the report counter logic (T22).
- Comment threads and their Realtime setup (T22). The tables exist here; behavior does not.
- Server-side limits and antiabuse checks (T23). The schema has the constraints it can enforce alone; daily counts are not in SQL.
- Rewards logic and writing to `rewards` from the server (T17). The table exists here.
- Push delivery: the webhook, `web-push` and `push_subscriptions` usage (T27). The table exists here.
- The reminder cron (T28).
- Notification types beyond the two in the trigger below. Grouping «Me sirvió» on signs is T24.
- Storage buckets and their policies (photos). Separate spec with the photo flow (T19).
- Google and email auth configuration in the Supabase dashboard (T15).
- Acceptance checks that do not apply to a database change: the 360 px phone review and the Spanish copy check from the T08 card. Neither screen changes here.

## Data model

All primary keys are `bigint generated always as identity`, because Stellar memos hold at most 28 bytes. Supabase Auth users (`auth.users`, UUID) are linked to `profiles` through `profiles.auth_id`. Every other table refers to people by `profiles.id`. Timestamps are `timestamptz`. Text columns have `check` constraints for the lengths in the wiki and in SPEC 01.

### Tables

| Table | Columns (name: type) | Keys and constraints |
|---|---|---|
| `profiles` | `id` bigint; `auth_id` uuid; `display_name` text; `full_name` text; `city` text; `zone` text; `zone_norm` text; `phone` text null; `share` boolean; `stellar_pk` text null; `stellar_status` text (`preparing`, `ready`, `error`); `notif_prefs` jsonb; `theme` text (`system`, `light`, `dark`); `created_at` | PK `id`; `auth_id` unique, references `auth.users(id)` on delete cascade; `city` in the 10 wiki cities; `display_name` 2 to 40 chars |
| `wallet_keys` | `profile_id` bigint; `secret_enc` text; `secret_iv` text; `created_at` | PK `profile_id`, references `profiles`. Never readable by clients (see RLS). |
| `signs` | `id`; `author_id`; `title` text (3 to 80); `photo_url` text; `photo_thumb_url` text; `price` text null; `city`; `zone`; `zone_norm`; `tags` text[] (max 3, each in the 18 wiki tags); `maps_url` text null (must start with `https://`); `created_at` | FK `author_id` → `profiles`; index on (`city`, `created_at` desc) |
| `sign_votes` | `sign_id`; `voter_id`; `helpful` boolean; `created_at` | PK (`sign_id`, `voter_id`) (one vote per person and sign); check: voter is not the sign author (trigger, see below) |
| `questions` | `id`; `author_id`; `text` text (3 to 300); `photo_url` text null; `city`; `zone`; `zone_norm`; `tags` text[] (max 3); `urgent_until` timestamptz null; `status` text (`open`, `solved`, `closed`); `created_at` | FK `author_id`; index on (`city`, `status`, `created_at` desc) |
| `answers` | `id`; `question_id`; `author_id`; `text` text (1 to 1000); `created_at` | FK `question_id`, `author_id`; unique (`question_id`, `author_id`) (one answer per person and question); check: author is not the question author (trigger) |
| `answer_comments` | `id`; `answer_id`; `author_id`; `text` text (1 to 500); `created_at` | FK `answer_id`, `author_id` |
| `ratings` | `id`; `answer_id`; `rater_id`; `helpful` boolean; `created_at` | Unique (`answer_id`, `rater_id`). One row per «Me sirvió» or «No me sirvió» mark on an answer. Only the question author can be the rater (trigger). |
| `reports` | `id`; `reporter_id`; `kind` text (`sign`, `question`, `answer`); `target_id` bigint; `reason` text (`spam`, `false_info`, `offensive`, `personal_data`, `inappropriate`, `other`); `created_at` | Unique (`reporter_id`, `kind`, `target_id`) (one report per person and item) |
| `hidden_items` | `id`; `user_id`; `kind` text (`sign`, `question`, `answer`); `target_id` bigint; `created_at` | Unique (`user_id`, `kind`, `target_id`). Holds «Ya no quiero ver esto». |
| `contact_requests` | `id`; `requester_id`; `owner_id`; `question_id` bigint null; `status` text (`pending`, `accepted`, `declined`); `created_at`, `answered_at` | FK both profiles; check: requester is not owner |
| `saved` | `id`; `user_id`; `kind` text (`sign`, `question`, `answer`); `target_id` bigint; `created_at` | Unique (`user_id`, `kind`, `target_id`) |
| `notifications` | `id`; `user_id`; `kind` text; `ref_kind` text; `ref_id` bigint; `created_at`; `read_at` timestamptz null | FK `user_id`; index on (`user_id`, `created_at` desc) |
| `push_subscriptions` | `id`; `user_id`; `endpoint` text unique; `p256dh` text; `auth` text; `created_at` | FK `user_id` |
| `rewards` | `id`; `profile_id`; `memo_key` text unique; `amount` integer; `reason` text (`bienvenida`, `letrero`, `sirvio-l`, `ayuda`, `cierre`, `urgente`, `canje`); `status` text (`pending`, `confirmed`, `error`); `tx_hash` text null; `created_at`, `updated_at` | Check: `octet_length(memo_key) <= 28`; `amount` is signed (`+5`, `-5`) |

### Helper functions

- `current_profile_id() returns bigint`: `select id from profiles where auth_id = auth.uid()`. `security definer`, `stable`, with `search_path` fixed to `public`.
- `is_profile_owner(p_profile_id bigint) returns boolean`: `p_profile_id = current_profile_id()`. Same attributes.

### zone_norm

- `zone_norm` is set by a `before insert or update` trigger on `profiles`, `signs` and `questions`: `lower(unaccent(trim(zone)))`. It uses the `unaccent` extension, created in `0001`.

### Trigger rules

- `sign_votes`: rejects a vote on the voter's own sign.
- `answers`: rejects an answer by the question's author.
- `ratings`: rejects a rater who is not the author of the question that the answer belongs to.
- All three raise an exception with a message the adapter can map to `forbidden`.

### View: `author_trust`

Stars and badge per author, computed from `ratings` on the author's answers. The view has one row per author who has at least one rating. The view is not created with `security_invoker`, so it can aggregate over the whole `ratings` table. It exposes only aggregates: `profile_id`, `ratings_count`, `helpful_count`, `stars`, `badge`.

- `stars = 1 + 4 × helpful_count ÷ ratings_count`, rounded to one decimal, and `null` when `ratings_count < 3`.
- `badge`: `'Vecino nuevo'` when `ratings_count < 3`; `'De confianza'` when `stars ≥ 4.5` and `ratings_count ≥ 5`; otherwise `'Buen vecino'`.
- A profile with no ratings has no row. The adapter treats a missing row as `stars: null`, `badge: 'Vecino nuevo'`.

### Notifications trigger

- Inserts into `notifications` in two cases:
  1. A new answer: a row for the question's author (`kind = 'answer'`, `ref_kind = 'question'`).
  2. A new rating with `helpful = true`: a row for the answer's author (`kind = 'helpful'`, `ref_kind = 'answer'`).
- The function is `security definer`. Clients have no insert policy on `notifications`.

## Row-level security

RLS is enabled on every table. A table with no policy for an operation denies it.

| Table | select | insert | update | delete |
|---|---|---|---|---|
| `profiles` | authenticated: all rows, but `phone` and `notif_prefs` are visible only to the owner (see below) | owner only (`auth_id = auth.uid()`) | owner only | none |
| `wallet_keys` | none | none | none | none (service role only) |
| `signs` | all | owner only | owner only, and only while no `sign_votes` exist | owner only, same condition |
| `sign_votes` | all | voter is the caller's profile | none (final) | none |
| `questions` | all | owner only | owner only, only `status` and `urgent_until` from the server (set by service role) | owner only, only without answers |
| `answers` | all | author is the caller's profile | owner only, text edits not allowed after a `ratings` row exists | owner only, only without `ratings` |
| `answer_comments` | all | author is the caller's profile | none | owner only |
| `ratings` | all | rater is the caller's profile | none | none |
| `reports` | own rows only | reporter is the caller's profile | none | none |
| `hidden_items` | own rows only | own | none | own |
| `contact_requests` | requester or owner | requester is the caller's profile | owner, to accept or decline | none |
| `saved` | own rows only | own | none | own |
| `notifications` | own rows only | none | own, to set `read_at` | own |
| `push_subscriptions` | own rows only | own | none | own |
| `rewards` | own rows only | none | none | none |

Rules that the table does not show:

- `profiles.phone` and `profiles.notif_prefs` are not selectable by other users. Other users read `profiles_public`, a view with `id`, `display_name`, `city`, `zone`, `share` and the badge. The view is created in `0002` and selects from `profiles` and `author_trust`.
- Clients never write `rewards`, `wallet_keys`, `notifications` (insert), `questions.status` or `questions.urgent_until`. Those are changed by the service role from `/api` (T17) and by triggers.

## Implementation plan

1. Add the Supabase CLI as a dev dependency with `npm install --save-exact --save-dev supabase@<version>`. Pick the version at this step and record it in the commit message. Run `npx supabase init` and commit `supabase/config.toml`. `npm run typecheck` and `npm run build` pass.
2. Add `supabase/migrations/0001_core_tables.sql`. It creates the `unaccent` extension, every table in the Data model with its constraints, the indexes, the `zone_norm` trigger and the three rule triggers. `npx supabase db reset` runs and exits with 0 on the local stack.
3. Add `supabase/migrations/0002_rls.sql`. It creates the two helper functions, enables RLS on every table, adds the policies from the RLS table and creates `profiles_public`. The local reset still exits with 0. `supabase/tests/rls.sql` is added with the checks for the first table (`profiles`) only.
4. Extend `supabase/tests/rls.sql` to cover every table in the RLS table. Each check impersonates a user with `set local role authenticated` and `set local request.jwt.claims`, then asserts the row count or the error. The script ends with `raise notice 'rls ok'` and aborts on the first failure.
5. Add `supabase/migrations/0003_ratings_view_and_notifications.sql`. It creates the `author_trust` view and the notifications trigger function and trigger. Extend `rls.sql` to check the stars formula (2 helpful and 1 not helpful gives 3.7 stars with 3 ratings, badge «Buen vecino»), the badge thresholds and the notification rows.
6. Add `supabase/README.md`: how to run `npx supabase start`, `npx supabase db reset` and `psql` with `rls.sql`; that the service role key never goes into the repo; and how to add a migration.
7. Update the T08 card on the board with the link to this spec and tick the done criteria that apply.

## Acceptance criteria

- [x] `npx supabase db reset` on an empty local database runs `0001`, `0002` and `0003` in order and exits with 0.
- [x] Running `db reset` a second time gives the same result (no leftover state).
- [x] Every table in the Data model has RLS enabled (`select relname from pg_class where relrowsecurity = false` returns only the Supabase system tables).
- [x] `supabase/tests/rls.sql` runs from `psql` against the local database and prints `rls ok`.
- [x] As user A, an `update` on a sign of user B changes 0 rows.
- [x] As user A, a `delete` on a sign of user B deletes 0 rows.
- [x] As user A, an insert into `sign_votes` for user B's sign is rejected, and so is a vote on A's own sign.
- [x] As user A, an insert into `ratings` on an answer to a question that A did not ask is rejected.
- [x] As user A, an insert into `answers` on A's own question is rejected.
- [x] As user A, a second `answers` row for the same question is rejected by the unique key.
- [x] As user A, `select` on `profiles` does not return the `phone` or `notif_prefs` of user B. `profiles_public` does not expose them either.
- [x] As an authenticated user, `select` on `wallet_keys` returns 0 rows, and so does an `insert`.
- [x] As user A, a `select` on `rewards` returns only A's rows, and an `insert` is rejected.
- [x] As user A, an `insert` into `notifications` is rejected. After A answers B's question, B has one `notifications` row of kind `answer`.
- [x] After user B marks A's answer as «Me sirvió», A has one `notifications` row of kind `helpful`.
- [x] A `memo_key` longer than 28 bytes is rejected.
- [x] A `zone` with accents and capitals gives a `zone_norm` in lowercase without accents (`Sopocachi` and `sopocachí` give the same value).
- [x] With 2 helpful and 1 not helpful ratings, `author_trust` returns `stars = 3.7` and `badge = 'Buen vecino'`.
- [x] With 2 ratings (any values), `author_trust` returns `stars` null and `badge = 'Vecino nuevo'`.
- [x] With 5 ratings, 5 helpful, `author_trust` returns `badge = 'De confianza'`.
- [x] `hidden_items` lets a user insert and delete only their own rows.
- [x] `npm run typecheck` and `npm run build` pass, and the CI check is green on the PR.
- [x] `git grep -i "SECRET\|SERVICE_ROLE"` shows no values. The migrations contain no keys.

## Decisions

Confirmed by the user:

- **Yes:** `hidden_items` table for «Ya no quiero ver esto», one row per user and item. Easy to undo and to filter lists with.
- **No:** a hidden-users array column on each content table. More complex RLS and list queries.
- **Yes:** `ratings` holds one row per «Me sirvió» or «No me sirvió» mark on an answer. Stars and badges come only from this table, as the wiki says.
- **No:** putting sign votes in `ratings`. The wiki's stars formula is about answers, and sign votes are not a reputation signal.
- **Yes:** `notifications` readable only by its owner, inserted only by a trigger. Clients can never forge a notification to another neighbor.
- **Yes:** verify migrations with `supabase db reset` on a local Docker database. It is repeatable and does not touch the real project.
- **No:** running the tests only against the remote project. Each run would change real data and could not start from zero.

Proposed in this spec (not asked, recorded here so they can be changed):

- **Yes:** user references go through `profiles.id` (numeric) with `profiles.auth_id` pointing to `auth.users`. This keeps every key numeric, as the wiki requires, even though Supabase Auth uses UUIDs.
- **Yes:** `wallet_keys` is a separate table with no policies at all. The encrypted Stellar secret and its IV are never returned to any client, not even to the owner. The wiki says the cipher text is stored in Supabase, so a separate table keeps it out of `profiles` reads.
- **Yes:** `phone` and `notif_prefs` are hidden from other users, and `profiles_public` is the public view. Display names and zones are public, as the wiki's profile card shows.
- **Yes:** `author_trust` is a view without `security_invoker`, so it can read all ratings while exposing only aggregates. Supabase's linter flags this kind of view, and the choice is intentional.
- **Yes:** `zone_norm` is set by a trigger with `unaccent`, not a generated column. `unaccent` is not immutable in every Postgres version, so a generated column is avoided.
- **Yes:** the notifications trigger covers only the two events that the tables in this spec can produce (new answer, «Me sirvió» on an answer). Sign votes, comments, contact requests, urgent questions and grouping belong to T22 and T24, each with its own migration.
- **Yes:** the schema forbids self-votes, self-answers and self-ratings with triggers, not only with RLS. Triggers also run for the service role.
- **No:** a daily count or limit in SQL. Those rules are enforced by the `/api` routes (T17, T23), where the service role can read the whole day.
- **No:** a `DataApi` change in this spec. The contract in SPEC 01 already matches the tables; the adapter is SPEC 02.

## Risks

| Risk | Mitigation |
|---|---|
| A policy has a gap and a neighbor can edit someone else's content | `rls.sql` covers every table with a check for both the allowed and the denied case. The checks run before merge. |
| `author_trust` is readable by everyone and reveals more than stars | The view selects only aggregates. The test checks that no column of the raw ratings appears in it. |
| The migrations work locally but fail on the remote project (a different Postgres version or a missing extension) | `unaccent` is available in Supabase by default. The remote apply is a separate step with its own check. |
| The service role key leaks into the repo through the test script | `rls.sql` only uses the `authenticated` role and never reads a key. `git grep` runs in the acceptance criteria. |
| The schema drifts from the Supabase adapter (SPEC 02) | SPEC 02 uses the same acceptance tests against the local database. Any column change goes through a new migration and a spec update. |

## What is **not** in this spec

- The Supabase adapter in `src/data/` (SPEC 02).
- Applying the migrations to the remote Supabase project.
- Seed data for 5 neighbors, signs and questions (T09).
- Hiding after 3 reports, comment threads and Realtime (T22).
- Server-side limits, rewards and the `/api` routes (T17, T23).
- Push delivery, the reminder cron and the push webhook (T27, T28).
- Notification types beyond the two in the trigger, and grouping (T24).
- Storage buckets and photo policies (T19).

Each one of those, if it lands, goes in its own spec.
