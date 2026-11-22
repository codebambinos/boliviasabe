# SPEC 22 — Avisos: the data (SQL, Realtime and `src/data`)

> **Status:** Approved
> **Depends on:** SPEC 01 (`src/data/` interface, mock and hooks), SPEC 11 (Supabase adapter, `rpc`, `item_visible`), SPEC 12 (`contact_requests`, `contact_json`, the question's live channel), SPEC 15 (the `notifications` rows and their triggers), SPEC 18 (`reminder` rows). Board card: T40 (issue #62). Unblocks T24 (issue #17, Aldrin, interface only).
> **Date:** 2026-11-21
> **Objective:** Give the Avisos sheet everything it needs from `src/data`: the person's notices already built (who, what, where it opens, whether it still exists, the contact state), grouped «Me sirvió» per letrero, the unread count live, and marking read, with the same contract in the mock and in Supabase.

## Why this spec exists

- Since T26–T28 the triggers write a row in `notifications` for every answer, comment, «Me sirvió», contact request, acceptance, urgent question and reminder. Push already uses them, through `push_details`.
- Nothing reads them in the app. The bell in `ShellLayout` shows `unread: 0`, and the Avisos sheet does not exist yet.
- Aldrin builds the sheet in T24 without touching the database or `src/data` (decision of Diego, 21 Nov). He needs a closed contract and a mock with every kind of notice, as soon as possible.
- The wiki already says what Avisos shows (`flujo-final` › 3 · Yo › Avisos, #110, #126, #150, #202). It does not say how «Me sirvió» are grouped, how the count stays live or how many notices the list keeps. Diego decided those in this spec (wiki #214).

## Scope

**In:**

- **Migration `supabase/migrations/0010_notices.sql`.**
  - `notice_item(n notifications)`: for one row, the text, the zone, what it opens (`question` or `sign` and its id) and whether that still exists for the caller (`item_visible`). Same rules per kind as `push_details`.
  - `my_notifications(p_offset int default 0)`: the caller's notices, 30 per page, newest first. Rows of `sign_helpful` for the same letrero are one notice. Each notice carries `contact_json` for `contact_request` and `contact_accepted`.
  - `my_unread_notices()`: how many notices (after grouping) have something unread.
  - `mark_notice_read(p_id bigint)`: marks that row. When it is a `sign_helpful`, it marks the whole group of that letrero.
  - `mark_all_notices_read()`.
  - All of them are `security definer`, only for the caller (`current_profile_id()`), and granted to `authenticated` only.
  - `notifications` is added to the `supabase_realtime` publication. RLS (`0002`) already lets each person read only their own rows.
- **`src/data`.**
  - Types `NoticeKind`, `Notice` and `NoticePage` in `types.ts`.
  - `notices` (`list`, `unreadCount`, `markRead`, `markAllRead`) and `live.notices` in `api.ts`.
  - The Supabase adapter `src/data/supabase/notices.ts`. `live.notices` goes in `threads.ts`, next to `live.question`.
  - The mock: notices of the 8 kinds, including a grouped `sign_helpful`, one unavailable and one pending contact request. Marking read works.
  - Keys `notices()`, `noticeList()` and `unreadNotices()`, all personal (cleared on sign-out and on account change).
  - Hooks in `src/data/hooks/notices.ts`: `useNotices`, `useUnreadNotices`, `useMarkNoticeRead` and `useMarkAllNoticesRead`.
  - `useRespondContact` also refreshes the notices, so «Aceptar» or «Ahora no» changes the notice too.
- **Bell count.** `ShellLayout` passes `useUnreadNotices()` instead of `0`. The bell already draws the number. The sheet is still T24.
- **Tests.** A `0010` block in `supabase/tests/rls.sql`.
- **The remote migration**, applied only with Diego's permission.
- **Wiki #214 and the T24 ticket** with the final contract.

**Not in:**

- The Avisos sheet, its rows, texts, empty state and buttons. That is T24 (Aldrin).
- Marking read when a push is tapped. The push opens the item. Marking read happens when the notice is tapped in the sheet.
- Deleting notices, or hiding old ones.
- Changing the triggers, `push_details` or `/api/push`. Push keeps working as it is.
- New kinds of notice.

## Data model

No new table. `notifications` stays as it is (`0001`, `0003`, `0008`, `0009`).

**Contract for T24 (`src/data/types.ts`):**

```ts
export type NoticeKind =
  | 'answer' | 'comment' | 'helpful' | 'sign_helpful'
  | 'contact_request' | 'contact_accepted' | 'urgent' | 'reminder';

export type Notice = {
  /** The newest row of the notice; what `markRead` takes. */
  id: Id;
  kind: NoticeKind;
  /** The newest row's date (ISO). */
  createdAt: string;
  /** False while any row of the notice is unread. */
  read: boolean;
  /** Who caused it (the newest in a group). Null on `reminder`. */
  actor: string | null;
  /** How many «Me sirvió» are in the group. 1 for every other kind. */
  count: number;
  /** The piece of text: the answer, the comment, the letrero's title or the question. Null when it is gone. */
  text: string | null;
  /** Only `urgent`: the question's zone. */
  zone: string | null;
  /** Where it opens: `/p/:id` or `/l/:id`. Null = «Esto ya no está disponible» (deleted, hidden by me or in review). */
  open: { kind: 'question' | 'sign'; id: Id } | null;
  /** `contact_request` and `contact_accepted`: the same state as the thread (Aceptar / Ahora no, or the contact once accepted). */
  contact: ContactState | null;
};

export type NoticePage = { items: Notice[]; nextOffset: number | null };
```

**`api.ts`:**

```ts
notices: {
  /** 30 per page, newest first. «Me sirvió» of the same letrero come as one notice. */
  list(offset?: number): Promise<NoticePage>;
  /** Notices with something unread (a group counts once). */
  unreadCount(): Promise<number>;
  /** Marks that notice; for a grouped `sign_helpful`, the whole group. */
  markRead(id: Id): Promise<void>;
  markAllRead(): Promise<void>;
};
live: {
  /** Calls `onChange` when one of my notifications is inserted or updated. The mock never connects. */
  notices(onChange: () => void, onStatus?: (connected: boolean) => void): () => void;
};
```

**Hooks:**

| Hook | What it does |
|---|---|
| `useNotices()` | `useInfiniteQuery` over `notices.list`, with `nextOffset` as the next page. Only when signed in. |
| `useUnreadNotices()` | The bell's number. It subscribes to `live.notices`, and every event refreshes the count and the list. If the channel is not connected, it refetches every 60 s. Returns `0` for a guest, with no request. |
| `useMarkNoticeRead()` | `mutate(notice)`. It marks the notice read in the cache right away, then calls `markRead(notice.id)` and refreshes the count. On error it puts the cache back. |
| `useMarkAllNoticesRead()` | Same, for every notice. |

**Rules per kind** (`notice_item`, same as `push_details`):

| Kind | `ref_id` | `text` | `open` | Visibility checked on |
|---|---|---|---|---|
| `answer` | question | the actor's latest answer in that question | question | that answer |
| `comment` | comment | the comment | its answer's question | the comment |
| `helpful` | answer | the answer | its question | the answer |
| `sign_helpful` | sign | the title | sign | the sign |
| `contact_request` / `contact_accepted` | contact request | the question | question | the question |
| `urgent` / `reminder` | question | the question (+ `zone` on `urgent`) | question | the question |

«Visible» means the row still exists and `item_visible(kind, id, author)` is true. That function checks it is not hidden by me and not in review (3 reports), unless it is mine. When it is not visible, `open` and `text` are null.

## Implementation plan

1. **Wiki and board.**
   - In `boliviasabe-docs`: add #214 (contact state in the notice, one group per letrero, unread counted per notice, Realtime + 60 s, pages of 30 with no limit), plus `log.md` and the `index.md` count. Push.
   - Rewrite the contract in issue #17 (T24): `contact` replaces `contactRequestId`, and `NoticePage` is added.
2. **Types, interface, keys and mock.**
   - `types.ts`, `api.ts`, `keys.ts` (personal), the mock with the 8 kinds, and `hooks/notices.ts`.
   - Exported from `src/data/index.ts`. The Supabase adapter throws «not ready» for `notices` for now, so typecheck passes.
   - **This step is pushed alone, so Aldrin can start T24 on the mock.**
3. **Migration `0010_notices.sql`** with the five functions, the grants and the publication. Plus the `rls.sql` block. Test it on the local stack (`npx supabase start`, `db reset`, `rls.sql`).
4. **Supabase adapter.** `supabase/notices.ts`, `live.notices` in `threads.ts`, and the refresh in `useRespondContact`.
5. **Bell.** `ShellLayout` uses `useUnreadNotices()`.
6. **Production.**
   - With Diego's permission: `npx supabase db push --remote --yes`.
   - Check with read-only queries on Diego's test accounts.
   - Open the PR (`Closes #62`).

## Acceptance criteria

**Database (local stack, `rls.sql`):**

- [ ] `my_notifications()` returns only the caller's rows. Another user's are never there.
- [ ] Three `sign_helpful` on the same letrero, from three neighbors, come as one notice: `count = 3`, the newest `id` and `actor`, and `read = false` while any of them is unread.
- [ ] `mark_notice_read(<id of the group>)` marks the three. `mark_notice_read` on another user's row changes nothing.
- [ ] `mark_all_notices_read()` leaves `my_unread_notices() = 0`.
- [ ] `my_unread_notices()` counts a group once.
- [ ] A notice whose question was deleted, or whose item I hid, or whose item has 3 reports (and is not mine), has `open = null` and `text = null`.
- [ ] A `contact_request` carries `contact.status = 'pending'`. After `respond_contact(…, true)`, the requester's `contact_accepted` carries `status = 'accepted'` and `other`.
- [ ] Page 2 (`p_offset = 30`) continues without repeating, and `nextOffset` is null on the last page.
- [ ] `anon` cannot call any of the five functions.
- [ ] `notifications` is in the `supabase_realtime` publication.

**App:**

- [ ] With the mock: `useNotices` returns the 8 kinds, one of them grouped (`count > 1`), one unavailable (`open = null`) and one pending contact request. `useMarkNoticeRead` and `useMarkAllNoticesRead` lower the number.
- [ ] With Supabase, signed in: the bell shows the real number of unread notices.
- [ ] A new answer from another account raises the bell's number by itself in less than 5 s, without reloading.
- [ ] With the Realtime channel blocked, the number still updates within 60 s.
- [ ] A guest makes no notice request (no 401 in the console), and the bell shows nothing.
- [ ] On sign-out, and when signing in with another account, the notices of the previous person are not kept.
- [ ] Push still arrives as before (one answer from a test account).

**Code:**

- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] `git grep -i "SECRET\|SERVICE_ROLE"` shows no values.
- [ ] Wiki #214, issue #17 and `types.ts` describe the same contract.

## Decisions taken and discarded

| Decision | Discarded | Why |
|---|---|---|
| The notice carries the full `ContactState` (built by `contact_json`) | Only opening the thread | Wiki #110 says the contact shows «también en el aviso». «Aceptar / Ahora no» disappear once answered, and T24 reuses the thread's contact box. (Diego) |
| One notice per letrero for `sign_helpful`, placed by its newest vote; unread counted per notice | One group per letrero per day | A shorter list. A new vote brings the group back up as unread. (Diego) |
| Realtime on `notifications` + 60 s refetch when it is not connected | Only refetching every 30 s | The wiki promises live notices (#19), and the threads already use the same pattern. (Diego) |
| Pages of 30, newest first, nothing deleted | Only the last 30 days | Few rows, and no new rule. (Diego) |
| A new `notice_item` helper; `push_details` is not touched | Refactoring `push_details` to share it | Push works in production. A small duplication of the per-kind rules costs less than a risk on the day of the deadline. |
| Visibility through `item_visible` (my own item in review stays open for me) | The rule of `push_details` (3 reports hide it for everyone) | The same rule as the lists and Mi actividad (#213): an author sees their own content «En revisión». |
| Mark read with RPCs (`mark_notice_read`, `mark_all_notices_read`) | Updating `read_at` from the client | A group is marked in one call, and the rule lives in one place. |
| The step with the contract and the mock is pushed first | Everything in one PR at the end | Aldrin can start T24 right away. |
| The bell count is wired in this spec | Leaving it to T24 | It is one line, and it proves the live count end to end. |

## Identified risks

- **Realtime with RLS on `notifications`.** Postgres Changes only delivers rows that the subscriber can select. The filter `user_id=eq.<my profile id>` keeps the traffic small, and the policy is the real guard. If the channel never connects, the 60 s refetch covers it.
- **Sign-out race (the 401 seen in T21).** Notice queries run only while signed in (`enabled`), and their keys are personal, so the reset on sign-out does not fire a request without a session.
- **Grouping and offset.** Paging over groups (not rows) keeps pages stable. A new notice arriving while scrolling can repeat one item at a page edge. The list is refreshed on every event, so it fixes itself.
- **The migration is applied before the code is deployed.** The new functions are only additive, and the current app does not call them, so nothing breaks in between (unlike `0009`).
- **The cost of `my_notifications` per row** (`item_visible`, `contact_json`). It runs on 30 groups per page and on indexed tables, which is fine for the volume of the demo.
