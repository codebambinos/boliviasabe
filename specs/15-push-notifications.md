# SPEC 15 — Push notifications

> **Status:** Approved
> **Depends on:** SPEC 03 (tables `notifications`, `push_subscriptions`, `profiles.notif_prefs`, triggers of `0003`), SPEC 11 (Supabase adapter), SPEC 12 (comments and «Pedir contacto»), SPEC 13 (`markUrgent` and the urgent flow). **SPEC 16 (T26, #19, the PWA) must be merged first:** it uses `vite-plugin-pwa` with `injectManifest` and a `src/sw.ts`, which this spec extends, and it builds the iPhone steps sheet (`InstallSteps`), which this spec reuses. Board card: T27 (issue #20).
> **Date:** 2026-11-21
> **Objective:** Send a Web Push to every device of a person when something of theirs happens: a new answer, a comment in their threads, a «Me sirvió», a contact request or acceptance, or an urgent question in their zone. Ask for permission after their first publication, and let them turn each type off in Ajustes.

## Why this spec exists

The tables have been there since SPEC 03, but nothing uses them:

- Only two triggers write to `notifications`: a new answer and a «Me sirvió» on an answer.
- Nobody reads `push_subscriptions` or `notif_prefs`.
- There is no `/api/push`, no subscription, and no place to give permission.

The wiki (`reglas-finales › Notificaciones`, `flujo-final › Ajustes`, `flujo-final › Datos → Push`) says the app has to push these events.

## Scope

**In:**

- **New notifications (migration `0008_push.sql`).** Every trigger skips the person who caused the event.

  | Kind | When | Who receives it | `ref_kind` / `ref_id` |
  |---|---|---|---|
  | `answer` *(exists)* | New answer | The author of the question | `question` / question |
  | `helpful` *(exists)* | «Me sirvió» on an answer | The author of the answer | `answer` / answer |
  | `comment` | New comment in a thread | The author of the answer, the author of the question, and everyone who already commented in that thread | `comment` / comment |
  | `sign_helpful` | A letrero vote changes to `helpful = true` (insert, or update from false) | The author of the letrero | `sign` / sign |
  | `contact_request` | A contact request is created | The owner (who answered) | `contact_request` / request |
  | `contact_accepted` | A request changes to `accepted` | The requester. A declined request notifies nobody | `contact_request` / request |
  | `urgent` | A question's `urgent_until` changes from null or past to future (`markUrgent`) | Neighbors with the same `city` and `zone_norm`, with `urgent` not turned off, and fewer than **3 `urgent` notifications in the last hour** | `question` / question |

- **Who caused it.** New nullable column `notifications.actor_id` (who caused it), filled by every trigger, including the two that already exist. The push uses it for the name, and the bell of T24 can use it too.
- **Delivery.**
  - A trigger `AFTER INSERT` on `notifications` calls `POST /api/push` with `pg_net` (`net.http_post`), sending `{ id }` and the header `x-push-secret`.
  - The URL and the secret are read from **Supabase Vault** (`push_url`, `push_secret`).
  - If either one is missing (local stack not configured), the trigger does nothing, and the notification is still saved.
- **`/api/push` (Vercel, `api/push.ts` + `lib/push/`).**
  - Compares `x-push-secret` with `PUSH_WEBHOOK_SECRET`. A wrong or missing secret gets 401.
  - With the service role, it loads the notification. If it already has `pushed_at`, it does nothing, so pg_net retries are idempotent.
  - It reads the recipient's `notif_prefs`. If the type is turned off, it only sets `pushed_at`.
  - **«Me sirvió» on a letrero:** at most one push per hour per letrero. If another `sign_helpful` of the same letrero got `pushed_at` in the last hour, this one is not pushed.
  - It builds the text and sends it with `web-push` (VAPID) to **all** of the recipient's `push_subscriptions`.
  - Subscriptions that answer 404 or 410 are deleted.
  - It sets `pushed_at`, and answers `{ sent, skipped }`.
- **Push text: who did it and a piece of the content**, cut to 80 characters with «…». The name comes from `profiles_public.display_name`.

  | Kind | Title | Body | When tapped, opens |
  |---|---|---|---|
  | `answer` | «{Nombre} respondió tu pregunta» | text of the answer | `/p/{question}` |
  | `comment` | «{Nombre} comentó en un hilo» | text of the comment | `/p/{question}` |
  | `helpful` | «A {Nombre} le sirvió tu respuesta» | text of the answer | `/p/{question}` |
  | `sign_helpful` | «A {Nombre} le sirvió tu letrero» | title of the letrero | `/l/{sign}` |
  | `contact_request` | «{Nombre} te pide tu contacto» | text of the question | `/p/{question}` |
  | `contact_accepted` | «{Nombre} aceptó compartir su contacto» | «Ábrelo para ver cómo escribirle» | `/p/{question}` |
  | `urgent` | «Pregunta urgente en {Zona}» | text of the question | `/p/{question}` |

  If the item was deleted or hidden, the push is not sent (it only sets `pushed_at`).
- **Preferences (`profiles.notif_prefs`).**
  - Four booleans: `answers` (answers, comments, and later the T28 reminder), `helpful` (both kinds of «Me sirvió»), `contacts` (request and acceptance) and `urgent`.
  - A missing key means **on**.
  - They only filter the push; the bell (T24) always gets everything.
  - The exception is `urgent`: whoever turned it off does not even get the notification row, as the wiki says («a los vecinos con el aviso de urgentes encendido»).
- **Subscriptions.** RPC `save_push_subscription(endpoint, p256dh, auth)` (security definer) upserts by `endpoint` and assigns it to the caller. A shared phone moves from one account to the other. `delete_push_subscription(endpoint)` only deletes the caller's own.
- **Contract (`src/data/`).** New namespace `push` in `DataApi`:
  - `getPrefs(): Promise<NotifPrefs>`
  - `setPrefs(prefs: NotifPrefs): Promise<NotifPrefs>`
  - `saveSubscription(sub: PushSubscriptionInput): Promise<void>`
  - `deleteSubscription(endpoint: string): Promise<void>`

  It has a Supabase adapter (`src/data/supabase/push.ts`), a mock adapter (in memory, with no real push) and hooks (`src/data/hooks/push.ts`).
- **Device (`src/push/device.ts`).**
  - `pushSupport()` returns one of: `'ok' | 'ios-not-installed' | 'unsupported' | 'denied'`. iOS without `display-mode: standalone` counts as not installed.
  - `enablePush()` does `Notification.requestPermission()`, then `pushManager.subscribe` with `VITE_VAPID_PUBLIC_KEY`, then `saveSubscription`.
  - `disablePushOnThisDevice()` runs `deleteSubscription` and then `unsubscribe()`.
- **Service worker (`src/sw.ts` from T26).**
  - On `push`: `showNotification(title, { body, icon, badge, tag, data: { url } })`.
  - On `notificationclick`: focus an open app window and navigate it to `url`, or open a new one.
- **Asking for permission (`PushPrompt`).**
  - It appears **once per device**, after the person's **first publication** (question, answer or letrero), and only if permission is `default` and push is supported or the device is an iPhone without the app installed.
  - Its title depends on what was published:
    - Question: «¿Te avisamos cuando te respondan?»
    - Answer: «¿Te avisamos cuando le sirva o te comenten?»
    - Letrero: «¿Te avisamos cuando a alguien le sirva tu letrero?»
  - Buttons: «Sí, avísame» / «Ahora no».
  - On iPhone without the app installed, «Sí, avísame» shows the steps «Agrega BoliviaSabe a tu pantalla de inicio»: Compartir → «Agregar a inicio» → open it from the icon, with the notice «Después entra otra vez con tu cuenta».
  - Mounted at the router root, so it also appears in `/p/:id`.
- **Ajustes › Notificaciones (YoPage, `NotificationSettings`).** A status line with its action:
  - «Activar notificaciones» (button).
  - «Activadas en este celular».
  - «Bloqueadas: actívalas en los ajustes del navegador».
  - On iPhone: «Primero agrega BoliviaSabe a tu pantalla de inicio» (opens the same steps).
  - «Este navegador no permite notificaciones».

  Below are **4 switches**: «Respuestas, comentarios y recordatorios», «Me sirvió», «Contactos», «Urgentes en mi zona». The switches are saved per account and work even without permission.
- **Cerrar sesión** first runs `disablePushOnThisDevice()`, and only then signs out. If deleting the subscription fails, it still signs out.
- **Secrets.**
  - `PUSH_WEBHOOK_SECRET` goes in `.env.example`, in Vercel (Production and Preview) and in Vault (`push_secret`).
  - `VAPID_PRIVATE_KEY` is already in Vercel.
  - The VAPID subject is `mailto:boliviasabe.app@gmail.com`, the public contact email.
- **Wiki first.** New closed gaps, and a change to `flujo-final › Datos → Push` (pg_net + Vault instead of the panel webhook), as listed in the Decisions section.

**Not in:**

- The PWA itself: manifest, icons, offline, installation and «Instalar la app» (T26 and T29).
- The bell and the list of notices (T24, Aldrin). T27 only leaves the notification rows ready.
- The 24 h reminder «¿Alguna respuesta te sirvió?» and its `pg_cron` (T28). T27 leaves `/api/push` ready to send it under `answers`.
- Badges on the app icon, notification sounds and per-zone subscriptions beyond the profile's own zone.
- «Mi celular» and the rest of Ajustes (T29).
- Grouping several notifications into one push, other than the hourly limit for a letrero.

## Data model

```sql
-- 0008_push.sql
create extension if not exists pg_net;

alter table public.notifications add column actor_id bigint references public.profiles (id);
alter table public.notifications add column pushed_at timestamptz;
create index notifications_kind_ref_pushed_idx on public.notifications (kind, ref_id, pushed_at);
create index notifications_user_kind_created_idx on public.notifications (user_id, kind, created_at);
```

```ts
// src/data/api.ts
export type NotifPrefs = { answers: boolean; helpful: boolean; contacts: boolean; urgent: boolean };
export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string };
export type NotificationKind =
  | 'answer' | 'comment' | 'helpful' | 'sign_helpful' | 'contact_request' | 'contact_accepted' | 'urgent';
```

```ts
// lib/push/message.ts
type PushMessage = { title: string; body: string; url: string; tag: string };
// tag: `${kind}-${ref}`, so a repeated push replaces the previous one
```

Vault: `push_url` (`https://boliviasabe.vercel.app/api/push`; locally `http://host.docker.internal:3000/api/push`) and `push_secret`.

Device storage: `localStorage['bs.pushAsked'] = '1'` after the prompt has been shown.

## Implementation plan

1. **Wiki.** Add the closed gaps from Decisions to `huecos-cerrados.md`, update `log.md` and the counts in `index.md`, and change `flujo-final › Datos → Push`. Then push `boliviasabe-docs`.
2. **Migration `0008_push.sql` + RLS tests.**
   - Columns, the new triggers and the updated existing ones (`actor_id`).
   - The trigger on `questions.urgent_until` with the cap of 3 per hour and the `urgent` preference.
   - The pg_net trigger, the subscription RPCs and the grants.
   - In `supabase/tests/rls.sql`: who receives each kind, no self-notifications, the 3 per hour urgent cap, the upsert that moves an endpoint between accounts, and that nobody can read someone else's subscriptions.
   - Applied **only locally**.
3. **`/api/push` + `lib/push/`** (`message.ts`, `send.ts`), and `PUSH_WEBHOOK_SECRET` in `.env.example`.
   - Locally: insert a notification, and check that `/api/push` (with `vercel dev`) marks `pushed_at` and respects the preferences and the hourly limit per letrero.
4. **Contract + adapters + hooks.**
   - The `push` namespace, `NotifPrefs`, Supabase and mock.
   - `src/push/device.ts`.
   - Cerrar sesión deletes the subscription.
5. **Service worker.** `push` and `notificationclick` in `src/sw.ts`.
6. **UI.**
   - `NotificationSettings` in Ajustes.
   - `PushPrompt` with the iPhone steps, wired to the first publication of a question (`ShellLayout`), an answer (`AnswerBox`) and a letrero (`ShellLayout`).
   - Light and dark mode, 360 px, text at 130 %.
7. **Production (with Diego's permission).**
   - `db push` of `0008`.
   - `PUSH_WEBHOOK_SECRET` in Vercel.
   - The two Vault secrets, set in the SQL editor.
   - Phone test on Android and on an iPhone with the app installed.
   - Spec set to Implemented.

## Acceptance criteria

- [ ] `npm run typecheck` and `npm run build` pass. The RLS tests (including the new ones) pass locally.
- [ ] Each kind in the table creates a notification row with the right recipient and `actor_id`, and never one for whoever caused it.
- [ ] A neighbor who already got 3 `urgent` in the last hour does not get a 4th. Whoever has `urgent: false` does not get the row.
- [ ] `/api/push` answers 401 without the right secret, and does not send twice the same notification (`pushed_at`).
- [ ] With a type turned off in Ajustes, the row exists but no push arrives. Turning it back on makes the next one arrive.
- [ ] Two «Me sirvió» on the same letrero within the same hour send only one push.
- [ ] A new answer from account A reaches account B's phone (Android Chrome, production) as a push with the name and the text. Tapping it opens `/p/{id}`.
- [ ] On an iPhone with the app installed, after giving permission, a push arrives.
- [ ] The prompt appears after the first publication and never again on that device. On an iPhone in Safari, it shows the steps to add the app to the home screen.
- [ ] Ajustes shows the right status line for each case (activate, active, blocked, iPhone not installed, unsupported), and the 4 switches are saved and survive a reload.
- [ ] After Cerrar sesión, that device's row in `push_subscriptions` is gone and no more pushes arrive there.
- [ ] A subscription that answers 410 is deleted.
- [ ] Mock mode: Ajustes and the prompt work without errors, and the switches are kept during the session.
- [ ] `git grep -i "SECRET\|SERVICE_ROLE"` shows no values. The private VAPID key and the push secret do not appear in `dist/`.

## Decisions

- **T26 goes first, in its own spec and PR**, using `injectManifest` with `src/sw.ts`. Push needs a service worker, and iPhone needs the app installed. One service worker in TypeScript is better than `generateSW` plus a loose JS file. *Discarded:* T26 inside T27, which would be a huge PR, and a push-only service worker.
- **Every event in the wiki except the reminder enters T27**, with the triggers that were missing. This also leaves the bell of T24 ready. *Discarded:* only answer and «Me sirvió».
- **pg_net from a trigger, with the URL and the secret in Vault**, instead of the panel's Database Webhook. The code lives in the migration, and the same mechanism serves T28. *Discarded:* the panel webhook (not in the repo), and the browser calling `/api/push` (it can be skipped or duplicated).
- **T27 builds Ajustes › Notificaciones.** «Listo cuando» asks it to respect the 4 switches, so it has to be testable from the screen. T29 keeps the rest of Ajustes.
- **The permission is asked after the first publication of any kind** (question, answer or letrero), with text matching what was published, once per device. *Discarded:* only after a question.
- **Comments notify everyone in the thread** (author of the answer, author of the question, and previous commenters). *Discarded:* only the two owners.
- **The push shows who and a piece of the text** (80 characters). *Discarded:* generic text, which is more private but less useful.
- **Preferences filter the push, not the bell**, except `urgent`, which filters the row too, because the wiki sends urgent questions only to those who have the notice on. A missing key means on.
- **`actor_id` and `pushed_at` in `notifications`.**
  - `actor_id`: the name is needed for the push and for the bell.
  - `pushed_at`: it makes `/api/push` idempotent, and it implements the hourly limit per letrero with no extra table.
- **The upsert of a subscription moves the endpoint to the account that signs in.** On a shared phone, only whoever is signed in gets the notices.
- **Only one place enforces the «3 urgent per hour» limit:** the SQL trigger, so the bell and the push agree.

## Risks

- **T26 not merged yet:** without a service worker nothing can be tested on a phone. Mitigation: do T26 first (it is small).
- **iPhone:** push only works with the app installed (iOS 16.4+). Mitigation: the steps in the prompt and in Ajustes. Test on an iPhone early in step 7.
- **pg_net is asynchronous:** if `/api/push` fails, the push is lost, but the row and the bell are still there. That is acceptable for the MVP. Retries come for free when the same row is resent, because `pushed_at` makes it idempotent.
- **Vault not configured** in production: no push arrives, and no error is shown. Mitigation: step 7 checks it with a real push before closing.
- **Wrong `zone_norm`** (zones typed by hand): an urgent question only reaches exact matches after normalization. This is accepted by the wiki.
