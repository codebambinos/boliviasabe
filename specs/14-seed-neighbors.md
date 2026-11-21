# SPEC 14 — Seed: 5 neighbors with Stellar accounts, letreros and questions

> **Status:** Implemented
> **Depends on:** SPEC 03 (tables, RLS, `photos` bucket), SPEC 08 (`provisionWallet`, welcome +5), SPEC 09 (`planReward`, `payReward`, `chargeUrgent`), SPEC 11 (photo paths, SQL reads), SPEC 13 (`reward_cap`, `rewards.source_id`, limits skip the service role). Board card: T09 (issue #3). T37 (`stellar:reset`, #26) will call it.
> **Date:** 2026-11-21
> **Objective:** One re-runnable script fills the real database with 5 neighbors who can sign in, each with a ready Stellar account, letreros made from Yaeko's photos, and questions with answers, ratings and comments, whose yapitas are really paid on testnet. Before that, it removes the `t39-*` test accounts and their content.

## Why this spec exists

Today Hoy and ¿Alguien sabe? in production show only test content: «Prueba T39…», «Prueba T23…» and the filler questions of the `t39-*` accounts. The demo, the video and the team's tests need a neighborhood that looks real. The wiki (#33) asks for neighbors who are **real users with a Stellar account**, so that every «Me sirvió» pays an account that exists. T37 needs a seed it can run again after a testnet reset.

## Scope

**In:**

- **`npm run seed`** (`scripts/seed/seed.ts`), server-side, with the service role from `.env`. It is idempotent:
  - Neighbors are matched by e-mail and content by author + text, so nothing is duplicated.
  - Each run completes what is missing: Stellar accounts, the welcome, pending rewards.
  - **`npm run seed -- --fresh`** first deletes the seed neighbors' content (not the neighbors) and creates it again.
- **Cleanup of the test data.** Every run first deletes the `t39-*@test.local` accounts (1 to 5) and everything they own: questions, answers, comments, ratings, votes, saved items, reports, hidden items, contact requests, notifications, rewards, wallet keys, photos in the bucket, the profile and the auth user. It follows the order recorded in T38 and checks each delete's error. The real team accounts are not touched.
- **The 5 neighbors of the mock** (`src/data/mock/fixtures.ts`), each one an auth user who signs in with e-mail and password:

  | Neighbor | E-mail | City | Zone |
  |---|---|---|---|
  | Lucía Mamani | `lucia@example.com` | Cochabamba | Cala Cala |
  | Jorge Rojas | `jorge@example.com` | Cochabamba | Sarco |
  | Ana Rivera | `ana@example.com` | Cochabamba | Queru Queru |
  | Marco Vargas | `marco@example.com` | Cochabamba | Centro |
  | Rosa Quispe | `rosa@example.com` | La Paz | Sopocachi |

  - **Password:** `SEED_PASSWORD`, read from `.env` only. It is never in the repo. `.env.example` gets the empty key.
  - **Profile** («Tu barrio» done) and the account through **`provisionWallet`**: Friendbot, trustline, the encrypted key and the welcome +5.
- **9 food letreros from Yaeko's photos** (`/Users/diego/boliviasabe-letreros`), copied into the repo under `scripts/seed/photos/`:
  - Each photo is resized to at most 1280 px, with a 480 px thumbnail, both JPEG. These are the sizes the app uploads.
  - They are uploaded to the `photos` bucket at `<profile_id>/<uuid>.jpg` and `-480.jpg`.
  - Title, price, zone and tags come from each poster:

  | Photo | Title | Price | Author | Zone | Tags |
  |---|---|---|---|---|---|
  | 1 | Combo trío: mondongo, chicharrón y fritanga | Bs 100 los 3 | Marco | Centro | Comida, Ofertas |
  | 2 | Jueves de comida cruceña, almuerzo completo | Bs 20 | Lucía | Cala Cala | Comida, Almuerzos |
  | 3 | Miércoles de pastas, menú del día | Bs 20 | Lucía | Cala Cala | Comida, Almuerzos |
  | 6 | K'jaras con entrega a domicilio | Bs 25 | Jorge | Sarco | Comida |
  | 7 | Silpancho, pique o charque con Coca | Desde Bs 32 | Ana | Queru Queru | Comida, Precios |
  | 8 | Menú de comida boliviana: caldo, chicharrón y más | Desde Bs 12 | Marco | Centro | Comida, Precios |
  | 9 | Comida criolla: pique macho, sajta y fritanga | Desde Bs 25 | Jorge | Sarco | Comida |
  | 14 | Trancapecho a Bs 15 | Bs 15 | Ana | Queru Queru | Comida, Ofertas |
  | 15 | Almuerzo cubano-boliviano con refresco | Bs 20 | Marco | Centro | Comida, Almuerzos |

  - Photos 4, 5, 10, 11, 12 and 13 are left out: Google Lens icon, cropped, generic, or prices in pesos and reales, or not in Spanish.
  - The letreros are spread over the last 2 days (`created_at`), all in Cochabamba.
  - The exact tags are checked against the 18 of the catalog in step 3.
- **The 14 questions of the mock** (same texts, authors, zones, tags and states), with their answers. «Me sirvió» and «No me sirvió» are given by the asker, and the mock's states are kept:
  - Jorge's pharmacy question is **urgent**: it is charged −5 with `chargeUrgent` and then marked urgent for 24 h.
  - The solved questions are solved through a helpful rating.
  - The closed question is closed through «Ninguna me sirvió».
  - The rest stay open. The two with no answers stay without answers.
  - `created_at` is spread over the last 3 days, and the urgent one is the newest.
- **«Me sirvió» on letreros** from the other neighbors (2 or 3 per letrero), so the counters and the `sirvio-l` rewards exist.
- **A few comments (3 to 5)** under the most visible answers, so the threads of T22 show up in the demo.
- **Rewards paid for real.** For each saved action the script calls `planReward` with the real `supabaseRewardFacts`, then `payReward`, which is the same path as `/api/stellar/premiar`:
  - letrero +1, `sirvio-l` +1, `ayuda` +5, `cierre` +1.
  - The SPEC 13 caps apply as in the app: a capped reward is not paid.
  - The script prints a summary: neighbors, letreros, questions, rewards confirmed, pending and capped, and the final balance of each neighbor.
- **Wiki first** (step 1):
  - The seed decisions go to `huecos-cerrados.md` and `log.md`: food letreros only, Yaeko's photos, neighbors with a password, cleanup of `t39-*`.
  - `tecnico.md` gets the command.
- **README:** one line on `npm run seed` and `SEED_PASSWORD`.

**Out of scope:**

- **Letreros that are not food** (services, rentals, transport). There are no photos for them; they can be added when Yaeko sends more.
- **Changing the mock adapter's fixtures.** Mock mode keeps its 35 placeholder letreros; only the real database gets the photo letreros.
- **`stellar:reset`** (T37). It will reuse this script, but the reset of issuer and distributor is T37's.
- **Notifications** created by the seed. The triggers of 0003 create them as they would for real; nothing else is added (T24).
- **Contact requests** in the seed.
- **Removing content of the real team accounts.** The questions Diego and others posted with their own Gmail stay.

## Data model

No migration. The script writes the existing tables through the service role:

- `profiles`, `wallet_keys`, `signs`, `sign_votes`, `questions`, `answers`, `ratings`, `answer_comments`, `rewards`.
- The `photos` bucket.

The SPEC 13 triggers do not limit the service role.

```ts
// scripts/seed/content.ts — the data, separate from the logic
type SeedNeighbor = { key: 'lucia' | 'jorge' | 'ana' | 'marco' | 'rosa'; email: string; fullName: string; city: City; zone: string };
type SeedSign = { photo: string /* file in scripts/seed/photos */; title: string; price: string | null; author: SeedNeighbor['key']; zone: string; tags: Tag[]; hoursAgo: number; helpfulFrom: SeedNeighbor['key'][] };
type SeedQuestion = {
  author: SeedNeighbor['key']; text: string; city: City; zone: string; tags: Tag[]; hoursAgo: number;
  urgent?: boolean; outcome: 'open' | 'solved' | 'closed';
  answers: { author: SeedNeighbor['key']; text: string; rating?: 'helpful' | 'not_helpful'; comments?: { author: SeedNeighbor['key']; text: string }[] }[];
};
```

Files:

- `scripts/seed/seed.ts`: the logic.
- `scripts/seed/content.ts`: the data.
- `scripts/seed/photos/{1,2,3,6,7,8,9,14,15}.jpg` and `…-480.jpg`.
- `package.json` › `"seed": "node --env-file-if-exists=.env scripts/seed/seed.ts"`.
- `.env.example` › `SEED_PASSWORD=`.

## Implementation plan

Branch `feat/t09-seed`, one commit per step.

1. **Wiki.** Record the seed decisions in `huecos-cerrados.md` and `log.md`, and the command in `tecnico.md`. The password is not written there.
2. **Photos.** Copy the 9 chosen photos, resize them to at most 1280 px and make the 480 px thumbnails (once, with `sips`). Commit them under `scripts/seed/photos/`.
3. **Content.** Write `scripts/seed/content.ts` with the neighbors, the 9 letreros (tags checked against the catalog), the 14 questions with their answers, the ratings, the outcomes and the comments.
4. **Script.**
   - **Steps of `seed.ts`:**
     1. Cleanup of `t39-*`.
     2. Neighbors: auth user, profile and `provisionWallet`.
     3. Letreros: upload and insert.
     4. Votes.
     5. Questions and answers.
     6. Ratings and outcomes: the urgent charge, closing.
     7. Comments.
     8. Rewards through `planReward` and `payReward`.
     9. Summary.
   - **Flags:** `--fresh`, and `--dry-run`, which prints what it would do without writing anything.
   - **Local test:** run it against the local stack (`supabase start`) twice, plus once with `--fresh`: no duplicates, the same counts, and the Stellar rewards confirmed on testnet.
5. **Production run** (needs the user's OK).
   - `npm run seed` against the remote project.
   - Check Hoy, ¿Alguien sabe? and Yo in production with a neighbor's sign-in.
   - Run it once more to prove it does not duplicate.
6. **Pass and PR.**
   - The README line.
   - `git grep` shows no secrets.
   - typecheck and build pass.
   - PR with `Closes #3`.

## Acceptance criteria

- [x] No `t39-*@test.local` user and none of their content (letreros, questions, answers, comments, rewards, photos) remain in the remote project. The team's own accounts and content are untouched.
- [x] 5 neighbors exist. Each one signs in on the app with their e-mail and `SEED_PASSWORD`, lands on Hoy without «Tu barrio», and Yo shows their name, zone, a ready Stellar account and a balance read from Horizon.
- [x] Hoy in Cochabamba opens with the 9 photo letreros, each with its photo, thumbnail, price and «Me sirvió» counter.
- [x] ¿Alguien sabe? in Cochabamba opens with the urgent question on top, then the open questions, then the solved and closed ones. La Paz shows Rosa's 2 questions.
- [x] Every paid reward has a `confirmed` row and a transaction on testnet whose memo matches the table of the wiki. Every «Me sirvió» paid an account that exists.
- [x] The urgent question was charged −5 (`urgente:<id>` confirmed) and shows as urgent.
- [x] Running `npm run seed` a second time creates no new rows and pays nothing new. `--fresh` recreates the content with new ids and pays only the rewards whose memos are new.
- [x] `SEED_PASSWORD` and the service role key appear nowhere in the repo (`git grep`). The script stops with a clear message if either is missing.
- [x] `npm run typecheck` and `npm run build` pass. The seed screens were checked on a phone at 360 px, light and dark.

> Verified on 2026-11-21.
> - **Local stack:**
>   - First run: 38 rewards confirmed on testnet and the urgent question charged.
>   - Re-run: a fake `t39-1` was deleted with everything it owned, nothing was duplicated and nothing was paid twice.
>   - `--dry-run` wrote nothing.
>   - `--fresh` recreated the content; 12 rewards were capped by the pair rule of the same day, as in the app.
> - **Production (with the user's OK):**
>   - The `t39-1` to `t39-5` accounts are gone.
>   - 5 neighbors exist: Lucía 12, Jorge 34, Ana 18, Marco 16 and Rosa 5 yapitas.
>   - There are 9 photo letreros and 14 questions, and the urgent question was charged.
>   - A re-run paid nothing new, and Lucía signs in with `SEED_PASSWORD`.
>   - `jorge@example.com` had been created by hand by a teammate. Its test question #33 and answer #25 were deleted, and the seed now always sets the neighbor's name and zone.
> - **Diego, on a phone:**
>   - Hoy, ¿Alguien sabe? (Cochabamba and La Paz), the thread and Lucía's Yo (12 yapitas) work.
>   - A «Me sirvió» from Lucía to Jorge paid +1.
>   - The screens look right at 360 px, in light and dark.

## Changes after the phone test

- **Photos load smoothly (wiki #194, #196).** Tiles and question photos pulse while they load and fade in. In the letrero detail, a pulsing frame with the photo's final size is shown, then the photo fades in. The first try showed the thumbnail blurred, which looked like a halo, so it was replaced.
- **The balance never shows the previous account's number (wiki #195).** It was a bug: signing in and out kept one person's cached wallet. Now everything personal (balance, movements, activity, saved, phone) is reset on a session change. While the balance loads, a small pulsing bar is shown.
- Movimientos in Yo shows the 5 latest movements for now; the full paged list is T21.

## Decisions

- **Yes:** the content of the mock: the same 5 neighbors and 14 questions (the user's choice). Both modes look alike, and the texts were already reviewed. **No:** new content written for the video.
- **Yes:** Yaeko's photos, food letreros only, 9 of the 15 (the user's choice).
  - **No:** services with free photos (licenses, time).
  - **No:** waiting for more photos.
  - Discarded: photo 4 (Lens icon, old date), 5 (cropped, Lens), 10 (generic), 11 (pesos), 12 (reales, Portuguese), 13 (English, a screenshot).
- **Yes:** the posters are used as they are, with the business names and phones (the user's choice). It is what a neighbor would really post.
- **Yes:** the neighbors sign in with e-mail and a password kept in `.env` (the user's choice), for the two-phone demo. **No:** content-only accounts.
- **Yes:** the seed deletes the `t39-*` accounts and their content (the user's choice). T38 only checks that nothing is left.
- **Yes:** real payments on testnet through `planReward` + `payReward` (the user's choice), with the same caps as the app. **No:** rows without Stellar (empty balances and Movimientos).
- **Yes:** idempotent, plus `--fresh` (the user's choice), so T37 can call it after a reset. **No:** always from scratch (new Stellar accounts every time).
- **Yes (proposed):** e-mails at `example.com`, as in the mock. It is a reserved domain, so no real inbox exists. Creating the user with `email_confirm: true` sends nothing.
- **Yes (proposed):** the thumbnails are made once and committed, not at run time. This avoids an image library (`sharp`) just for the seed.
- **Yes (proposed):** 3 to 5 comments, so the threads appear in the demo. The mock has none, so they are new copy, short and in the tone of the answers.

## Risks

| Risk | Mitigation |
|---|---|
| Friendbot or Horizon fails during the run | `provisionWallet` and `payReward` leave the account in `error` and the reward `pending`. Running the seed again finishes them. The summary lists what stayed pending. |
| The cleanup deletes real team content | It selects users only by the `t39-*@test.local` e-mails and prints what it will delete. `--dry-run` shows it first, and the production run waits for the user's OK. |
| A delete fails silently and leaves the auth user behind (seen in earlier cleanups) | Every delete checks its error and the script stops at the first failure. Re-running continues from where it stopped. |
| The paid yapitas drain the distributor | About 40 to 50 yapitas in total, far under the distributor's balance. The summary prints it. |
| The photos are low resolution (8 and 9 are about 400 px wide) | They are only uploaded as they are, never enlarged. The detail view shows them at their size. |
| Re-running after `--fresh` hits the unique memos of the old content | New ids give new memos. Old reward rows stay, as they would for deleted content in the app. |
