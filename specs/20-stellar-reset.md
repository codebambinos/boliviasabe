# SPEC 20 — `stellar:reset` after a testnet wipe

> **Status:** Implemented
> **Depends on:** SPEC 08 (custodied accounts: `wallet_keys`, `profiles.stellar_pk` / `stellar_status`, `provisionWallet`), SPEC 09 (`rewards` with one memo per movement, `payPoints`), SPEC 14 (the seed, used to build the local test). Board card: T37 (issue #26).
> **Date:** 2026-11-21
> **Objective:** One command, `npm run stellar:reset`, brings YAPITA back after Stellar wipes testnet: the same issuer, distributor and neighbor addresses, and the whole history of confirmed yapitas paid again, so balances and every «Ver registro» match the database.

## Why this spec exists

- Stellar wipes testnet every few months (wiki `stellar-final` › Reinicio de testnet, `stack.md` › 3.3).
- After a wipe, the database still has everything: the encrypted keys in `wallet_keys`, the addresses in `profiles.stellar_pk`, and the 94 confirmed rows of `rewards` with their `tx_hash`.
- But on the network nothing exists anymore: not the issuer, not the distributor, not the neighbors' accounts. Balances read 0 and every «Ver registro» opens a missing transaction.
- `npm run stellar:setup` only works on an empty `.env` and knows nothing about the profiles.
- If this happens on the day of the demo, we need minutes, not a night.

## Scope

**In:**

- **`scripts/stellar/reset.ts` and `npm run stellar:reset`.** It runs with the service role from `.env`, like the seed. It runs in three stages, and each stage skips what is already done, so running it again after a cut finishes the job.
  1. **Issuer and distributor.**
     - **After a real wipe (default):** if `YAPITA_ISSUER_PUBLIC` does not exist on testnet, it is recreated **with the same keys** of the env file (`YAPITA_ISSUER_SECRET`, `YAPITA_DISTRIBUTOR_SECRET`). Friendbot can fund any address. Nothing changes in the env file or in Vercel, and no redeploy is needed (decision of Diego during step 1, wiki #211).
     - **With `--force` (the local test):** it creates a **new** issuer and distributor. Then it **rewrites** the five lines of the env file: `YAPITA_ISSUER_SECRET`, `YAPITA_DISTRIBUTOR_SECRET`, `YAPITA_ISSUER_PUBLIC`, `YAPITA_DISTRIBUTOR_PUBLIC` and `VITE_YAPITA_ISSUER_PUBLIC`. Before that, it copies the file to `<env file>.before-reset-<timestamp>`, which git ignores (`.env.*`). The new keys are written before anything is funded, so a cut never loses them.
     - In both cases it funds what is missing, adds the distributor's trustline and issues `1000000` YAPITA if the distributor has none, like `setup.ts`.
     - If the issuer exists and there is no `--force`, it keeps it.
  2. **Neighbors' accounts, same address.**
     - For every profile with a row in `wallet_keys`, it decrypts the key with `WALLET_ENC_KEY`.
     - It recreates the account with Friendbot if it does not exist and adds the trustline to the current issuer if missing.
     - It sets `stellar_status = 'ready'` and checks that `stellar_pk` matches the key.
     - `wallet_keys` and `stellar_pk` do not change.
  3. **Replay of the history.**
     - Every `rewards` row with `status = 'confirmed'`, in order of `created_at, id`, is paid again on the current network with its amount. Its memo is the `memo_key`, except for the welcome, which uses the memo `bienvenida` as `provisionWallet` does.
       - Positive amounts go from the distributor to the neighbor.
       - Negative amounts (urgent −5) go from the neighbor to the distributor, signed with their decrypted key.
     - The new hash is saved in `tx_hash`.
     - A row counts as replayed when its `tx_hash` is a payment of YAPITA **of the current issuer**. That one Horizon check makes the stage resumable. It also works in the local test, where the old transactions still exist under the old issuer.
     - Rows in `pending` or `error` are not touched: the normal retry (`/api/stellar/reintentar`) handles them.
- **Flags.**
  - `--dry-run` reads everything and prints what each stage would do (issuer missing or not, how many accounts to recreate, how many rows to replay), writing nothing.
  - `--force` creates a new issuer even if the current one exists. It is used for the local test.
  - `--env-file <path>` picks which env file to read and rewrite (default `.env`). The local test uses its own copy, so the real `.env` is never touched.
- **Output.**
  - One line per stage, with the counts.
  - At the end:
    - the explorer links of the issuer and distributor;
    - the balance of each neighbor, read from the chain, next to their balance in the database (sum of confirmed `rewards`);
    - only when the issuer changed (`--force`): the exact commands to update Vercel (`vercel env rm` + `vercel env add` for the three variables, reading each value from the env file with `grep … | cut … |`, never printed) and the production redeploy.
  - It never prints a secret.
- **Docs.**
  - `README.md` › Stellar: when and how to run `stellar:reset`, then `stellar:e2e`, and that only `--force` needs the printed Vercel commands.
  - `stellar-final.md` and `tecnico.md` in the wiki: what the reset keeps (same addresses, same history) and what changes (issuer, distributor, transaction hashes).
  - Wiki case #211, `log.md` and the `index.md` count.
  - Issue #26: same wording.

**Out:**

- Updating Vercel automatically (`--vercel`). It is production, so a person runs the printed commands, with permission.
- Running the reset on production as part of this task. Production only runs it if testnet is really wiped, or if Diego decides to before recording. Either way it needs his permission, because it recreates accounts and rewrites `rewards.tx_hash`.
- New keys for the neighbors (`wallet_keys` stays).
- Replaying `pending` or `error` rewards, or rewards over a cap.
- Watching for testnet wipes, or detecting them from the app.
- Changing any screen. The app reads the issuer from `VITE_YAPITA_ISSUER_PUBLIC`, so it needs only the redeploy.
- Recreating the seed's content (letreros, questions). The database is not wiped, only the network.

## Data model

No new tables, columns or migrations. The script writes:

| Where | What |
|---|---|
| The env file (default `.env`) | The 5 `YAPITA_*` / `VITE_YAPITA_ISSUER_PUBLIC` lines, replaced in place, only when a new issuer is created. Backup in `<file>.before-reset-<timestamp>`. |
| `profiles.stellar_status` | `'ready'` for every profile whose account was recreated with its trustline. |
| `rewards.tx_hash` | The new hash of every replayed row. `status` stays `'confirmed'`. |

```ts
// scripts/stellar/reset.ts (outline)
type Args = { dryRun: boolean; force: boolean; envFile: string };
async function ensureIssuer(args): Promise<{ issuer: Keypair; distributor: Keypair; created: boolean }>;
async function restoreAccounts(db, env): Promise<{ recreated: number; trustlines: number; total: number }>;
async function replayRewards(db, env): Promise<{ replayed: number; alreadyDone: number; total: number }>;
function vercelSteps(envFile: string): string[]; // commands only, values read from the file at run time
```

Reused, not rewritten: `fundWithFriendbot`, `accountExists`, `addTrustline`, `hasTrustline`, `payPoints`, `pointsBalance`, `server` (`lib/stellar/points.ts`), `decryptSecret` (`lib/stellar/wallet.ts`), `adminClient` (`lib/supabase/server.ts`).

## Implementation plan

1. **Wiki and board.** Add #211, update `stellar-final.md`, `tecnico.md`, `log.md` and the `index.md` count in `boliviasabe-docs`, then push. Rewrite the body of issue #26.
2. **Stage 1 + flags.**
   - `reset.ts` with `--dry-run`, `--force`, `--env-file`, `ensureIssuer`, the in-place rewrite of the env file with its backup, and the `stellar:reset` script in `package.json`.
   - `npm run stellar:reset -- --dry-run` against production only reads, and must say «issuer exists, nothing to create».
3. **Stage 2.** `restoreAccounts`. Typecheck passes.
4. **Stage 3.** `replayRewards` with the «already replayed» check, then the final report and the Vercel commands.
5. **Local test.**
   - `npx supabase start` + `db reset`.
   - A copy of `.env` in `.env.reset-test` pointing at the local stack (local URL and service key; same Stellar and wallet keys).
   - `npm run seed` against it, so the 5 neighbors get testnet accounts and their history is paid.
   - Write down the balances.
   - Then `node --env-file=.env.reset-test scripts/stellar/reset.ts --force --env-file .env.reset-test`.
   - Check the criteria, run it again, run `stellar:e2e` with that file, then stop the stack and delete the copy.
6. **Docs.** Add the `README.md` › Stellar section. Open the PR (`Closes #26`).

## Acceptance criteria

**Local test (local Supabase + testnet, `.env.reset-test`):**

- [ ] Before the reset, the 5 seed neighbors have balances on testnet equal to the sum of their confirmed `rewards`.
- [ ] `--dry-run` writes nothing: same env file, same `rewards.tx_hash`, and it prints the counts of the three stages.
- [ ] After `--force`:
  - `.env.reset-test` has a new `YAPITA_ISSUER_PUBLIC` (equal to `VITE_YAPITA_ISSUER_PUBLIC`) and a new distributor;
  - the backup `.env.reset-test.before-reset-*` exists;
  - the real `.env` did not change.
- [ ] Every neighbor keeps its `stellar_pk`, and has a trustline to the new issuer and `stellar_status = 'ready'`.
- [ ] For every neighbor, the balance under the new issuer equals the sum of its confirmed `rewards`. The urgent −5 is included.
- [ ] Every confirmed `rewards.tx_hash` is now a YAPITA payment of the new issuer, with the row's memo (`bienvenida` for the welcome).
- [ ] Running the reset again without `--force` creates no issuer, recreates no account, replays 0 rows, and says so.
- [ ] Cutting the run in the middle of stage 3 (Ctrl+C) and running it again finishes the rest without paying any row twice: the balances still match.
- [ ] `stellar:e2e` with `.env.reset-test` passes against the new issuer.
- [ ] The output shows no secret, and the Vercel commands read each value from the file (`grep '^NAME=' <file> | cut -d= -f2- | vercel env add …`).

**Production (read only):**

- [ ] `npm run stellar:reset -- --dry-run` on the real `.env` says the issuer exists, 0 accounts to recreate and 0 rows to replay. Nothing is written.

**Code:**

- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] `git grep -i "SECRET\|SERVICE_ROLE"` shows no values. `.env.reset-test` and the backups are ignored by git.
- [ ] The wiki (#211, `stellar-final`, `tecnico`, log, index), the README and issue #26 describe the same steps.

## Decisions taken and discarded

| Decision | Discarded | Why |
|---|---|---|
| Same address for every neighbor (reuse `wallet_keys`) | New keys per profile | Nothing in the database or on screen changes, and the key never leaves the encrypted table. Friendbot recreates any address. |
| Replay every confirmed reward, in order, with its memo | One «restore» payment per neighbor; starting from zero | Balances match the database, and every «Ver registro» in Movimientos opens a real transaction with the right memo. The order makes sure there is balance before each −5. |
| «Already replayed» = the hash is a payment of the current issuer | A new column; resetting rows to `pending` | No migration. Resumable. Works in the local test, where old hashes still exist. `pending` would mix with the normal retry flow. |
| The script prints the Vercel commands; a person runs them | `--vercel` updating Vercel and redeploying | It is production. One copy-paste is cheap, and the permission stays explicit. |
| After a real wipe, recreate the issuer and distributor with the same keys | A new issuer on every reset (the first version of this spec) | The issuer address never changes, so Vercel, the bundle and installed apps keep working with no redeploy. Only `--force` makes a new one. |
| Rewrite the env file in place with a backup (`--force` only) | Append like `setup.ts`; only print the new keys | A second line of the same name would be ambiguous. The backup keeps the old keys in case of a mistake. |
| Test on local Supabase + testnet with `--force` and `--env-file` | Run it on production now; only `--dry-run` | Proves the whole path with real Stellar transactions, without touching the issuer, Vercel or `rewards` of production hours before the deadline. |
| `pending` / `error` rows left alone | Paying them in the replay | They were never paid. The normal retry already handles them, and paying here could break a cap. |

## Identified risks

- **Friendbot is slow or rate-limited right after a wipe.** `fundWithFriendbot` already retries three times. Stage 2 is resumable, so you run it again.
- **The distributor's sequence number on ~94 payments in a row.** The payments go one after another (no parallelism), and each failure is retried by the next run, which skips what is already replayed.
- **Horizon is slow.** About 94 payments plus one check each take several minutes. The script prints its progress every 10 rows.
- **A `--force` run on production by mistake** would change the issuer, and then the Vercel variables and the redeploy are needed or the app shows 0. Only the local test uses `--force`, and the printed steps and the README say it. The final check is the balance in Yo on production.
- **The local test cannot wipe testnet,** so the same-keys path (default) is only exercised up to «issuer exists, nothing to create». It reuses the same fund / trustline / issue code as `--force`, and only the keys differ.
- **The local test spends testnet XLM and YAPITA from Friendbot only.** No real money (testnet).
