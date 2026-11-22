# SPEC 26 — Pre-submission cleanup of production (T38)

> **Status:** Implemented
> **Depends on:** SPEC 14 (seed: `scripts/seed/seed.ts`, `deleteOwned`, `content.ts`), SPEC 03 (tables and foreign keys), SPEC 20 (`stellar:reset`, the dry-run pattern). Board card: T38 (issue #41).
> **Date:** 2026-11-22
> **Objective:** Remove every test post and test account from production with a re-runnable `npm run cleanup` that previews first, so judges only see the seed neighborhood and real content.

## Why this spec exists

Judges open https://boliviasabe.vercel.app as it is. Today Hoy shows «Prueba letrero» and «Prueba 2 usuarios 2», and ¿Alguien sabe? shows «fffff» and «Necesito parrilla». A read-only look at production (22 nov) found:

- **Team accounts** with test content: Diego R. (10 letreros, 7 preguntas, 9 respuestas, 3 comentarios), Diego C. (2, 10, 3, 3), Yaeko (1 pregunta), Aldrin (1 pregunta, 1 respuesta, 1 comentario).
- **Seed neighbors** with extra junk on top of the seed: questions «ggagag», «uuuuuu», «dwwadawdawd», «dwadawdaw», «fffff», plus answers and comments that are not in `scripts/seed/content.ts`. Their 9 letreros and the 14 seed questions are fine.
- **3 auth users without a profile** (Diego's test sign-ups).
- **1 new user of 22 nov** that is not the team («Yay!», no content). It may be a real person or a judge: never touched.

Rewards are already paid on Stellar testnet and cannot be undone, so the `rewards` rows stay as history: the balance in Yo keeps matching the chain.

## Scope

**In:**

- **Shared delete helper.** Move the content deletion of `scripts/seed/seed.ts` (`deleteOwned`) to `scripts/shared/delete-content.ts`, split in two:
  - `deleteContent(db, { signIds, questionIds, answerIds, commentIds })`: deletes exactly those items and what hangs from them (answers of a deleted question, comments and ratings of a deleted answer, sign votes, contact requests, and `saved`, `hidden_items`, `reports` and `notifications` that point at them), plus each item's photo (and thumbnail) in the `photos` bucket, found from `photo_url` / `photo_thumb_url`.
  - `deleteOwned(db, profiles, everything)`: same behavior as today, now built on `deleteContent`. The seed imports it from the new file; `npm run seed` behaves exactly as before.
- **`npm run cleanup`** (`scripts/cleanup/cleanup.ts`, `node --env-file-if-exists=.env`):
  1. **Team content:** for the profiles of the e-mails in `CLEANUP_TEAM_EMAILS`, delete all their letreros, preguntas, respuestas and comentarios (and what hangs from them, per `deleteContent`). Their auth user, profile, Stellar key, rewards, push subscriptions and settings stay.
  2. **Seed extras:** for the 5 seed neighbors (matched by e-mail from `content.ts`), delete what is not in the seed. Matching is the seed's own: a sign by author + title, a question by author + text, an answer by question + author + text, a comment by answer + author + text.
  3. **Test users:** delete the auth users in `CLEANUP_DELETE_EMAILS`. Only allowed when they have **no profile**; one with a profile makes the script stop before writing anything.
  4. **Everyone else is untouched:** any account not in those lists (for example «Yay!» or anyone who signs up during judging) keeps all its content. The only exception is the cascade: an answer or comment it wrote on a deleted question goes with that question.
- **`--dry-run`:** writes nothing and prints, per step, the count and the list (id, author, first 40 characters) of what would be deleted, plus the photo paths. Without `--dry-run`, it prints the same list and then deletes.
- **Re-runnable:** a second run finds nothing to delete and prints «Nada que limpiar».
- **Safety:** the script stops before writing if `CLEANUP_TEAM_EMAILS` is empty, if an e-mail in either list is a seed neighbor, or if a listed e-mail is not found (typo).
- **E-mails live in `.env`, not in the repo** (the repo is public): `CLEANUP_TEAM_EMAILS` and `CLEANUP_DELETE_EMAILS`, comma separated. `.env.example` gets both keys with empty values.
- **Closing steps of T38** (in the plan, done after the cleanup):
  - Supabase › Authentication › URL Configuration: Diego removes every `http://` redirect (localhost, LAN IP); leaves `https://boliviasabe.vercel.app`, `https://boliviasabe.vercel.app/nueva-contrasena` and the preview wildcard. Then sign in with e-mail and with Google on production.
  - Re-read `README.md` against production and remove anything that does not work.
  - Check that `main` is deployed to production and that `git grep -i "SECRET\|SERVICE_ROLE"` shows no values.
- **Wiki:** an entry in `log.md` (cleanup done, what stayed). No product rule changes.

**Out of scope:**

- Uploading new real letreros or preguntas. The team posts them from the app by hand after the cleanup.
- Deleting or rewriting `rewards`, or anything on Stellar. Payments stay as history.
- Deleting team accounts, their Stellar keys or push subscriptions.
- Re-running the seed (`npm run seed -- --fresh`): it would pay rewards again and change ids and dates.
- A scheduled or automatic cleanup, or an admin screen.
- Retaking the pitch-deck screenshots (done separately once production is clean).

## Data model

No tables, columns, migrations or API changes.

New environment variables (local `.env` only, never Vercel):

```bash
# Accounts whose content is deleted (the accounts stay). Comma separated.
CLEANUP_TEAM_EMAILS=
# Auth users without a profile that are deleted. Comma separated.
CLEANUP_DELETE_EMAILS=
```

New helper signature (`scripts/shared/delete-content.ts`):

```ts
export type ContentIds = { signIds: number[]; questionIds: number[]; answerIds: number[]; commentIds: number[] };
export async function deleteContent(db: SupabaseClient, ids: ContentIds, opts: { dryRun: boolean }): Promise<DeletePlan>;
export async function deleteOwned(db: SupabaseClient, profiles: { id: number; authId: string }[], everything: boolean): Promise<void>;
```

`DeletePlan` lists, per table, the ids that are (or would be) deleted, and the photo paths, so `--dry-run` and the real run print the same thing.

Notifications that point at a deleted item are found by kind: `answer`, `urgent`, `reminder` → question id; `comment` → comment id; `helpful` → answer id; `sign_helpful` → sign id; `contact_request`, `contact_accepted` → contact request id (deleted with its question or answer).

## Implementation plan

1. **Extract the helper.** Create `scripts/shared/delete-content.ts` with `deleteContent` and `deleteOwned`; `scripts/seed/seed.ts` imports `deleteOwned` from it. `npm run seed -- --dry-run` prints the same as before. `npm run typecheck` passes.
2. **Item-level deletion and photos.** `deleteContent` deletes by item ids (not by profile folder), removes the photo and thumbnail of each deleted sign and question from `photos`, and the notifications that point at deleted items. It returns the `DeletePlan`.
3. **The cleanup script, dry-run only.** `scripts/cleanup/cleanup.ts` and `"cleanup"` in `package.json`: reads the two e-mail lists, runs the safety checks, builds the plan for team content, seed extras and test users, and prints it. `.env.example` gets the two keys. Run `npm run cleanup -- --dry-run` against production and show the list to Diego.
4. **Real run (needs Diego's explicit OK on the dry-run list).** Without `--dry-run`, the script deletes in foreign-key order and checks every error (a failed delete stops the run). Run it once; run it again and it prints «Nada que limpiar».
5. **Check production.** Hoy shows only the 9 seed letreros (plus anything real); ¿Alguien sabe? shows the 14 seed questions; no «Prueba», «fffff» or «ggagag». Yo of a team account still shows its balance and movements. «Yay!» is unchanged.
6. **Closing steps.** Diego cleans the Supabase Redirect URLs and signs in with e-mail and Google on production. README re-read against production. `main` deployed; `git grep -i "SECRET\|SERVICE_ROLE"` clean.
7. **Wiki.** Entry in `log.md`. Spec status → Implemented.

## Acceptance criteria

- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] `npm run seed -- --dry-run` prints the same plan as before the extraction.
- [ ] `npm run cleanup -- --dry-run` writes nothing (row counts in production are the same before and after).
- [ ] The dry-run list contains every team letrero, pregunta, respuesta and comentario, the seed extras («ggagag», «uuuuuu», «dwwadawdawd», «dwadawdaw», «fffff» and their answers) and the 3 users without a profile, and nothing from the seed content or from «Yay!».
- [ ] With an empty `CLEANUP_TEAM_EMAILS`, a seed e-mail in a list, an unknown e-mail, or a delete e-mail that has a profile, the script stops before writing and says why.
- [ ] After the real run, in production: 0 signs, questions, answers and comments by the team accounts; seed content equals `content.ts` (9 signs, 14 questions with their answers and comments); the 3 auth users are gone.
- [ ] The team accounts can still sign in, and Yo shows the same balance as Stellar.
- [ ] No photo of a deleted item remains in the `photos` bucket; the seed photos are still there.
- [ ] No notification points at a deleted item (Avisos shows no «no disponible» rows from the cleanup).
- [ ] A second run prints «Nada que limpiar».
- [ ] Supabase Redirect URLs contain no `http://` entry, and e-mail and Google sign-in work on production.
- [ ] `git grep -i "SECRET\|SERVICE_ROLE"` shows no values, and no team e-mail is committed.

## Changes during implementation

- `sign_votes` has no `id` (its key is sign + voter): the plan keeps one sign id per vote and deletes by `sign_id`.
- Re-running: a user in `CLEANUP_DELETE_EMAILS` that no longer exists counts as already deleted (it is printed, not an error). A team e-mail that does not exist still stops the run.
- Production run (22 nov): 12 letreros, 24 preguntas, 21 respuestas, 8 comentarios, 40 notificaciones, 9 pedidos de contacto, 8 votos de letrero, 4 calificaciones, 1 guardado, 1 oculto, 1 reporte, 23 fotos and 3 auth users. The second run printed «Nada que limpiar».
- 3 notifications already pointed at items deleted before the cleanup (question 33, answers 25 and 26, of 21 nov). They were not from this run; Diego asked to delete them too (ids 37, 38, 39).

## Decisions

| Decision | Chosen | Discarded | Why |
|---|---|---|---|
| Team accounts | Keep accounts, delete content | Delete whole accounts; pick post by post | The accounts are needed for the demo and the pilot; T38 asks for the content only |
| Users without profile | Delete the 3 test ones; never touch «Yay!» | Delete «Yay!» too; delete none | «Yay!» may be a real person or a judge |
| How it runs | Script with `--dry-run`, run by Claude after Diego's OK | SQL by hand in the Supabase panel | Preview of exactly what goes, re-runnable, recorded in the repo; same pattern as `stellar:reset` |
| Seed junk | Delete what is not in `content.ts` | Re-run the seed with `--fresh`; leave it | Keeps the seed's ids, dates and rewards; `--fresh` pays rewards again |
| Rewards | Keep as history | Delete the rows | Stellar payments cannot be undone; deleting rows would make Yo's list disagree with the balance |
| Photos | Delete with their item | Leave them in Storage | No orphan files, and no old link still opening a test photo |
| Where the e-mails live | `.env` (`CLEANUP_*`) | A constant in the script | The repo is public; personal e-mails stay out of it |
| Shared code | One `deleteContent` used by seed and cleanup | A second copy in the cleanup script | One place that knows the foreign-key order |

## Risks

- **Deleting real content by mistake.** Mitigated by explicit e-mail lists, the seed match, the safety checks and the mandatory dry-run reviewed by Diego before the real run.
- **Someone posts during the cleanup.** Only listed accounts and seed extras are touched; a new post by a team account between dry-run and run is deleted too (it is a test account by definition). Anyone else is never touched.
- **A failed delete in the middle.** Each step checks its error and stops; the run is re-runnable and finishes what is missing.
- **Restrictive foreign keys** (`answers`, `ratings`, `sign_votes`, `contact_requests` are `NO ACTION`). The helper deletes children first, in the order the seed already uses.
- **Time.** The deadline is 22 nov, 11:59. Steps 1–5 are the critical path; the wiki entry can follow.

## What is **not** in this spec

- New demo content or a bigger seed.
- Any change to the app's screens, rules or data adapter.
- Any change on Stellar.
