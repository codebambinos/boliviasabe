# SPEC 02 — Privacy page and About sheet

> **Status:** Implemented
> **Depends on:** SPEC 01. Board card: T30 (issue #23).
> **Date:** 2026-11-20
> **Objective:** Publish a public `/privacidad` page and an «Acerca de» sheet in the «Letrero» direction, both open without an account and linked from Yo and from the «Crea tu cuenta» sheet.

## Why this spec exists

Google requires a public privacy URL before the login can leave «Testing» mode (wiki #56). The wiki also promises an «Acerca de» with the contact e-mail (#129, #132) and explains account deletion by e-mail (#113). The app has no router yet (T12 is pending), so this spec mounts the smallest router that gives `/privacidad` a real URL. It does not take over T12's work.

## Scope

**In:**

- A minimal React Router setup (`react-router` 8.5.2, already installed) with two routes: `/` renders the current `App`, and `/privacidad` renders the privacy page. Any other path redirects to `/`.
- `PrivacyPage`: its own page with no tab bar, FAB, balance or bell. It has the 3 px aguayo stripe, a bar with «← Volver» and the logo, and the text in one reading column (max 40 rem).
- `AboutSheet`: a `Sheet` with `variant="page"` (a full page on a phone, a window on desktop) opened from Yo. It shows what BoliviaSabe is, CodeBambinos, the team, the contact e-mail and a link to Privacidad.
- Draft copy for both, in Bolivian Spanish, built only from wiki facts. It lives in one copy file so Yaeko can correct it without touching components.
- Links in three places:
  1. Yo as a guest: «Acerca de · Privacidad» as quiet links under the profile card.
  2. Yo with an account: two 56 px rows, «Acerca de» and «Privacidad», in the Ajustes card before «Cerrar sesión».
  3. The «Crea tu cuenta» sheet (`AuthSheet`): one line at the foot, «Al entrar aceptas cómo cuidamos tus datos», with «cómo cuidamos tus datos» linking to `/privacidad` in a new tab.
- Returning from `/privacidad` to Yo keeps the Yo tab (interim, until T12 adds `/yo`).
- `vercel.json` with an SPA rewrite so `/privacidad` opens directly on Vercel.

**Out of scope (for future specs):**

- The rest of the routes (`/preguntas`, `/yo`, `/p/:id`, `/l/:id`, `/nueva-contrasena`) and moving tabs to URLs. That is T12.
- An `/acerca` route. The wiki lists no such route; Acerca de stays a sheet.
- The final Ajustes card (notifications, Comparto, Instalar la app). That is T29.
- An account deletion flow. It is out of the MVP (#113); the page explains how to ask by e-mail.
- Social links. There are no official accounts yet (#132).
- Final copy. Yaeko reviews the draft; her corrections are a copy-only change.
- Keeping the list scroll position when coming back from `/privacidad`.

## Data model

This feature introduces no data in `src/data/` and no tables. It reuses the session from SPEC 01 only to decide which Yo variant shows the links.

New static copy, typed so each component renders headings and paragraphs from one place:

```ts
// src/content/legal.ts (shape, not final code)
type Section = { title: string; paragraphs: string[] };

export const CONTACT_EMAIL = 'boliviasabe.app@gmail.com';

export const PRIVACY: {
  title: 'Privacidad';
  updated: string;      // «Actualizado el 20 de noviembre de 2026»
  intro: string;
  sections: Section[];  // see the list below
};

export const ABOUT: {
  title: 'Acerca de';
  what: string;         // what BoliviaSabe is, one or two sentences
  team: { org: 'CodeBambinos'; people: ['Diego', 'Aldrin', 'Yaeko'] };
  contactLabel: string; // «Escríbenos»
};
```

Privacy sections, in this order, each built only from the wiki:

1. **Qué guardamos:** name, e-mail, city and zone; phone number only if you choose to share it (wiki › Ajustes › Comparto). Your letreros, photos, questions and answers.
2. **Para qué:** to show your posts to your neighbors, to let you log in, and to send you the yapitas you earn.
3. **Qué ven los demás:** your name as «Nombre I.» and your posts. Your e-mail or phone only when you accept a contact request.
4. **Tus yapitas:** this is a test network with no real money («Red de pruebas, sin dinero real»). Each yapita is written in a public record that nobody can change. It uses neighbor words, never cripto, blockchain or XLM.
5. **Borrar tu cuenta:** write to `boliviasabe.app@gmail.com` from your account's e-mail and we delete it.
6. **Contacto:** the same e-mail as a `mailto:` link.

Route state for the interim tab memory:

```ts
// history entry state on '/', read by App on mount
type HomeState = { tab?: Tab }; // Tab from src/components/AppShell.tsx
```

## Implementation plan

1. Add `vercel.json` with one rewrite. Every path that is not under `/api/` and has no file extension goes to `/index.html`. `npm run build` still passes.
2. Create `src/router.tsx` with `createBrowserRouter`: `/` → `App`, `/privacidad` → a placeholder `PrivacyPage`, `*` → redirect to `/`. In `src/main.tsx`, render `RouterProvider` inside `QueryClientProvider`. Manual test: `/` behaves as before, `/privacidad` shows the placeholder, `/x` goes to `/`.
3. Create `src/content/legal.ts` with the draft copy for both screens (the data model above).
4. Build `src/pages/PrivacyPage.tsx` and `src/pages/privacy-page.css`. The page uses the aguayo stripe, a bar with «← Volver» (an `icon-btn` plus label, 44 px target) and the logo. It has an `h1` «Privacidad» in display size (Bricolage 500), the updated line in `--color-muted`, `h2` sections at 22, body Figtree 16/1.5, and a 40 rem column with a 16 px gutter. The e-mail is a `mailto:` link in `--color-brand-text`. Volver goes back in history when there is an in-app entry (`location.key !== 'default'`); otherwise it goes to `/`. The page sets `document.title` to «Privacidad · BoliviaSabe» and moves focus to the `h1` on mount. Tokens only, no new colors.
5. Build `src/components/AboutSheet.tsx` (plus `about-sheet.css` only if `app.css` lacks a needed class). It is a `Sheet` with `variant="page"` and a bar with «Acerca de» and ✕. The body has three blocks:
   - what BoliviaSabe is;
   - «Hecho por CodeBambinos» with Diego, Aldrin and Yaeko;
   - «Escríbenos» with the `mailto:` link and a «Privacidad» link to `/privacidad`.
   No Tilcho (Yo-only applies to the tab, and the sheet covers it). No filled fuchsia button: the sheet has no main action.
6. Interim tab memory. `App` reads its initial tab from `location.state.tab` (default `'hoy'`). Every Yo link to `/privacidad` first replaces the current entry with `{ tab: 'yo' }`, then pushes `/privacidad`. Browser Back, Android back and «← Volver» all land on Yo. Leave a comment pointing to T12.
7. Wire the links in the Yo tab of `src/App.tsx`:
   - As a guest: a line under the profile card with «Acerca de» (opens `AboutSheet`), « · », and «Privacidad» (goes to `/privacidad`), using `link-btn`.
   - With an account: two `.rows` entries (56 px, hairline) in the Ajustes card before «Cerrar sesión». Each row has a leading glyph from `icons.tsx` and a chevron.
8. Add the foot line to `src/components/AuthSheet.tsx`: «Al entrar aceptas cómo cuidamos tus datos», at 14 px in muted text. The link opens `/privacidad` with `target="_blank" rel="noopener"`, so the sheet and anything typed stay put (wiki › Entrada y cuenta). It shows in both the choose and e-mail modes.
9. Ask Yaeko to review `src/content/legal.ts` and note it in the PR. Her changes touch only that file.

## Acceptance criteria

- [x] Opening `/privacidad` directly (dev server and `vite preview`) shows the privacy page with no session, no tab bar and no FAB.
- [x] After deploying to Vercel, opening `https://<deploy>/privacidad` directly returns the page, not a 404.
- [x] Any unknown path such as `/abc` redirects to `/`.
- [x] The privacy page shows the six sections in order, the e-mail as a working `mailto:` link, and the «Red de pruebas, sin dinero real» line.
- [x] Neither screen contains «XLM», «estelares», «tokens», «cripto», «blockchain», «puntos» alone or an amount in bolivianos (`git grep` on `src/content/legal.ts`).
- [x] As a guest in Yo, the «Acerca de · Privacidad» links appear under the profile card.
- [x] With an account in Yo, the Ajustes card shows «Acerca de» and «Privacidad» rows before «Cerrar sesión».
- [x] From Yo, opening Privacidad and then pressing «← Volver», browser Back or Android back lands on the Yo tab.
- [x] Opening `/privacidad` from a fresh tab and pressing «← Volver» goes to `/` (Hoy).
- [x] «Acerca de» opens as a full page on a 360 px phone and as a window on desktop. Escape, ✕ and Android back close it, and focus returns to the link that opened it.
- [x] Acerca de shows CodeBambinos, Diego, Aldrin and Yaeko, and the contact e-mail. It shows no social links and no Tilcho.
- [x] The «Crea tu cuenta» sheet shows the foot line in both modes. Its link opens `/privacidad` in a new tab, and the sheet keeps any typed e-mail.
- [x] Both screens pass at 360, 768 and 1280 px, in light and dark, with text at 130 %. There is no horizontal scroll and the text column stays at 40 rem or less.
- [x] Both screens use only tokens from `src/styles/tokens.css`. Each view has at most one filled fuchsia button (here, none).
- [x] `npm run typecheck` and `npm run build` pass.
- [x] The PR body has `Closes #23` and notes that the copy is a draft pending Yaeko's review.

## Decisions

- **Yes:** a minimal router with only `/` and `/privacidad`. Google needs a real URL, and `react-router` is already pinned. T12 extends this router instead of replacing it.
- **No:** full routing now. That is T12's scope and would collide with it.
- **Yes:** Acerca de as a `Sheet variant="page"`. The wiki lists `/privacidad` but no `/acerca`, and the sheet already gives back, Escape and focus behavior for free.
- **No:** an `/acerca` route. It would be a product change and need a wiki entry first.
- **No:** sheets only, without a router. `/privacidad` would not be a public URL Google can open.
- **Yes:** the privacy page sits outside the shell, with its own page and «← Volver». Balance, bell and tabs add nothing to a legal page read from Google or a link.
- **Yes:** a draft copy written from wiki facts only, kept in `src/content/legal.ts`. Yaeko has not delivered the texts. One file lets her edit without touching components.
- **Yes:** team shown by first name only (Diego, Aldrin, Yaeko) under CodeBambinos.
- **Yes:** links in all three places (Yo as guest, Ajustes in Yo with an account, the account sheet). It meets both the issue and `reglas-finales.md` › Cuenta y acceso.
- **Yes:** the account sheet opens Privacidad in a new tab. Leaving the sheet would break «Cerrar la hoja → vuelve a donde estaba, sin perder lo escrito».
- **Yes:** remember the Yo tab through history state until T12. Without it, Back would remount `App` on Hoy and break «Volver regresa a donde estabas».
- **Yes:** `vercel.json` SPA rewrite now. Without it, a direct `/privacidad` returns 404 on Vercel.
- **No wiki change needed.** Every flow here already exists in the wiki; only the interim tab memory is technical.

## Risks

| Risk | Mitigation |
| --- | --- |
| `Sheet` listens to `popstate` and pushes its own history entries, and the router does too | Test opening and closing AboutSheet and AuthSheet with Android back and browser Back after the router lands. The sheet entries keep the same URL, so the router re-renders `/` with no change. |
| `App.tsx` is a temporary smoke view, so T21 and T29 may drop the links when they rebuild Yo | Put the links in small components (`AboutLinks`, rows) and mention them in the T21 and T29 issues. |
| The draft copy says something the team does not do with data | Each sentence comes from a wiki rule; Yaeko and Diego review before Google's production switch. |
| The rewrite also catches `/api/*` once functions exist | The rewrite excludes `/api/` and any path with a file extension. |
| Logo is dark ink on the dark ground (DESIGN.md open item) | Reuse the same light tile the top bar uses. |

## What is **not** in this spec

- The other routes and tabs as URLs (T12).
- An `/acerca` route.
- Account deletion inside the app.
- Social links.
- The final Ajustes card (T29).
- Final copy from Yaeko (a copy-only follow-up).

Each one of those, if it lands, goes in its own spec or task.
