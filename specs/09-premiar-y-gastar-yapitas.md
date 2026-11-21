# SPEC 09 — Pay and charge yapitas (`/api/stellar/premiar` and `/gastar`)

> **Status:** Implemented
> **Depends on:** SPEC 03 (Supabase schema and RLS), SPEC 08 («Tu barrio» and the Stellar account: `provisionWallet`, `WalletStore`, `lib/supabase/server.ts`). Board card: T17 (issue #10). Unlocks T39 (#43), T20, T22, T23, T09.
> **Date:** 2026-11-21
> **Objective:** Two Vercel functions let a signed-in person trigger the yapitas that an action earns or costs, after the server checks in Supabase that the action is legitimate, and each one is paid or charged on Stellar exactly once, however many times the call is repeated (plus one cosmetic fix: the phone's main button folds to «+» smoothly).

## Why this spec exists

SPEC 08 paid the first reward (the +5 welcome) and set the pattern: a thin function in `api/`, the logic in `lib/`, the storage behind an interface, the unique `rewards.memo_key` as the idempotency key. Every other yapita in `reglas-finales.md › Yapitas` still has no code: +1 for a letrero, +1 for a «Me sirvió» on a letrero, +5 for a helpful answer, +1 for closing a question and −5 for an urgent one. T39 (the real Supabase adapter) and the screens built on it need these two endpoints to exist and to be safe, so this spec defines them before any of those screens writes to the real database.

Letreros, questions, answers and votes are not in Supabase yet (T39). The functions read those tables anyway, and the tests create the rows with the service role.

## Scope

**In:**

- **`POST /api/stellar/premiar`** (`api/stellar/premiar.ts`), web-standard handler, header `Authorization: Bearer <Supabase access token>`, JSON body `{ "reason": "letrero" | "sirvio-l" | "ayuda" | "cierre", "refId": <number> }`. The client never sends an amount, a memo or a recipient: the server derives them from the row and from the rules table.

  | `reason` | `refId` | Legitimate when (checked in Supabase) | Who gets it | Amount | `rewards.memo_key` = Stellar memo |
  |---|---|---|---|---|---|
  | `letrero` | `signs.id` | The caller is `signs.author_id` | The caller | +1 | `letrero:<signId>` |
  | `sirvio-l` | `signs.id` | The caller has a `sign_votes` row for it with `helpful = true`, and is not the author | `signs.author_id` | +1 | `sirvio-l:<signId>-<voterId>` |
  | `ayuda` | `answers.id` | The caller is the author of the answer's question, has a `ratings` row with `helpful = true` for it, and is not the answer's author | `answers.author_id` | +5 | `ayuda:<answerId>` |
  | `cierre` | `questions.id` | The caller is the question's author, the status is `solved` or `closed`, and it has at least one answer | The caller | +1 | `cierre:<questionId>` |

  Payment flow, the same as the welcome: insert the `rewards` row (`pending`, unique `memo_key`), look in the recipient's incoming payments for that memo, pay from the distributor only if it is not there, mark it `confirmed` with the hash. If the recipient has no ready Stellar account, or Stellar fails, the row stays `pending` and the answer is `202`. Calling again with the same body retries a `pending` or `error` row and returns the stored hash for a `confirmed` one.
- **`POST /api/stellar/gastar`** (`api/stellar/gastar.ts`), same auth, body `{ "reason": "urgente", "refId": <questionId> }`. Legitimate when the caller is the question's author and `urgent_until` is set. The server reads the caller's balance from Horizon and requires 5 or more. It signs with the caller's custodied key (decrypted with `WALLET_ENC_KEY`) and pays 5 YAPITA to the distributor with memo `urgente:<questionId>` (`rewards.amount = -5`). If the balance is short or Stellar fails, nothing is charged, the row (if any) is `error`, and the answer says `not_charged` so the question can be published as a normal one (wiki: «No pudimos cobrar, se publicó normal»). It is not retried by itself.
- **`lib/stellar/rewards.ts`** (server only), the logic behind both routes, with two interfaces so the same code runs on Supabase and in memory: `RewardFacts` (reads the signs, votes, questions, answers and ratings that decide legitimacy) and the existing `WalletStore` extended with the reward lookup and the new reasons. Functions: `planReward(facts, caller, reason, refId)` (returns recipient, amount and keys, or `not_allowed`), `payReward(...)`, `chargeUrgent(...)`.
- **Supabase implementation** of `RewardFacts` and the extended store in `lib/supabase/server.ts` (service role).
- **`scripts/stellar/e2e.ts`** extended with an in-memory store: +5 welcome, +5 `ayuda`, +1 `letrero`, the same `ayuda` repeated (no second payment), an `ayuda` from someone who is not the asker (`not_allowed`), `urgente` −5, and the failure and retry case. The final balance stays predictable.
- **Cosmetic fix, phone only: the main button (`Subir letrero` / `Preguntar`) folds to «+» and unfolds too abruptly** (`src/components/AppShell.tsx` › `useFoldOnScroll`, `src/components/app-shell.css` › `.shell__fab`). It is unrelated to Stellar and is done last, as its own commit, so it never blocks the payments. Target: the pill shrinks and grows smoothly, with no flicker when the scroll hovers near the threshold and no text clipped or jumping mid-transition. The probable causes, to confirm in step 6 before touching anything: the 8 px / 120 px thresholds toggle with no hysteresis; the label fades over the same time as the width shrinks, so it is cut in half; and a grid `0fr` column with text that can still wrap. Only the animation and its trigger change: size, position, labels and the desktop sidebar action stay as they are.
- **Wiki**: the memo ids of `ayuda` and `sirvio-l` (the table says `<qid>` and `<id>`, which are not unique) are recorded in `huecos-cerrados.md`, `log.md` and the table of `reglas-finales.md`, before the PR is opened.

**Out of scope (for future specs):**

- The limits: 10 letreros per day, 3 premiados per question, 3 per day between the same two people, 10 questions per day (T23). The route is built so T23 adds those checks to `planReward` without changing the contract.
- The «Reintentar» button, the retry when the app opens, and Movimientos read from the chain (T39, T21). This spec only guarantees that calling again is safe.
- Canje −100 (`canje:<id>`, T32).
- Calling the functions from the app. `src/` gets no new code here: T39 does it when it writes letreros, ratings and questions to Supabase.
- Any other visual change: the rest of the main button (size, color, position, labels), the desktop sidebar action and the Sheet.
- Notifications about a reward and any change to the rules or amounts.

## Data model

No new tables or migrations: it uses `rewards`, `signs`, `sign_votes`, `questions`, `answers`, `ratings` and `profiles` from SPEC 03. `rewards` is written only by the service role (SPEC 03 RLS) and read by the owner.

```ts
type PremiarReason = 'letrero' | 'sirvio-l' | 'ayuda' | 'cierre';
type GastarReason = 'urgente';

// lib/stellar/rewards.ts
type RewardPlan = {
  recipientId: number;       // profile that receives (premiar) or pays (gastar)
  reason: PremiarReason | GastarReason;
  amount: number;            // +1, +5 or -5
  memoKey: string;           // rewards.memo_key and Stellar memo, at most 28 bytes
};

interface RewardFacts {
  sign(id: number): Promise<{ authorId: number } | null>;
  signVote(signId: number, voterId: number): Promise<{ helpful: boolean } | null>;
  question(id: number): Promise<{ authorId: number; status: 'open' | 'solved' | 'closed'; urgent: boolean; answerCount: number } | null>;
  answer(id: number): Promise<{ authorId: number; questionId: number } | null>;
  rating(answerId: number): Promise<{ raterId: number; helpful: boolean } | null>;
}
```

`WalletStore.ensureReward` accepts every `reason` the `rewards` check allows, takes a negative `amount`, and a new `getReward(memoKey)` returns the row. `memo_key` keeps being unique across the app.

HTTP contract, all responses with `Cache-Control: no-store`:

| Status | Body | When |
|---|---|---|
| `200` | `{ "status": "confirmed", "txHash": "..." }` | Paid or charged (also a repeated call) |
| `202` | `{ "status": "pending" }` (premiar) or `{ "status": "not_charged", "why": "balance" \| "stellar" }` (gastar) | Stellar failed or the recipient has no ready account / not enough balance |
| `400` | `{ "error": "bad_request" }` | Invalid body, unknown `reason`, `refId` that is not a positive integer |
| `401` | `{ "error": "unauthenticated" }` | No token, forged or expired token |
| `403` | `{ "error": "not_allowed" }` | The row does not exist or the rule above does not hold |
| `409` | `{ "error": "profile_missing" }` | Valid token, no profile |
| `500` | `{ "error": "server" }` | Missing configuration or an unexpected error |

## Implementation plan

1. Write the wiki records first: the memo ids of `ayuda` and `sirvio-l` in `huecos-cerrados.md`, `log.md` and the `reglas-finales.md` table. Manual test: the wiki repo has the rows and the table matches the spec.
2. Create `lib/stellar/rewards.ts` (`planReward`, `payReward`, `chargeUrgent`, the `RewardFacts` interface), extend `WalletStore` in `lib/stellar/wallet.ts` (`getReward`, all reasons, negative amounts) and keep `provisionWallet` working. Manual test: `npm run typecheck` passes.
3. Extend `scripts/stellar/e2e.ts` with an in-memory `RewardFacts` and the scenarios of the scope. Manual test: `npm run stellar:e2e` ends with the expected balance, one payment per memo, and the failure case leaves a `pending` reward that the second call confirms.
4. Add the Supabase `RewardFacts` and the extended store to `lib/supabase/server.ts`, and create `api/stellar/premiar.ts` and `api/stellar/gastar.ts` as thin handlers (auth, parse, `planReward`, pay, map to the table above). Manual test: `npm run typecheck` and `npm run build` pass; `git grep "stellar-sdk" src` finds nothing.
5. Open the PR (`Closes #10`) and test on its Vercel preview with `vercel curl --deployment`: throwaway users and rows created with the service role (SPEC 08's cleanup recipe), real access tokens, each reason once and again, a forged token, a wrong caller, and a break of Stellar on purpose in the preview only. Delete every row and user afterwards.
6. Cosmetic: first reproduce the abrupt fold on a phone width (or 360 px emulation) and note what jumps; then fix `useFoldOnScroll` (hysteresis: fold after scrolling down a clear distance, unfold on a clear scroll up or near the top) and the fold transition in `app-shell.css` (the label fades out first and fades in after the width is back, `white-space: nowrap`, one shared easing). Manual test at 360 px in light and dark, slow and fast scrolls, reduced motion on (no animation, still folds), on a real phone if possible. Commit it separately: `fix: smooth the fold of the main button on phones`.

## Acceptance criteria

- [x] Calling `/premiar` twice with the same body leaves one payment on the chain and one `confirmed` row in `rewards`, and the second answer carries the same `txHash`.
- [x] Two simultaneous calls with the same body also produce one payment (`stellar:e2e` and one concurrent run on the preview).
- [x] The memo of each reason is the one in the table (`letrero:<id>`, `sirvio-l:<signId>-<voterId>`, `ayuda:<answerId>`, `cierre:<questionId>`, `urgente:<questionId>`) and none is longer than 28 bytes.
- [x] A caller who does not meet the rule (not the author, voting on their own letrero, rating their own answer, a question that is still `open` for `cierre`) gets `403 not_allowed` and no `rewards` row is created.
- [x] A missing or forged token gets `401`; a valid token without a profile gets `409`; a body with an unknown `reason` or a non-numeric `refId` gets `400`.
- [x] If the recipient has no ready account or Stellar fails, `/premiar` answers `202`, the reward stays `pending`, and calling again after the cause is fixed confirms it with one payment.
- [x] `/gastar` with a balance of 5 or more charges exactly 5 once (repeating the call does not charge again); with less than 5 it answers `not_charged` and the balance does not change.
- [x] The client never decides the amount, the memo or the recipient: the body has only `reason` and `refId`.
- [x] On a phone, scrolling down folds the main button to «+» and scrolling up unfolds it in one smooth motion: no label cut in half, no jump in width, no flicker when the scroll stops near the threshold; with reduced motion it changes without animating.
- [x] The cosmetic change touches only `useFoldOnScroll` and the `.shell__fab` rules: the desktop sidebar action, the labels and the button's size and position are unchanged.
- [x] `npm run stellar:e2e` passes, including the welcome from SPEC 08.
- [x] `git grep -i "SECRET\|SERVICE_ROLE" -- src` shows no values, the built bundle contains no secret, and no file under `src/` imports `@stellar/stellar-sdk`.
- [x] `npm run typecheck` and `npm run build` pass, CI is green, and the PR body has `Closes #10`.

> Verified 2026-11-21: `stellar:e2e` (5 consecutive runs) and a run on the PR's preview with throwaway users (all routes, 33 checks). The fold of the button was measured in a 360 px browser (width 167 → 58 px over about 150 ms, no flicker with a ±10 px tremor, back in about 270 ms); the real-phone feel is checked by Diego on the preview.

## Decisions

- **Yes:** the client calls the routes with its own token and sends only `{reason, refId}`. The server derives the rest. A server-to-server design would need triggers and more pieces for no gain before the deadline.
- **Yes:** `ayuda:<answerId>` and `sirvio-l:<signId>-<voterId>`. The wiki's `ayuda:<qid>` would let only one answer per question be paid (a question may pay up to 3), and `sirvio-l:<id>` has no id per vote. Both fit in 28 bytes. The Stellar memo equals `memo_key` for every reason except the welcome (SPEC 08).
- **No:** adding an `id` column to `sign_votes` or paying by `ratings.id`. It needs a migration to solve what the composite key already solves.
- **Yes:** limits wait for T23. T17 guarantees idempotency and legitimacy only; the per-day and per-question caps are added in `planReward` without changing the HTTP contract.
- **Yes:** retry is the same call again. It is idempotent, so the future «Reintentar» button and the retry on opening the app need no extra route.
- **No:** a third route `/reintentar` that sweeps pending rewards. More code and not asked by the ticket.
- **Yes:** a recipient with no ready account leaves the reward `pending` instead of provisioning it from here. Creating accounts stays in `provisionWallet` (SPEC 08, seed users in T09).
- **Yes:** `/gastar` charges only urgent (−5) and never retries by itself. The wiki says a failed charge publishes the question as normal and charges nothing; retrying later would charge an old question.
- **Yes:** the check for the memo in the recipient's payments before paying, as in the welcome, because the unique key alone does not stop two simultaneous calls from both reading `pending`.
- **No:** canje here. It is optional (T32) and uses the same `gastar` shape, so it can be added later.
- **Yes:** the fold fix lives in this spec by the user's request, as its own last step and commit. It shares nothing with the payments, so it can be reverted or cut alone.
- **No:** client code in `src/data`. T39 owns the adapter; adding half of it here would be unused and untested.

## Risks

| Risk | Mitigation |
|---|---|
| No letreros, questions or ratings exist in Supabase until T39, so the checks cannot be tried from the app | Step 5 creates throwaway rows with the service role, and `stellar:e2e` covers the rules with the in-memory facts. |
| A repeated call races the first one and both pay | Unique `memo_key` plus the chain lookup for the memo; tested with concurrent calls as in SPEC 08. |
| Friendbot/Horizon down, or the recipient has no account | The reward stays `pending` and the response is `202`; a later identical call finishes it. |
| `/gastar` reads the balance and another charge spends it before the payment | Stellar rejects a payment with no funds; the route maps that to `not_charged` and marks the row `error`. |
| Paying an ayuda to someone who gets a different recipient than expected | The recipient is always read from the answer's or sign's row, never from the body; the e2e checks the destination of each payment. |
| The fold fix grows into a redesign of the button | Out of scope says only animation and trigger change; step 6 starts by naming what jumps. |
| The memo ids differ from the wiki table | Step 1 updates the wiki before any code; the decision is recorded above. |
