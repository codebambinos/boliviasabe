# SPEC 01 — Data layer contract and mock adapter

> **Status:** Implemented
> **Depends on:** none (first spec). Board card: T10 (issue #4).
> **Date:** 2026-11-20
> **Objective:** Give every screen one typed data layer in `src/data/` (TanStack Query hooks over a `DataApi` contract), backed for now by an in-memory mock adapter that follows the wiki rules, so UI work can start before Supabase exists.

## Why this spec exists

Aldrin's screens (T18 to T21) are blocked until there is a data layer to build against. Supabase tables (T08) do not exist yet. Splitting the contract and the mock from the Supabase adapter unblocks the UI today. It also forces the screens to handle loading, errors, limits and pending rewards from the first commit, because the mock produces all of them.

## Scope

**In:**

- A `DataApi` TypeScript contract covering what the demo (P1) needs: session and profile, letreros (signs), questions, answers, votes and «Me sirvió», saved items, reports and «Ya no quiero ver esto», rule limits, wallet balance and movements, and «Mi actividad».
- Shared types, a typed `DataError`, and the catalogs from the wiki (10 cities, suggested zones, 18 tags, 6 report reasons).
- An in-memory mock adapter with seed fixtures, fake latency, failure modes driven by a URL parameter, and the wiki rules that change what the screen shows.
- Generated SVG placeholder photos for the fixtures.
- Simulated yapita rewards that go from «Pendiente» to «Confirmado».
- Adapter selection through `VITE_DATA_SOURCE`, falling back to the mock.
- TanStack Query hooks as the only public surface for screens, plus the `QueryClientProvider` wiring.
- `src/data/README.md` explaining how to use the layer.
- A temporary smoke view in `src/App.tsx` to verify the layer in the browser.

**Out of scope (for future specs):**

- The Supabase adapter. It needs the T08 tables and goes in SPEC 02.
- Real authentication with Google or email (T15).
- Comment threads, Realtime, «Pedir contacto» (T22).
- Notifications and the bell (T24), settings (T29) and push (T27).
- Share links and Open Graph (T25).
- Photo compression with canvas (T19 does it before calling the layer).
- Server-side enforcement of limits and rewards (T17, T23). The mock imitates their errors only.
- Persisting mock data between reloads.

## Data model

All IDs are numbers (`bigint identity` in Postgres) because Stellar memos hold at most 28 bytes. Dates are ISO strings in UTC; screens format them in `America/La_Paz`.

```ts
// src/data/types.ts (shape, not final code)
type Id = number;
type City = (typeof CITIES)[number];      // from catalog.ts
type Tag = (typeof TAGS)[number];
type Badge = 'Vecino nuevo' | 'Buen vecino' | 'De confianza';

type Author = { id: Id; displayName: string; stars: number | null; badge: Badge };
// displayName is "Lucía M.". stars is null while the badge is "Vecino nuevo".

type Profile = { id: Id; fullName: string; displayName: string; city: City; zone: string;
  stars: number | null; badge: Badge };

type Session =
  | { status: 'guest' }
  | { status: 'signed-in'; userId: Id; email: string; profile: Profile | null };
// profile === null means «Tu barrio» is still pending.

type Sign = { id: Id; title: string; photoUrl: string; price: string | null; city: City;
  zone: string; tags: Tag[]; mapsUrl: string | null; author: Author; createdAt: string;
  helpfulCount: number; myVote: 'helpful' | 'not_helpful' | null; savedByMe: boolean;
  isMine: boolean; inReview: boolean };

type QuestionStatus = 'open' | 'solved' | 'closed';
type Question = { id: Id; text: string; photoUrl: string | null; city: City; zone: string;
  tags: Tag[]; author: Author; createdAt: string; urgentUntil: string | null;
  status: QuestionStatus; answerCount: number; savedByMe: boolean; isMine: boolean;
  inReview: boolean };

type Answer = { id: Id; questionId: Id; text: string; author: Author; createdAt: string;
  helpful: boolean; notHelpful: boolean; savedByMe: boolean; isMine: boolean; inReview: boolean };

type Page<T> = { items: T[]; nextCursor: string | null };   // 30 items per page

type RewardReason = 'bienvenida' | 'letrero' | 'sirvio-l' | 'ayuda' | 'cierre' | 'urgente' | 'canje';
type Movement = { id: Id; reason: RewardReason; amount: number; createdAt: string;
  status: 'confirmed' | 'pending' | 'error'; txHash: string | null; explorerUrl: string | null };
// amount is signed: +5, −5.

type Wallet = { status: 'preparing' | 'ready' | 'error'; address: string | null;
  balance: number | null };

type ContentKind = 'sign' | 'question' | 'answer';
type ReportReason = 'spam' | 'false_info' | 'offensive' | 'personal_data' | 'inappropriate' | 'other';
```

```ts
// src/data/errors.ts
type DataErrorCode = 'offline' | 'server' | 'unauthenticated' | 'forbidden'
  | 'not_found' | 'validation' | 'limit';
type LimitReason = 'questions_per_day' | 'open_questions' | 'urgent_active'
  | 'insufficient_balance';
class DataError extends Error { code: DataErrorCode; limit?: LimitReason; until?: string; field?: string }
// until: when the limit resets (next midnight in Bolivia for daily limits).
```

The `DataApi` contract in `src/data/api.ts` groups methods by domain:

| Group | Methods |
|---|---|
| `auth` | `getSession`, `signInWithGoogle`, `signInWithEmail(email, password)`, `signOut`, `saveProfile({ fullName, city, zone })` |
| `signs` | `list({ city, search?, tags?, cursor? })`, `get(id)`, `create({ title, photo: Blob, price?, zone?, tags?, mapsUrl? }) → { sign, rewarded }`, `vote(id, 'helpful' \| 'not_helpful')`, `remove(id)` |
| `questions` | `list({ city, search?, tags?, cursor? })`, `get(id) → { question, answers }`, `similar(text)` (max 3), `create({ text, photo?, urgent, zone?, tags? }) → { question, urgentCharged }`, `remove(id)`, `closeWithoutSolution(id)` |
| `answers` | `create(questionId, text)`, `markHelpful(id)`, `markNotHelpful(id)`, `remove(id)` |
| `saved` | `toggle(kind, id)`, `list()` |
| `reports` | `report(kind, id, reason)`, `hideForMe(kind, id)` |
| `wallet` | `get()`, `movements({ cursor? })`, `retry(movementId)` |
| `activity` | `myQuestions()`, `myAnswers()`, `mySigns()` |

Conventions:

- Every method returns a Promise and rejects only with `DataError`.
- Methods that change data reject with `unauthenticated` when the session is a guest.
- `signs.create` publishes even past 10 per day and returns `rewarded: false` (wiki rule, not an error).
- Catalogs live in `src/data/catalog.ts` and are copied from `wiki/reglas-finales.md`, section «Catálogos».

### Mock behavior

- **Latency:** every call waits a random 300 to 600 ms.
- **URL modes** (read once at startup from `location.search`):

| Parameter | Effect |
|---|---|
| `?mock=slow` | Every call waits 2500 ms |
| `?mock=offline` | Every call rejects with `offline` |
| `?mock=error` | Every call rejects with `server` |
| `?mock=stellar-error` | New rewards go from `pending` to `error` instead of `confirmed` |

- `navigator.onLine === false` also rejects with `offline`.
- **Session:** starts as guest. `signInWithGoogle` signs in as the seed neighbor «Lucía M.» (has a profile and balance). `signInWithEmail` with an email that is not in the fixtures creates a new user with `profile: null`, so «Tu barrio» can be tested. `signOut` returns to guest.
- **Rewards:** a reward appears as `pending` and becomes `confirmed` after 2 seconds, with a fake 64-character hash and a `stellar.expert` testnet link. A new user's wallet is `preparing` for 2 seconds, then `ready` with the +5 welcome reward.
- **Fixtures:** 5 neighbors; 35 signs and 12 questions (with answers) in Cochabamba; a few items in La Paz; Cobija stays empty to test the empty state. Some signs are older than 7 days.
- **Photos:** generated SVG data URLs (colored rectangle with the sign title).
- **Rules enforced** (same errors the server will return):
  - 10 questions per day → `limit` / `questions_per_day`.
  - 3 open questions with answers → `limit` / `open_questions`.
  - 1 active urgent question → `limit` / `urgent_active`.
  - Urgent with balance below 5 → `limit` / `insufficient_balance`.
  - One vote per sign, final, never on your own sign → `forbidden`.
  - One answer per person per question, never on your own question → `forbidden`.
  - Only the asker marks «Me sirvió» on answers. The first one sets the question to `solved` and pays +1 for closing. At most 3 rewarded per question.
  - Delete a question only without answers; delete an answer only without «Me sirvió» → `forbidden`.
  - Text lengths: sign title 3 to 80, question 3 to 300, answer up to 1000. Maps link must start with `https://` → `validation` with `field`.
  - «Por día» is the calendar day in `America/La_Paz`.
- **Hide for me:** hidden items disappear from later lists for the rest of the session.

## Implementation plan

1. Create `src/data/types.ts`, `src/data/errors.ts` and `src/data/catalog.ts` with the types, `DataError` and the wiki catalogs. `npm run typecheck` passes.
2. Create `src/data/api.ts` with the `DataApi` contract from the table above.
3. Create `src/data/mock/behavior.ts` (latency, URL modes, offline check) and `src/data/mock/svg.ts` (placeholder photos).
4. Create `src/data/mock/fixtures.ts` with the seed neighbors, signs, questions, answers and movements.
5. Create `src/data/mock/store.ts` (in-memory state built from the fixtures) and `src/data/mock/rules.ts` (limit and permission checks, Bolivia calendar day, trust stars and badge).
6. Create `src/data/mock/adapter.ts` with `auth` and `signs`.
7. Add `questions` and `answers` to the mock adapter.
8. Add `saved`, `reports`, `wallet` (including the pending → confirmed reward lifecycle) and `activity` to the mock adapter.
9. Create `src/data/source.ts` (reads `VITE_DATA_SOURCE`; uses the mock when the value is `mock`, missing, or when the Supabase adapter is not available yet, with one `console.warn`), `src/data/keys.ts` (query keys) and `src/data/query.ts` (QueryClient: no retries for `forbidden`, `validation`, `limit`, `unauthenticated`, `not_found`; one retry for `offline` and `server`). Wrap the app in `QueryClientProvider` in `src/main.tsx`. Add `VITE_DATA_SOURCE=mock` to `.env.example`.
10. Create hooks in `src/data/hooks/session.ts` and `src/data/hooks/signs.ts` (lists with `useInfiniteQuery`, mutations invalidate the affected keys).
11. Create hooks in `src/data/hooks/questions.ts` (questions and answers).
12. Create hooks in `src/data/hooks/saved.ts`, `src/data/hooks/reports.ts`, `src/data/hooks/wallet.ts` and `src/data/hooks/activity.ts`.
13. Create `src/data/index.ts` exporting only hooks, types, catalogs and `DataError`. Write `src/data/README.md`: how to use a hook, the `?mock=` modes, the fixture users, and how to add a method.
14. Replace `src/App.tsx` with a temporary smoke view: session status, a «Continuar con Google» button, the first 3 Cochabamba signs and the balance. T12 replaces it with the real routes.

## Acceptance criteria

- [x] `npm run typecheck` and `npm run build` pass, and the CI check is green on the PR.
- [x] No file outside `src/data/` imports from `src/data/mock/`, `src/data/api.ts` or `@supabase/supabase-js`.
- [x] Without a `.env` file, the app starts with the mock and shows no error.
- [x] A fresh load reports the session as `guest`.
- [x] Calling a mutation hook as a guest rejects with `DataError` code `unauthenticated`.
- [x] «Continuar con Google» in the smoke view signs in as «Lucía M.» with a profile; signing out returns to `guest`.
- [x] `signInWithEmail` with a new email gives a session with `profile: null`; `saveProfile` fills it.
- [x] Listing Cochabamba signs returns 30 items, newest first, with a non-null `nextCursor`; the next page returns the remaining 5 with `nextCursor: null`.
- [x] Listing Cobija returns an empty page.
- [x] Without `?mock=`, a call resolves in 300 to 600 ms; with `?mock=slow` it takes about 2.5 s.
- [x] With `?mock=offline` every call rejects with code `offline`; with `?mock=error`, with code `server`.
- [x] Voting twice on the same sign, or on your own sign, rejects with `forbidden`.
- [x] The 11th question of the day rejects with `limit` / `questions_per_day` and an `until` equal to the next midnight in Bolivia.
- [x] A 4th open question with answers rejects with `limit` / `open_questions`.
- [x] An urgent question with balance below 5 rejects with `limit` / `insufficient_balance`.
- [x] The 11th sign of the day is published with `rewarded: false`.
- [x] Publishing a sign while signed in adds a +1 movement that is `pending` and becomes `confirmed` about 2 s later.
- [x] With `?mock=stellar-error` the new movement ends as `error`; `wallet.retry` takes it to `pending` and then `confirmed`.
- [x] A new email user's wallet is `preparing`, then `ready` with balance 5.
- [x] The asker's first «Me sirvió» sets the question to `solved`; anyone else marking «Me sirvió» gets `forbidden`.
- [x] After `hideForMe`, the item no longer appears in the list.
- [x] `src/data/README.md` documents the hooks, the `?mock=` modes and the fixture users.

## Decisions

- **Yes:** contract + mock now, Supabase adapter in SPEC 02. It unblocks Aldrin today, and the Supabase adapter is written against real tables instead of a guessed schema.
- **No:** writing the Supabase adapter now. T08 can still change the schema, so the adapter would be rewritten.
- **Yes:** TanStack Query hooks as the only public surface. Screens get cache, retries and loading states without repeating logic.
- **No:** screens calling `DataApi` methods directly. Every screen would reimplement loading and error handling.
- **Yes:** `VITE_DATA_SOURCE` with a fallback to the mock. Aldrin needs no configuration, and switching to Supabase later is one variable.
- **No:** mock only in dev and Supabase only in builds. Supabase could not be tested locally.
- **Yes:** in-memory mock with fake latency and failure modes. Skeletons, «Sin conexión» and «Reintentar» can be built and tested from day one.
- **No:** persisting the mock in `localStorage`. More code to reset, and the mock is temporary.
- **Yes:** failure modes through a URL parameter (`?mock=`). Works on a phone instantly, with no restart and no extra UI.
- **No:** a floating dev panel. An extra screen to build and maintain for a temporary tool.
- **Yes:** the mock enforces the wiki rules that change the screen. Limit messages and disabled buttons get built with the real errors.
- **Yes:** typed `DataError` with a code. Screens show the exact wiki message («Sin conexión», «Llegaste al límite de hoy») without parsing strings.
- **Yes:** generated SVG photos. No files, no licenses, nothing heavy in the repo.
- **No:** stock photos in `public/mock`. Heavy files for something temporary.
- **Yes:** rewards go `pending` → `confirmed` after 2 s. The «Pendiente» state and «★ …» are visible before Stellar is wired.
- **Yes:** the guest session plus a fake login. The soft wall («Crea tu cuenta para seguir») is tested as it will work for real.
- **Yes:** interface limited to the demo (P1). Notifications, settings, threads and push get their own specs and do not delay Aldrin.
- **Yes:** the spec is written in English, like the rest of the code repo. Quoted UI copy stays in Spanish.

## Risks

| Risk | Mitigation |
|---|---|
| The mock behaves differently from Supabase, and screens break when switching | Rules and errors are defined once in this contract. SPEC 02 runs the same acceptance criteria against the Supabase adapter. |
| The contract misses a method a screen needs | Adding a method is documented in `src/data/README.md`; the change goes through review like any other PR. |
| The mock grows into a second backend | The mock implements only P1 methods and the rules listed above; anything else waits for its own spec. |
| Board card T10 still says it includes the Supabase adapter | The card is updated to point to this spec, and the Supabase adapter gets its own card with SPEC 02. |

## What is **not** in this spec

- The Supabase adapter (SPEC 02, after T08).
- Real Google or email login (T15).
- Comment threads, Realtime and «Pedir contacto» (T22).
- Notifications, settings and push (T24, T29, T27).
- Share links and Open Graph (T25).
- Photo compression (T19).
- Server-side limits and real Stellar rewards (T17, T23).
- Persisting mock data between reloads.

Each one of those, if it lands, goes in its own spec.
