# Supabase database

The schema, row-level security and reputation view for BoliviaSabe (SPEC 03).

| Path | What it is |
|---|---|
| `config.toml` | Local stack settings (`project_id = "BoliviaSabe"`). |
| `migrations/0001_core_tables.sql` | Tables from the wiki «Datos» section, constraints, `zone_norm` trigger, rule triggers. |
| `migrations/0002_rls.sql` | RLS on every table, helper functions, `profiles_public` view. |
| `migrations/0003_ratings_view_and_notifications.sql` | `author_trust` view (stars and badge), notification triggers. |
| `migrations/0004_auth_method.sql` | `auth_method(email)` for the sign-in sheet. |
| `migrations/0005_data_adapter.sql` | `photos` bucket, read functions (JSON shaped like `src/data/types.ts`), `rate_answer`, `close_question`, `remove_sign`, saved/report/hide functions (SPEC 11). |
| `migrations/0006_threads_and_contact.sql` | Comments can be reported and go with their answer, `contact_requests.answer_id`, private `contact_phones`, `request_contact` / `respond_contact`, comments and contact in `get_question`, Realtime publication (SPEC 12). |
| `tests/rls.sql` | Checks for every table and rule trigger. Runs in one transaction that is rolled back. |

Migrations run in file-name order. Do not edit a migration that is already on the remote project: add a new one.

## Requirements

- Docker running (only for the local stack; the app itself does not need it).
- Node 24 (`.nvmrc`). The Supabase CLI is a dev dependency, pinned at `3.0.0`, so use `npx supabase`.

## Local stack

```sh
npx supabase start        # Postgres, Auth, Studio and friends in Docker (first run downloads images)
npx supabase db reset     # drop the local database and run 0001..0003 from scratch
npx supabase stop         # stop the containers when you are done
```

The local database listens on `127.0.0.1:54322` (user `postgres`, password `postgres`). Those are local-only values, not secrets.

## Run the RLS checks

With the stack running and after `db reset`:

```sh
docker exec -i supabase_db_BoliviaSabe psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls.sql
```

A passing run prints one `ok:` notice per check and ends with `rls ok`. The first failing check prints `FAILED: <label>` and stops the script. The script never reads an API key: it impersonates the `anon` and `authenticated` roles with `set local role` and a JWT claim.

If `psql` is installed on your machine, you can also run `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql`.

## Add a migration

```sh
npx supabase migration new short_description   # creates supabase/migrations/<timestamp>_short_description.sql
```

Then run `npx supabase db reset` and `tests/rls.sql`. If the new table has user data, add its RLS policies in the same change and add checks for them in `tests/rls.sql`. Rename the file to the next free number (`0004_...`) if you want the numbering from SPEC 03 to continue.

## Remote project

The remote project is `boliviasabe` (ref `wyadmywsqdohvegwucfj`, marked as production). Migrations `0001` to `0003` are already applied there (T08).

With Supabase CLI 3, every database command targets the **local** stack unless you pass `--remote`. Without it, `db push` only touches your Docker database. To apply a new migration to the project, someone with access runs:

```sh
npx supabase login                               # opens the browser; the token stays on your machine
npx supabase link --project-ref wyadmywsqdohvegwucfj
npx supabase migration list --remote             # local and remote history side by side
npx supabase db push --dry-run --remote          # lists the migrations that would run, applies nothing
npx supabase db push --remote                    # applies them
```

Run the dry run first and check that it lists only the new migration. An applied migration is never edited: fix it with a new one.

For a read-only look at the remote schema, use `npx supabase db query --remote --read-only "<sql>"`.

Never put the database password, the service role key or a personal access token in this repo. The browser only gets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` lives in Vercel and in `.env` on the developer machine, and it bypasses RLS.

## Auth setup (T15)

The browser signs people in with Supabase Auth: Google, or e-mail + password. This is settings in the dashboard, not code, so check it before testing the sign-in. Project `boliviasabe`, dashboard › Authentication.

| Where | Setting | Value |
|---|---|---|
| URL Configuration | Site URL | `http://localhost:5173` while developing. T13 changes it to the Vercel URL. |
| URL Configuration | Redirect URLs | `http://localhost:5173`, `http://localhost:5173/nueva-contrasena` and, after T13, the same two on the Vercel URL. The recovery link needs `/nueva-contrasena` here. |
| Sign In / Providers › Email | Confirm email | **Off** (the demo creates the account and signs in at once). |
| Sign In / Providers › Email | Minimum password length | 6 |
| Sign In / Providers › Google | Enabled, Client ID, Client secret | From Google Cloud › APIs and services › Credentials › OAuth client (web). Its authorized redirect URI is the one the Google provider page shows, `https://<project-ref>.supabase.co/auth/v1/callback`. |
| Project Settings › Auth › SMTP | Custom SMTP | `smtp.gmail.com`, port 587, the app password of the project's Gmail account. Starts at 30 e-mails per hour. |

Google consent screen: publish it in production **without a logo** (a logo triggers a brand verification that takes days), with the link to `/privacidad`.

Put the public values in `.env`: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (dashboard › Project Settings › API; new projects may show a `sb_publishable_` key in its place). Never the service role key.

The local stack (`npx supabase start`) is only for the database and RLS checks. Test Google and the recovery e-mail against the remote project.

## Push notifications (T27)

Every new row of `notifications` calls `/api/push` through `pg_net` (0008). The URL and the shared secret live in
Supabase Vault; without them nothing is sent and the rows are still saved (the bell works). Set them once per
project in the SQL editor, with the same secret as `PUSH_WEBHOOK_SECRET` in Vercel:

```sql
select vault.create_secret('https://boliviasabe.vercel.app/api/push', 'push_url');
select vault.create_secret('<PUSH_WEBHOOK_SECRET>', 'push_secret');
-- To change one later: select vault.update_secret(id, '<new value>') from vault.secrets where name = 'push_secret';
```

Locally, point `push_url` at `vercel dev`: `http://host.docker.internal:3000/api/push`.

## Security notes

- RLS is the only thing that stops one neighbor from changing another's content, because the anon key is in the browser bundle.
- The service role bypasses RLS. It is used only from the Vercel functions (`/api`, T17).
- Rule triggers (self-votes, self-answers, rating only as the asker) also run for the service role.
