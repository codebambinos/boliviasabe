# Supabase database

The schema, row-level security and reputation view for BoliviaSabe (SPEC 03).

| Path | What it is |
|---|---|
| `config.toml` | Local stack settings (`project_id = "BoliviaSabe"`). |
| `migrations/0001_core_tables.sql` | Tables from the wiki «Datos» section, constraints, `zone_norm` trigger, rule triggers. |
| `migrations/0002_rls.sql` | RLS on every table, helper functions, `profiles_public` view. |
| `migrations/0003_ratings_view_and_notifications.sql` | `author_trust` view (stars and badge), notification triggers. |
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

The remote project already exists (board card T08). Applying the migrations to it is a separate step, done after the PR is merged and by someone with access to the project:

```sh
npx supabase login                              # opens the browser; the token stays on your machine
npx supabase link --project-ref <project-ref>   # the ref is in the Supabase dashboard
npx supabase db push --dry-run                  # lists the migrations that would run
npx supabase db push                            # applies them
```

Never put the database password, the service role key or a personal access token in this repo. The browser only gets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` lives in Vercel and in `.env` on the developer machine, and it bypasses RLS.

## Security notes

- RLS is the only thing that stops one neighbor from changing another's content, because the anon key is in the browser bundle.
- The service role bypasses RLS. It is used only from the Vercel functions (`/api`, T17).
- Rule triggers (self-votes, self-answers, rating only as the asker) also run for the service role.
