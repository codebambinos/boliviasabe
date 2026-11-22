# SPEC 25 — Session and pending states from T31

> **Status:** Implemented
> **Depends on:** SPEC 07 (`AuthGate`, `requireAccount`, the soft wall), SPEC 10 (desktop panel, `leaveQuestion`), SPEC 15 (`disablePushOnThisDevice` on sign-out), SPEC 23 (`SettingsCard`). Board card: T42 (issue #73). Follows the T31 pass (issue #24, PR #71).
> **Date:** 2026-11-21
> **Objective:** Make «Cerrar sesión» without signal, a tap while the session is loading and a gone question in the desktop panel each say what happens instead of failing silently or showing the wrong screen.

## Why this spec exists

The T31 states pass left three cases where the app does the wrong thing quietly.

1. **Cerrar sesión without signal.** `useSignOut` (`src/data/hooks/session.ts`) first turns push off for this device (`disablePushOnThisDevice`, which works offline), then calls Supabase. With its default `global` scope, `supabase.auth.signOut()` returns a network error and keeps the session. `SettingsCard` does not show `signOut.error`. Result: the button goes back to «Cerrar sesión», the person is still signed in, and this device no longer gets notifications. Nothing from another account leaks; the T42 card described a different risk, which the code does not have.
2. **A tap while the session loads.** `AuthGate.require` treats «no session data yet» as a guest. Someone with an account who taps ☆ Guardar or Me sirvió right after opening the app sees «Crea tu cuenta para seguir». Without signal it is worse: `getSession` also reads `profiles`, fails, and the wall opens for a signed-in person.
3. **Gone question in the desktop panel.** `QuestionDetail` with `variant === 'panel'` shows «Esto ya no está disponible» with no button (`src/components/QuestionDetail.tsx`, the `gone` branch). The panel has no way out.

Rules: `flujo-final` › 0 · Entrada y cuenta (Cerrar sesión, muro suave) and › Transversal; huecos #152, #197, #207, #217.

## Scope

**In:**

- **1 · Cerrar sesión (required for the deadline):**
  - Without signal (`navigator.onLine === false`), `useSignOut` fails at once with `DataError('offline')`. It does not touch push and does not call Supabase.
  - `SettingsCard` shows the error under the button with `errorMessage` («Sin conexión, intenta de nuevo» or «Algo falló, intenta de nuevo»), `role="alert"`. The message goes away on the next tap.
  - With signal, the order stays: forget this device's push, then sign out (#207).
  - If push was already forgotten and the sign-out then fails (server error), the same message shows. The person stays signed in and can turn push on again in Notificaciones. No automatic re-subscribe.
  - «Cerrar sesión» stays one tap (#152).
- **2 · A tap while the session loads:**
  - While `useSession` has no data and no error, `require` keeps the action **waiting**. Only one action waits: a new tap replaces the previous one.
  - When the session arrives, the waiting action follows the normal path: it runs (account with profile), opens «Tu barrio» first (account without profile), or opens the wall (guest).
  - If the session fails to load (no data, with an error), the tap shows a toast with `errorMessage(session.error)` and does nothing else: no wall, no action. A waiting action is dropped the same way when the load fails.
  - When the network comes back, the session reloads by itself (TanStack `refetchOnReconnect`), and the next tap works normally.
  - Data present but refetching (or a failed refetch with old data) uses that data, as today.
- **3 · Gone question in the desktop panel:**
  - The panel shows «Esto ya no está disponible» + **«Volver a la lista»**. The button calls `onGone()` (the shell's `leaveQuestion`): the question leaves the list and the panel goes back to its empty text, like after deleting it.
  - On a phone (`variant === 'page'`), it stays «Ir a Hoy».
- **Wiki first:** a new huecos row (#218) and the `flujo-final` lines for Cerrar sesión, the soft wall and gone content in the panel; entry in `log.md`; index count.

**Out of scope:**

- Signing out locally without signal (`scope: 'local'`). It was discussed; see Decisions.
- Cleaning up server push rows left by other paths. `/api/push` already deletes endpoints that answer 404/410 (`lib/push/send.ts`).
- Re-subscribing push automatically after a failed sign-out.
- A loading indicator on the buttons while an action waits for the session. The wait is usually under a second.
- Changing what `getSession` reads or caching the session for offline use.
- «Preguntas parecidas» following the viewed city (pending product decision from Diego).
- The phone pass of T31 (issue #24).

## Data model

This feature adds no tables, columns, migrations or API methods.

New state inside `src/components/AuthGate.tsx` only:

```ts
// The one action waiting for the session to load; a new tap replaces it.
type Waiting = { reason: string; action: () => void; title?: string; resume?: PendingAction };
const waiting = useRef<Waiting | null>(null);

// A short notice when the session could not load (no wall).
const [sessionFailed, setSessionFailed] = useState<{ id: number; message: string } | null>(null);
```

`useSignOut` keeps its signature. Only its `mutationFn` gains the offline check before `disablePushOnThisDevice`.

## Implementation plan

1. **Wiki first** (`boliviasabe-docs`):
   - `huecos-cerrados.md`: row #218 with the three rules and their texts.
   - `flujo-final.md`: in «Entrada y cuenta», Cerrar sesión without signal says «Sin conexión, intenta de nuevo» and changes nothing. In the soft wall, a tap while the session loads waits for it, and a session that could not load gives a notice instead of the wall. In «Transversal», gone content in the desktop panel offers «Volver a la lista».
   - `log.md` entry, and `index.md` count #1-218.
2. **Cerrar sesión:** offline check at the top of `useSignOut`'s `mutationFn` (`src/data/hooks/session.ts`). In `SettingsCard`, show `signOut.error` under the button and `signOut.reset()` before a new attempt. Manual test with the mock: airplane mode (or `?mock=offline` after signing in) → message, still signed in, Notificaciones unchanged.
3. **Waiting action:** in `AuthGate`, `require` stores the action in `waiting` while the session is pending. An effect runs the waiting action through the same `require` logic once `session.data` arrives. Manual test: `?mock=slow`, tap ☆ Guardar on a tile before Hoy finishes loading → the wall opens once the guest session arrives, not before.
4. **Session that failed:** in `require`, and in the same effect, a session with an error and no data shows the `Toast` with `errorMessage` and drops the action. Manual test: `?mock=offline` → tap ☆ Guardar → «Sin conexión, intenta de nuevo», no wall.
5. **Desktop panel:** in `QuestionDetail`'s `gone` branch, `variant === 'panel'` renders «Volver a la lista» calling `onGone`. Manual test at ≥ 64 rem: open a question in the panel, delete it from another session (or the mock), refresh → the button empties the panel and the card leaves the list.
6. `npm run typecheck` and `npm run build`.

## Acceptance criteria

- [x] Without signal, «Cerrar sesión» shows «Sin conexión, intenta de nuevo» under the button, the person stays signed in, and Notificaciones still shows push as it was before the tap.
- [x] With signal, «Cerrar sesión» still signs out in one tap, forgets this device's push and lands on Hoy as a guest.
- [x] A server error on sign-out shows «Algo falló, intenta de nuevo» and the person stays signed in.
- [x] The sign-out message goes away when the person taps «Cerrar sesión» again.
- [x] With a signed-in Supabase account, reloading and tapping ☆ Guardar before Hoy finishes loading saves it, with no «Crea tu cuenta para seguir».
- [x] With `?mock=slow` as a guest, a ☆ Guardar tap during the load opens the wall only after the session arrives.
- [x] Two taps that need an account during the load run only the last one.
- [x] With `?mock=offline`, a tap that needs an account shows «Sin conexión, intenta de nuevo» and does not open the wall.
- [x] After the network comes back, the same tap follows the normal path without reloading the page.
- [x] On desktop, a question gone from the panel shows «Esto ya no está disponible» + «Volver a la lista»; the button empties the panel and removes the card from the list.
- [x] On a phone, a gone question still shows «Ir a Hoy».
- [x] Works at 360 px in light and dark with text at 130 %; the sign-out message does not push the button off screen.
- [x] The wiki has row #218, the `flujo-final` lines and the log entry.
- [x] `npm run typecheck` and `npm run build` pass; `git grep -i "SECRET\|SERVICE_ROLE"` shows no values.

## Changes during implementation

- **`refetchOnReconnect: true` on `useSession`** (`src/data/hooks/session.ts`). The spec counted on TanStack's default, but with `networkMode: 'always'` (`src/data/query.ts`) TanStack turns `refetchOnReconnect` off. Without it, a session that failed offline stayed in error after the network came back, and every tap kept showing «Sin conexión». It is turned on only for the session, not for every query.
- **«Iniciar sesión» in the top bar** also goes through `require`, so it waits for the session too, and without signal it shows the notice instead of the sheet. Signing in would not work offline anyway.
- The wiki row is **#218**, in the same table as #217.

## Decisions

- **Yes:** without signal, «Cerrar sesión» warns and changes nothing. It is simple, needs no migration, and never leaves the person half signed out. (User's choice.)
- **No:** signing out locally without signal (`scope: 'local'`). It meets #197 better on a shared phone, but the server push row would stay until the push service marks it invalid, and there are more edge cases hours before the deadline.
- **Yes:** if push was forgotten and the sign-out then fails, show the message and accept the case. It is rare and leaks nothing; the person can turn push on again. (User's choice.)
- **No:** re-subscribing push automatically after a failed sign-out. More code and one more thing that can fail.
- **Yes:** a tap while the session loads waits and then follows the normal path. Someone with an account never meets the wall by tapping too early. (User's choice.)
- **No:** ignoring taps while the session loads. Simpler, but the tap is lost.
- **Yes:** only the last waiting action runs. Several actions firing at once would be a surprise. (User's choice.)
- **Yes:** a session that could not load gives a toast, not the wall. The person may have an account; the wall would ask them to sign in again for no reason. (User's choice.)
- **Yes:** «Volver a la lista» in the desktop panel, through the existing `leaveQuestion`. «Ir a Hoy» makes no sense from ¿Alguien sabe?. (User's choice.)
- **No:** removing the gone question silently. The person would not know why the panel emptied.
- **Yes:** one spec for the three points, in the card's priority order. Point 1 is required for the deadline; 2 and 3 may move to a new card if time runs out. (User's choice.)

## Risks

| Risk | Mitigation |
| --- | --- |
| `navigator.onLine` says online on a captive or very weak network, so the sign-out still fails mid-way. | The error is now shown (step 2), and the person can try again. Push can be turned on again in Notificaciones. |
| A waiting action runs a moment after the tap, when the person has already moved on. | Only one action waits, and the session normally loads in under a second. A failed load drops it. |
| The session query stays in error after the network returns if TanStack does not refetch. | `refetchOnReconnect` is on by default and `refetchOnWindowFocus` is on (`src/data/query.ts`). The next tap after a refetch works normally. |
| The pending action saved before Google (`pendingAction.ts`) runs through a different path. | It already waits for `session.data` in its own effect. This spec does not change it. |

## What is **not** in this spec

- Local sign-out without signal.
- Automatic push re-subscription or server cleanup of push rows.
- A loading indicator for actions waiting on the session.
- Offline caching of the session.
- «Preguntas parecidas» by viewed city.
- The T31 phone pass.

Each one of those, if it lands, goes in its own spec or card.
