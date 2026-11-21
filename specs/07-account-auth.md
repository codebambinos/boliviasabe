# SPEC 07 — Account: Google, e-mail and password recovery

> **Status:** Approved
> **Depends on:** SPEC 01 (data layer and mock adapter), SPEC 02 (privacy page), SPEC 03 (Supabase schema), SPEC 04 (routes, `/nueva-contrasena`). Board card: T15 (issue #8).
> **Date:** 2026-11-20
> **Objective:** Make «Crea tu cuenta para seguir» sign people in for real with Supabase Auth (Google or e-mail + password), recover a forgotten password at `/nueva-contrasena`, and bring the person back to the action they were doing, draft included, after the Google redirect.

## Why this spec exists

Today the sheet, the hooks and the wall (`AuthSheet`, `useSignInWithGoogle`, `useSignInWithEmail`, `AuthGate`) run only on the mock: Google signs in as «Lucía M.», any password works for a known e-mail, and the pending action is a closure that dies with the page. The Google redirect reloads the page, so a closure cannot survive it; the wiki (#117) asks for the pending action and the draft to be saved before leaving. `/nueva-contrasena` is an empty placeholder from SPEC 04. The Supabase adapter does not exist yet (`src/data/source.ts` always returns the mock), so this spec builds only its `auth` part.

## Scope

**In:**

- **Real `auth` adapter** in `src/data/supabase/client.ts` (the `createClient` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, PKCE flow, `detectSessionInUrl`) and `src/data/supabase/auth.ts` (`DataApi['auth']`). `source.ts` returns `{ ...mockAdapter, auth: supabaseAuth }` when `VITE_DATA_SOURCE=supabase`; with `mock` (the default) nothing changes.
- **`getSession`**: the Supabase session plus the `profiles` row by `auth_id`. No row means `profile: null` («Tu barrio» pending, T16).
- **Google**: `signInWithOAuth` with `redirectTo` set to the current page; the Google consent screen goes to production **without logo** (wiki #120).
- **E-mail + password** in one «Entrar» action (as the sheet works today), decided by the new SQL function `auth_method(email)`:
  - not registered → create the account (`signUp`, no e-mail confirmation) and sign in;
  - `password` → sign in; a wrong password rejects with `wrong_password`;
  - `google` → rejects with `google_account`.
- **Sheet copy** (`AuthSheet.tsx`): `wrong_password` → «Contraseña incorrecta» under the password field + a «¿La olvidaste?» link; `google_account` → «Esta cuenta entra con Google» + the Google button right there.
- **Forgot password** inside the sheet: e-mail (pre-filled) → «Enviar correo» → «Te enviamos un correo. Si no llega, revisa Spam».
- **`/nueva-contrasena`** (`NewPasswordPage.tsx`): new password (minimum 6, show/hide) → «Guardar contraseña» → signed in → Hoy. A link that does not work shows «Este enlace ya no sirve» + «Pedir otro» (goes to Hoy with the forgot-password step open).
- **Pending action** (`src/components/pendingAction.ts` + `AuthGate.tsx`): `requireAccount(reason, action, title?, resume?)` gets an optional serializable `resume` descriptor. Before going to Google it is saved with the return path; when the app loads signed in, `AuthGate` runs it once and clears it. Existing call sites that become resumable: Guardar and Me sirvió / No me sirvió (the others keep working as today, not resumable, until their own tasks). The `PendingAction` union is meant to grow: each later task adds its own `kind` and registers its handler in `ShellLayout` (a `kind` with no handler is ignored without error). This spec adds `open-new-sign` itself (T19 was merged without a `resume`), so «+ Subir letrero» reopens its form after Google: the FAB passes it and `ShellLayout` registers a handler that opens the upload sheet.
- **Draft store** (`src/components/draftStore.ts`): text fields in `localStorage`, photos in IndexedDB. A form registers a getter with `AuthGate`, which saves the draft before the redirect; the form reads it back on mount. It is for inline text boxes where the wall comes at «Enviar», not at the opening button (answers in T20, thread comments in T22). Forms opened from a button that already requires an account, like «+ Subir letrero» (T19), have nothing typed when the redirect happens and do not use it. The store uses its own IndexedDB database, so it never collides with `src/components/draft.ts` while that file is still in `main` (issue #12 asks to remove it).
- **Mock parity**: the mock now keeps a password and a sign-in method per user, so `wrong_password`, `google_account` and the reset flow can be tested without Supabase.
- **Supabase setup**: migration `supabase/migrations/0004_auth_method.sql`, a check for it in `supabase/tests/rls.sql`, and an «Auth setup» section in `supabase/README.md` with the dashboard settings (Site URL, Redirect URLs, e-mail provider, Google provider, SMTP).

**Out of scope (for future specs):**

- «Tu barrio» and `saveProfile` against Supabase (T16). `supabaseAuth.saveProfile` rejects with `server` until then; creating the `profiles` row and the Stellar account belong to T16.
- The rest of the Supabase adapter (signs, questions, saved, reports, wallet).
- Cerrar sesión screen and deleting the push subscription on sign-out (T29, T27). `signOut` itself is implemented.
- The forms themselves and the T19 corrections (in-memory draft, profile city; issue #12). Answers and comments (T20, T22) will use the draft store.
- E-mail confirmation, Apple login, phone login, linking Google and password to one account by hand.
- Rate limits on sign-in attempts beyond what Supabase does by default.
- The Vercel project, its URL and the production Redirect URLs (T13).

## Data model

New error codes in `src/data/errors.ts` (`DataErrorCode`): `'wrong_password'` and `'google_account'`.

`DataApi['auth']` in `src/data/api.ts` gains three methods:

```ts
requestPasswordReset(email: string): Promise<void>;
/** True when this page was opened from a recovery link (or the mock's reset), so the form can show. */
recoveryReady(): Promise<boolean>;
/** Sets the new password of the recovery session and returns the signed-in session. */
updatePassword(password: string): Promise<Session>;
```

Hooks in `src/data/hooks/session.ts`: `useRequestPasswordReset`, `useRecoveryReady`, `useUpdatePassword` (the last one refreshes the session like the other session mutations).

SQL, `supabase/migrations/0004_auth_method.sql`:

```sql
-- 'password' | 'google' | null (not registered). Callable by anon on purpose: the wiki (#73) asks
-- for «Esta cuenta entra con Google». It tells whether an e-mail is registered; accepted for the demo.
create function public.auth_method(p_email text) returns text
  language sql stable security definer set search_path = '' as $$ ... $$;
revoke all on function public.auth_method(text) from public;
grant execute on function public.auth_method(text) to anon, authenticated;
```

The function reads `auth.users` and `auth.identities` and answers `password` if the user has an `email` identity, else `google` if it has a `google` one, else `null`.

Pending action, `src/components/pendingAction.ts`:

```ts
type PendingAction =
  | { kind: 'save-sign'; id: number }
  | { kind: 'vote-sign'; id: number; value: 'helpful' | 'not_helpful' }
  | { kind: 'open-new-sign' };
// Later tasks extend it, e.g. T20 adds its own kind.

/** Registered by ShellLayout, which owns what a kind needs (sheets, city, navigation). */
type PendingHandlers = { [K in PendingAction['kind']]?: (action: Extract<PendingAction, { kind: K }>) => void | Promise<void> };

type PendingRecord = { resume: PendingAction | null; path: string; reason: string; title?: string; savedAt: number };
// localStorage key: 'bs:pending:v1'. Expires after 10 minutes.
```

Draft store, `src/components/draftStore.ts`:

```ts
type DraftRecord = { fields: Record<string, unknown>; blobs: Record<string, Blob> };
saveDraft(key: string, draft: DraftRecord): Promise<void>;
loadDraft(key: string): Promise<DraftRecord | null>;
clearDraft(key: string): Promise<void>;
// fields: localStorage 'bs:draft:<key>:v1'. blobs: IndexedDB database 'boliviasabe-drafts', store 'blobs'.
// Expires after 30 minutes. If either storage fails, it falls back to memory and never throws.
```

Environment: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public values; the anon key is meant for the browser). The `service_role` key is never used here.

## Implementation plan

1. Check the Supabase project and write the «Auth setup» section in `supabase/README.md`. Project `boliviasabe` is linked and healthy; verify in the dashboard: Site URL and Redirect URLs (`http://localhost:5173`, `http://localhost:5173/nueva-contrasena`), «Confirm email» off, minimum password 6, SMTP (works, per Diego). Put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` and fix the comment in `.env.example`. Nothing changes in the app yet.
2. Add `0004_auth_method.sql` and its test in `supabase/tests/rls.sql` (registered with password, registered with Google, unknown, different letter case). Manual test: `npx supabase db reset` locally and the RLS script prints `rls ok`. Apply it to the linked project only after Diego approves.
3. In `src/data/errors.ts` and `src/data/api.ts` add the two codes and the three methods. Update the mock: users get `password` and `provider` (Lucía is `google`), `signInWithEmail` follows the same three branches, `requestPasswordReset` marks a recovery for that e-mail, `recoveryReady` reads it, `updatePassword` sets it and signs in. Add the hooks. Manual test on the mock: wrong password and Google e-mail reject with the new codes.
4. Update `AuthSheet.tsx` for the new messages, «¿La olvidaste?» and the forgot-password step (with `src/components/messages.ts` mapping the codes), and build `NewPasswordPage.tsx` with its states (checking, form, invalid link). Manual test on the mock at 360 px, light and dark, text at 130 %: the whole recovery flow works with no Supabase.
5. Create `src/data/supabase/client.ts` and `auth.ts` and select them in `source.ts`. Manual test with `VITE_DATA_SOURCE=supabase`: create an account with an e-mail, sign out, sign in again, wrong password, forgot password, the e-mail arrives and `/nueva-contrasena` changes it.
6. Create `pendingAction.ts` and `draftStore.ts`; make `AuthGate` save the pending action and the registered draft before `signInWithGoogle` and restore them on load; convert the Guardar and Me sirvió / No me sirvió call sites to pass `resume`, and make the FAB pass `{ kind: 'open-new-sign' }` with a `ShellLayout` handler that opens `UploadSignSheet`. Manual test: as a guest, tap Guardar on a letrero, continue with Google, and the letrero comes back saved; check the draft store from the browser console with one photo, a reload and the 30-minute expiry.
7. Walk the acceptance list on a real Android and a real iPhone, including Google from a link opened inside WhatsApp. Open the PR with `Closes #8` and move the card to In Review.

## Acceptance criteria

- [ ] With `VITE_DATA_SOURCE=mock` (or unset) the app works as before, and no file under `src/pages/` or `src/components/` imports `@supabase/supabase-js` (`git grep`).
- [ ] With `VITE_DATA_SOURCE=supabase`, a new e-mail + password creates an account and the sheet closes signed in; the same e-mail with the same password signs in.
- [ ] A password of 5 characters is rejected with «La contraseña tiene al menos 6 caracteres».
- [ ] A registered e-mail with another password shows «Contraseña incorrecta» and «¿La olvidaste?».
- [ ] The e-mail of a Google account in «Usar mi correo» shows «Esta cuenta entra con Google» and the Google button.
- [ ] «¿La olvidaste?» sends the e-mail and shows «Te enviamos un correo. Si no llega, revisa Spam».
- [ ] The recovery e-mail arrives at a Gmail address (inbox or Spam), its link opens `/nueva-contrasena`, and a new password of 6 or more characters signs the person in and lands on Hoy.
- [ ] Opening `/nueva-contrasena` with no valid link shows «Este enlace ya no sirve» and «Pedir otro». A used link shows the same.
- [ ] «Continuar con Google» signs in with a Google account and returns to the same page; the Google screen shows no logo.
- [ ] As a guest, Guardar on a tile → Google → back: the letrero is saved. «Me sirvió» in a letrero's detail → Google → back: the detail is open and the vote is sent («Te sirvió»), unless it is the person's own letrero.
- [ ] As a guest on Hoy, «+ Subir» → Google → back: the upload form opens on its own, empty.
- [ ] A pending action older than 10 minutes is dropped without running; a pending action never runs twice; a `kind` with no registered handler is dropped without an error.
- [ ] A draft with text and one photo saved with `saveDraft` survives a reload and is returned by `loadDraft`; after 30 minutes it returns `null`; with IndexedDB blocked it still works in memory and does not throw.
- [ ] Closing the sheet (✕, Android back, scrim) returns to where the person was and keeps what they typed in the e-mail field.
- [ ] `auth_method` answers `password`, `google` and `null` for the three cases, and `anon` can call it. The RLS script ends with `rls ok`.
- [ ] No on-screen text says «XLM», «cripto», «blockchain» or «puntos» alone.
- [ ] `git grep -i "SECRET\|SERVICE_ROLE" -- src` shows no values, and the built bundle contains no `service_role` key.
- [ ] Aldrin creates an account with e-mail and another with Google from his phone, and both reach «Tu barrio» pending (profile `null`) without errors.
- [ ] `npm run typecheck` and `npm run build` pass, and CI is green.
- [ ] The PR body has `Closes #8`.

## Decisions

- **Yes:** only the `auth` part of the Supabase adapter. The rest (signs, questions, wallet) belongs to the tasks that need it, and `{ ...mockAdapter, auth }` keeps the app running while they land.
- **No:** the whole adapter now. It is far bigger than T15 and collides with T19, T20 and T21.
- **Yes:** `auth_method(email)` as a SQL function. It is the only way to give the wiki's «Esta cuenta entra con Google» (#73) and «Contraseña incorrecta» without guessing.
- **No:** a single generic error («Correo o contraseña incorrectos»). It is safer against e-mail enumeration, but breaks #73 and the wiki flow; changing it would mean a product decision recorded in the wiki first.
- **Yes:** the enumeration risk is accepted for the demo and written down here and in the migration comment.
- **Yes:** one «Entrar» action for create and sign in, as the wiki and the current sheet have it. `auth_method` picks the branch.
- **Yes:** a serializable `resume` descriptor for pending actions. A closure cannot survive the Google redirect.
- **No:** restoring every action now. Report, Subir and Preguntar stay as today until their tasks add a `kind`; the descriptor union grows then.
- **Yes:** the draft store ships in T15 with no form using it yet, because #117 and the issue ask for it here. Its first users are inline text boxes with the wall at «Enviar» (T20, T22).
- **Yes:** «+ Subir letrero» keeps its draft in memory (wiki #167, corrected 2026-11-21). It requires the account before the form opens (wiki: «+ Subir letrero 🔒»), so nothing is typed when Google reloads the page. The merged T19 (PR #36) persists the draft in `draft.ts`; issue #12 was reopened to remove that, after this spec lands. This spec only adds the `open-new-sign` kind so the form opens again after Google.
- **Yes:** the draft store opens its own IndexedDB database (`boliviasabe-drafts`). `draft.ts` in `main` opens `boliviasabe` v1 with another store, and two modules on one database would overwrite each other's schema; a separate name makes the merge order irrelevant.
- **No:** moving the wall of «Subir» from the button to «Publicar». It would let guests fill the form and force a photo draft across the redirect, but it changes the wiki flow and needs a product decision first.
- **Yes:** `localStorage` for fields and IndexedDB for photos (wiki #117, `tecnico.md`). Both with short expiry, versioned keys (`:v1`) and a memory fallback.
- **Yes:** the mock simulates the whole recovery (`recoveryReady`, `requestPasswordReset`) so the screen can be built and checked before Supabase is configured.
- **Yes:** Google without logo (wiki #120). A logo makes Google ask for a brand verification that takes days.
- **Pending decision:** the wiki gives no copy for an invalid recovery link or for the «Guardar contraseña» button. This spec proposes «Este enlace ya no sirve», «Pedir otro» and «Guardar contraseña»; Diego confirms them, and they are recorded in the wiki (`huecos-cerrados.md`, `log.md`) in the same pass as the implementation.

## Risks

| Risk | Mitigation |
| --- | --- |
| Google, Site URL, Redirect URLs or «Confirm email» are not configured in the dashboard | Step 1 is a checklist run before any code; Google and e-mail criteria are verified against the real project, not assumed. |
| Google login fails inside the WhatsApp browser (wiki #119) | Test it early (step 7) and keep «Usar mi correo» always working; add a hint only if it fails. |
| The recovery link opens in another browser than the one that asked for it, and PKCE rejects it | Use the e-mail link in the same browser in the checks; if it fails, show «Este enlace ya no sirve» + «Pedir otro» rather than a blank page. |
| Gmail SMTP sends to Spam or hits the 30 e-mails per hour limit | The copy says «Si no llega, revisa Spam»; the limit is enough for the demo and can be raised in Supabase. |
| `auth_method` lets anyone check if an e-mail is registered | Accepted for the demo (see Decisions); rate limiting by Supabase still applies. |
| A pending action runs twice or against a different account | The record is read once when the page loads and removed as soon as the session is known (run if signed in, dropped if guest), and an old one (over 10 minutes) is dropped when read. |
| The anon key is mistaken for a secret, or the `service_role` key lands in the browser | The anon key is public by design; the `git grep` and bundle checks in the criteria cover the other one. |
| `profiles` row missing after the first sign-in leaves the person half signed in | `profile: null` is a valid session (SPEC 01); the next action opens «Tu barrio» (T16). |

## What is **not** in this spec

- «Tu barrio», `saveProfile` on Supabase, the `profiles` row and the Stellar account (T16).
- The rest of the Supabase adapter and any data screen.
- Cerrar sesión and the push subscription cleanup (T29, T27).
- The new-sign, question, answer and comment forms, and their `resume` kinds and use of the draft store (T19, T20, T22).
- E-mail confirmation, Apple login, phone login.
- The Vercel project and the production Redirect URLs (T13).

Each one of those, if it lands, goes in its own spec or task.
