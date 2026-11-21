# SPEC 08 — «Tu barrio» and the Stellar account

> **Status:** Approved
> **Depends on:** SPEC 01 (data layer and mock adapter), SPEC 03 (Supabase schema and RLS), SPEC 06 (upload a letrero), SPEC 07 (account and `AuthGate`). Board card: T16 (issue #9). Unlocks T17 (#10).
> **Date:** 2026-11-21
> **Objective:** After the first sign-in, one full-screen form («Tu barrio») creates the profile, and the server creates the person's Stellar testnet account and pays the +5 welcome in the background, so the person sees «Preparando tu cuenta», then the balance 5, and goes back to what they were doing.

## Why this spec exists

SPEC 07 left three loose ends for T16: `supabaseAuth.saveProfile` rejects with `server`, no screen asks for name, city and zone, and nobody creates the Stellar account. A person who signs in today has `profile: null`, every action stays blocked, and SPEC 06 shows the data layer's error when they try to publish. The wiki already fixes the flow (`flujo-final.md › 0 · Entrada y cuenta`, `stellar-final.md`, `tecnico.md`, `huecos-cerrados.md` #49 and #111); this spec fixes the technical shape.

It is also the first Vercel function of the project and the first place where a secret key (`WALLET_ENC_KEY`) and the service role are used, so it sets the pattern T17 will follow: a thin function in `api/`, the logic in `lib/`, the storage behind an interface.

## Scope

**In:**

- **«Tu barrio» sheet** (`src/components/TuBarrioSheet.tsx`, `tu-barrio-sheet.css`), a full-screen `Sheet` (`variant="page"`) opened by `AuthGate`:
  - **Nombre y apellido**, prefilled with `session.suggestedName` (the name Google already knows).
  - **Ciudad**, one of the 10 of `CITIES`, Cochabamba by default.
  - **Zona**, one field: tapping a suggested zone chip of the chosen city (`SUGGESTED_ZONES`) fills it, and typing a different one is allowed. Cities with no suggestions show only the field. Changing the city clears the zone only if it came from a chip.
  - **Listo** (disabled with the reason below it while the name or the zone is missing). On success the sheet closes and the pending action runs.
  - Closing it (✕, Escape, Android back) keeps the session; the next `requireAccount` opens it again (wiki #111).
- **`AuthGate`**: `requireAccount` opens «Tu barrio» when the person is signed in with `profile === null`, both on a normal tap and after returning from Google or the e-mail sheet, and runs the original action once the profile exists.
- **`POST /api/stellar/crear-cuenta`** (`api/stellar/crear-cuenta.ts`), a Vercel function with the web-standard handler (no `@vercel/node`). It checks the `Authorization: Bearer <Supabase access token>` with the service role, finds the caller's `profiles` row and runs `provisionWallet`. Answers `200 {status:'ready'}`, `202 {status:'preparing'}` when Stellar failed, `401`, `409 {error:'profile_missing'}` or `500`.
- **`provisionWallet`** (`lib/stellar/wallet.ts`), idempotent, so the same endpoint is also the retry:
  1. Generate the keypair and store it **encrypted with AES-256-GCM** (`WALLET_ENC_KEY`, 32 bytes in base64, IV stored apart) in `wallet_keys` **before** touching the network. If a parallel call stored one first, that one wins.
  2. Save `stellar_pk` in the profile.
  3. Friendbot if the account does not exist; `changeTrust` for `YAPITA` if the trustline is missing.
  4. Insert the reward with `memo_key` `bienvenida:<profileId>` (+5, unique key), look in the account's incoming payments for the memo `bienvenida`, pay from the distributor only if it is not there, and mark the reward `confirmed` with the hash.
  5. `stellar_status = 'ready'`. On any Stellar failure: `'error'`, the reward stays `pending`, and the next call continues from the failed step.
- **`WalletStore`** (interface in `lib/stellar/wallet.ts`) with two implementations: Supabase with the service role (`lib/supabase/server.ts`, server only) and in memory (used by `npm run stellar:e2e`, which now creates its user through `provisionWallet` and calls it twice to prove the welcome is paid once).
- **Supabase `saveProfile`** (`src/data/supabase/auth.ts`): validates, inserts the `profiles` row the first time and updates it after (RLS, the person writes their own row), computes `display_name`, and calls `ensureWallet()` **without awaiting it**, so «Listo» never waits for Friendbot. `readSession` returns `suggestedName` while the profile is pending.
- **Supabase `wallet.get`** (`src/data/supabase/wallet.ts`): status and address from the profile, balance from Horizon with `fetch` (the browser never imports the Stellar SDK). While the status is not `ready` it calls `ensureWallet()` again (deduplicated, 20 s cooldown), which also covers a tab closed halfway. `source.ts` uses it with `VITE_DATA_SOURCE=supabase`; Movimientos stay on the mock.
- **Mock parity**: `followRealSession` (the SPEC 07 bridge) uses the real profile's name, city and zone once it exists, instead of the made-up ones.
- **Setup**: `.env.example` documents `WALLET_ENC_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and the public `VITE_YAPITA_ISSUER_PUBLIC`; the Vite dev server proxies `/api` to `vercel dev`.
- **Wiki**: the copy of «Tu barrio» and the memo decision are recorded in `huecos-cerrados.md` and `log.md` before the PR is opened.

**Out of scope (for future specs):**

- `/api/stellar/premiar` and `/gastar`, Movimientos read from the chain, and the «Reintentar» button (T17).
- «Mi cuenta de prueba» and the full Yo tab (T21).
- The seed users' accounts (T09) and `stellar:reset` (T37). Both will call `provisionWallet`.
- Editing the profile after the first time (name, city, zone from Ajustes, T29). `saveProfile` already supports the update, but no screen uses it here.
- Phone number, «share», interests and any other profile field.
- Moving letreros, questions or movements to Supabase.

## Data model

No new tables or migrations: it uses `profiles`, `wallet_keys` and `rewards` from SPEC 03. `profiles.stellar_pk` and `stellar_status` are written only by the service role and read by the owner.

`src/data/types.ts`: the signed-in session gains an optional field.

```ts
type Session =
  | { status: 'guest' }
  | { status: 'signed-in'; userId: Id; email: string; profile: Profile | null; suggestedName?: string };
// suggestedName: Google's full_name or name, only while profile === null
```

`lib/stellar/wallet.ts` (server only):

```ts
type EncryptedSecret = { secretEnc: string; secretIv: string }; // base64; the 16-byte auth tag ends secretEnc

interface WalletStore {
  profileExists(profileId: number): Promise<boolean>;
  getKey(profileId: number): Promise<EncryptedSecret | null>;
  saveKey(profileId: number, key: EncryptedSecret): Promise<EncryptedSecret>; // first key wins
  setStellar(profileId: number, patch: { publicKey?: string; status?: 'preparing' | 'ready' | 'error' }): Promise<void>;
  ensureReward(r: { profileId: number; memoKey: string; amount: number; reason: 'bienvenida' }): Promise<{ id: number; status: 'pending' | 'confirmed' | 'error'; txHash: string | null }>;
  settleReward(id: number, patch: { status: 'confirmed' | 'error'; txHash?: string }): Promise<void>;
}
```

Welcome reward: `rewards.memo_key = 'bienvenida:<profileId>'` (unique, at most 28 bytes), `amount = 5`, `reason = 'bienvenida'`. The Stellar memo of the payment is `bienvenida`, as in `reglas-finales.md`.

HTTP contract of `POST /api/stellar/crear-cuenta`: no body, `Authorization: Bearer <access token>`; responses `200 {"status":"ready"}`, `202 {"status":"preparing"}`, `401 {"error":"unauthenticated"}`, `409 {"error":"profile_missing"}`, `500 {"error":"server"}`. All with `Cache-Control: no-store`.

Display name: first word of the full name plus the initial of the last word, «Lucía Mamani Rojas» → «Lucía M.». A single word stays as it is. It must fit `profiles.display_name` (2 to 40 characters).

Environment (server only unless noted): `SUPABASE_SERVICE_ROLE_KEY`, `WALLET_ENC_KEY`, `YAPITA_ISSUER_PUBLIC`, `YAPITA_DISTRIBUTOR_SECRET`, `VITE_SUPABASE_URL`. Public, in the bundle: `VITE_YAPITA_ISSUER_PUBLIC` (optional; the balance is filtered by asset code alone when it is missing).

## Implementation plan

1. Write the spec's wiki records first: add the «Tu barrio» copy (title, field labels, button, validation messages) and the welcome memo decision to `wiki/huecos-cerrados.md` and `wiki/log.md`. Manual test: the wiki repo has the new rows, and the copy used below is the copy written there.
2. Create `lib/stellar/wallet.ts` (`encryptSecret`, `decryptSecret`, `provisionWallet`, `WalletStore`) and switch `scripts/stellar/e2e.ts` to create its user through it with an in-memory store, calling it twice. Manual test: `npm run stellar:e2e` ends with balance 5 and exactly one `bienvenida` payment.
3. Create `lib/supabase/server.ts` (service-role client, `userFromRequest`, `supabaseWalletStore`) and `api/stellar/crear-cuenta.ts`. Manual test: `npm run typecheck` passes; with `vercel dev`, a call with no token returns 401 and a call with a forged token returns 401.
4. Data layer: `suggestedName` in `Session` and `readSession`, the real `saveProfile`, `src/data/supabase/wallet.ts` with `ensureWallet` and `get`, the `lazyWallet` in `source.ts`, the `followRealSession` change, `.env.example` and the `/api` proxy in `vite.config.ts`. Manual test: with `VITE_DATA_SOURCE=mock` nothing changes, and `git grep "stellar-sdk" src` finds nothing.
5. Build `TuBarrioSheet.tsx` and wire it in `AuthGate.tsx` (open on a signed-in session with `profile === null`, after Google, after e-mail, run the action when it closes with a profile). Manual test on the mock at 360 px, light and dark, text at 130 %: a new e-mail → tap «Guardar» on a letrero → «Tu barrio» → «Listo» → the action runs and the header shows «★ …» then 5; closing the sheet and tapping again reopens it.
6. Load `SUPABASE_SERVICE_ROLE_KEY` and `WALLET_ENC_KEY` in Vercel, open the PR (`Closes #9`) and test on its preview URL with `VITE_DATA_SOURCE=supabase` from a real phone: new account → «Tu barrio» → balance 5 → `wallet_keys` holds one row of cipher text. Then break Stellar on purpose (a wrong `YAPITA_ISSUER_PUBLIC` in the preview only) and check the profile exists, the reward is `pending` and the wallet keeps saying «Preparando…».

## Acceptance criteria

- [ ] `npm run stellar:e2e` passes: the welcome is paid once even when `provisionWallet` runs twice, the stored key decrypts to the same account, and the final balance is 5.
- [ ] With `VITE_DATA_SOURCE=supabase`, an account with no profile sees «Tu barrio» on its first action, and after «Listo» that action runs on its own (also after Google).
- [ ] «Listo» stays disabled while the name or the zone is empty and says which one is missing; the name is prefilled when Google provides it.
- [ ] Tapping a zone chip fills the field, typing another zone is accepted, and changing the city clears a zone that came from a chip but keeps a typed one.
- [ ] Closing «Tu barrio» with ✕, Escape or Android back keeps the session, publishes nothing, and the next action opens it again.
- [ ] After «Listo» the wallet shows «Preparando tu cuenta» and then the balance 5, read from Horizon.
- [ ] Calling `/api/stellar/crear-cuenta` twice leaves one `bienvenida` payment on the chain and one `confirmed` row in `rewards`.
- [ ] If Stellar fails, the profile exists, the reward stays `pending`, `stellar_status` is `error`, and the next `wallet.get` after the cooldown retries and finishes it.
- [ ] A call with no token or a forged token gets 401; a call with a valid token and no profile gets 409.
- [ ] `wallet_keys` holds only cipher text and IV for the new account, and decrypting needs `WALLET_ENC_KEY`.
- [ ] `git grep -i "SECRET\|SERVICE_ROLE" -- src` shows no values, and the built bundle contains neither the service role key nor `WALLET_ENC_KEY`.
- [ ] No file under `src/` imports `@stellar/stellar-sdk`.
- [ ] The screen was tested at 360 px, in light and dark, with text at 130 %, and its copy matches the wiki (no «XLM», «tokens», «puntos» alone or bolivianos).
- [ ] `npm run typecheck` and `npm run build` pass, CI is green and the PR body has `Closes #9`.

## Decisions

- **Yes:** «Tu barrio» as a full-screen `Sheet`. It reuses the back, Escape and focus behavior of every overlay and lets `AuthGate` keep the pending action in memory.
- **No:** a `/tu-barrio` route. It would need its own history and pending-action handling for no gain.
- **No:** a bottom sheet. Three fields and the keyboard do not fit at 360 px.
- **Yes:** one zone field with chips of suggestions. It is the same one-tap choice as a list and still lets people type a zone that is not listed (wiki #89 compares them normalized).
- **No:** a `datalist` (looks different on iPhone and Android, cannot use the tokens) or a dropdown plus «Otra» (two steps to type a new zone).
- **Yes:** the client writes the profile with RLS, and only the Stellar part goes through the server. A Stellar failure can then never lose the profile (wiki: «un fallo de Stellar nunca bloquea»).
- **No:** one server call that creates profile and account together. «Listo» would wait several seconds for Friendbot and the profile would depend on the network.
- **Yes:** the key is stored before funding. A crash between funding and storing would leave a funded account nobody can sign for.
- **Yes:** the unique `memo_key` plus a look for the memo in the account's payments before paying. The table alone does not stop two simultaneous calls from both reading `pending` and paying.
- **Yes:** the Stellar memo stays `bienvenida`, as in the wiki table, and only `rewards.memo_key` carries the id (`bienvenida:<profileId>`). The memo is unique per account, so the lookup works. It breaks the «`memo_key` equals the memo» rule for this one reward, and T17 must not assume the rule for `bienvenida`.
- **No:** `bienvenida:<profileId>` as the chain memo. It would change the wiki table for no gain.
- **Yes:** the same endpoint is the retry. It is idempotent, so `saveProfile`, `wallet.get` and a future «Reintentar» all call it.
- **Yes:** a 20 s cooldown and one request in flight in `ensureWallet`. The wallet polls every second while it is `preparing`, and that must not become a request per second.
- **Yes:** the balance comes from Horizon with `fetch`, filtered by asset code (and by issuer when `VITE_YAPITA_ISSUER_PUBLIC` is set). It keeps the SDK out of the bundle (CLAUDE.md).
- **Yes:** the web-standard handler (`export async function POST(request: Request)`), so no `@vercel/node` dependency.
- **Yes:** the display name uses the last word of the full name for the initial. The wiki says «nombre + inicial del apellido» and the form asks for «nombre y apellido»; two surnames («Mamani Rojas») give «R.», accepted for the demo.
- **Yes:** end-to-end tests on the PR's Vercel preview, because the function only runs there with the real build. `vercel dev` is not needed.
- **Pending decision:** the wiki gives no copy for the «Tu barrio» labels or validation messages. This spec proposes the title «Tu barrio», the labels «Nombre y apellido», «Ciudad» and «Zona», the button «Listo», and the reasons «Falta tu nombre», «Falta tu zona» and «Falta tu nombre y tu zona»; Diego confirms them and they are recorded in the wiki in step 1.

## Risks

| Risk | Mitigation |
| --- | --- |
| `.ts` import extensions inside `api/` may not resolve in the Vercel build | Step 6 checks it on the first preview deploy; if it fails, the imports in `api/` and `lib/` switch to `.js` specifiers. |
| `SUPABASE_SERVICE_ROLE_KEY` or `WALLET_ENC_KEY` missing in Vercel | The function answers `500 server` and logs the variable name. The profile is already saved and the wallet keeps saying «Preparando…», so nothing blocks the person. |
| Friendbot rate limit or Horizon down | `fundWithFriendbot` retries three times with backoff; otherwise the status is `error` and the next `wallet.get` retries after the cooldown. |
| Two calls at once pay the welcome twice | Unique `memo_key` plus the chain lookup for the memo before paying; the e2e calls `provisionWallet` twice in a row. |
| Losing `WALLET_ENC_KEY` makes every custodied key unreadable | Testnet only. The key lives in Vercel and in Diego's `.env`; a testnet reset (`stellar:reset`, T37) recreates the accounts. |
| The column grants hide `stellar_pk` or `stellar_status` from the owner | Step 6 reads them as the signed-in person; if RLS or grants deny it, a new migration (`0005`) grants select on those two columns only. |
| Someone calls the endpoint for another person | The profile is found from the token's own `auth_id`; the function takes no id from the request. |

## What is **not** in this spec

- `premiar`, `gastar` and the rewards of letreros, answers and urgent questions (T17).
- Movimientos from the chain, «Mi cuenta de prueba» and the Yo tab (T21).
- Seed users and `stellar:reset` (T09, T37).
- Editing the profile later, phone, interests and «share».
- Any other part of the Supabase adapter.

Each one of those, if it lands, goes in its own spec or task.
