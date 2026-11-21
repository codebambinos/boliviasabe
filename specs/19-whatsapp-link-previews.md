# SPEC 19 — WhatsApp link previews for questions and letreros

> **Status:** Approved
> **Depends on:** SPEC 10 and SPEC 11 (the `/p/:id` and `/l/:id` routes, the «Compartir por WhatsApp» buttons, and the `get_question` / `get_sign` functions that guests can call), SPEC 06 (the 480 px letrero thumbnail). Board card: T25 (issue #18).
> **Date:** 2026-11-21
> **Objective:** When a `/p/:id`, `/l/:id` or home link is pasted in WhatsApp, the preview shows the question or the letrero with its title, its neighborhood and a picture, while people who open the link keep getting the app exactly as today.

## Why this spec exists

- The share buttons already exist:
  - the «Pregúntale a tus grupos» card and Compartir in the question detail;
  - Compartir in the letrero detail.
- They send `https://wa.me/?text=` with the text and the link.
- `/p/:id` and `/l/:id` already open the detail without an account, and show «Esto ya no está disponible» for something deleted.
- What is missing is the preview:
  - The app is a SPA, and WhatsApp does not run JavaScript.
  - `index.html` has no Open Graph tags.
  - So a shared link arrives as a bare URL, without a title or a picture (wiki #91, `flujo-final` › Compartir).

## Scope

**In:**

- **Only preview bots go to the function (`vercel.json`).**
  - A rewrite with a `has` condition on the `user-agent` header sends `/p/:id` and `/l/:id` to `/api/og?kind=question|sign&id=:id`.
  - It applies only to the known preview bots: `WhatsApp`, `facebookexternalhit`, `Facebot`, `Twitterbot`, `TelegramBot`, `Slackbot`, `Discordbot`, `LinkedInBot`, `SkypeUriPreview`, `Pinterest`, `redditbot` and `Embedly`, case-insensitive. iMessage uses the `facebookexternalhit` / `Twitterbot` agent.
  - The rewrite goes before the SPA catch-all.
  - People (any other agent) keep getting `index.html`, with no function in between.
- **`GET /api/og` (`api/og.ts`).**
  - It validates `kind` (`question` | `sign`) and `id` (a positive integer). It reads the item with the **anon key** through `get_question(p_id)` / `get_sign(p_id)`.
  - So the bot sees exactly what a guest sees: deleted, hidden or in-review items fail with `P0002`.
  - It answers a small HTML page:
    - `<title>`, `og:title`, `og:description`, `og:image` (absolute URL), `og:url`;
    - `og:type=website`, `og:site_name=BoliviaSabe`, `og:locale=es_BO`, `twitter:card=summary_large_image`;
    - a visible link to the page.
  - Every value is HTML-escaped.
  - Headers: `content-type: text/html; charset=utf-8` and `cache-control: public, s-maxage=600, stale-while-revalidate=86400`.
  - A bad `kind` or `id`, an item that is not available, or a database error never fails. It answers the generic preview (see the table), with status 200, so WhatsApp still shows the brand.
- **What the preview says (UI copy, wiki #210).**

  | Link | `og:title` | `og:description` | `og:image` |
  |---|---|---|---|
  | Question | «¿Alguien sabe? <question>» | «Pregunta en <zona>, <ciudad>. Responde en BoliviaSabe.» | The question's photo, or the brand card |
  | Letrero | «<title> · <price>» (only «<title>» without a price) | «<zona>, <ciudad> · Letrero en BoliviaSabe» | The letrero's 480 px thumbnail (`thumbUrl`) |
  | Generic (home, deleted, error) | «BoliviaSabe» | «Lo que pasa hoy en tu ciudad, lo sabemos entre todos.» | The brand card |

  - The question text in the title is cut to 80 characters with «…».
  - The description is cut to 160 characters.
- **The brand card (`public/og.png`).**
  - 1200×630 PNG under 300 KB: the logo with «¿Alguien sabe?» on the light background `#F5F2EF`, with the ink and magenta colors of `tokens.css`.
  - Its source is `scripts/og/card.html`, which uses the brand font from `scripts/og/BricolageGrotesque.ttf` (OFL, with `OFL.txt`). It is rendered once in Chromium at 1200×630, and the screenshot is saved as `public/og.png`. The source, the font and the PNG are committed. (The first plan was `sharp`, but on macOS it ignores a font file and draws Helvetica.)
- **Home preview (`index.html`).** Fixed tags with the generic row of the table, plus `og:image` = `https://boliviasabe.vercel.app/og.png` with its width and height, and `twitter:card`.
- **Pure helpers (`lib/og/meta.ts`).**
  - `ogFor(item | null, origin)` returns `{ title, description, image, url }`.
  - `renderOgHtml(meta)` returns the HTML.
  - `escapeHtml`.
  - `api/og.ts` only fetches and calls them.
- **Wiki first (`boliviasabe-docs`).**
  - `huecos-cerrados.md` #210: bots only, the copy of the table, the brand card, the 480 px thumbnail, and generic for what is not available.
  - `log.md` and the `index.md` count.
  - `stack.md`: the endpoint becomes `GET /api/og?kind=&id=` in `api/og.ts`.
  - `tecnico.md`: same endpoint.
  - Issue #18: same wording.

**Out:**

- Changing the share buttons, their `wa.me` text or where they appear.
- `navigator.share` (the phone's own share sheet).
- A picture generated per item (text drawn on an image, `@vercel/og`).
- Previews for any other route (Hoy, ¿Alguien sabe?, Yo, `/privacidad`). They use the fixed home tags.
- Signed or resized photos from Supabase Storage. Image transformation is a paid feature.
- Answers and comments in the preview.
- Counting shares or tracking where visits come from.

## Data model

No new tables, columns, migrations or environment variables. `/api/og` uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, which are already in Vercel.

```ts
// lib/og/meta.ts
export type OgItem =
  | { kind: 'question'; id: number; text: string; zone: string; city: string; photoUrl: string | null }
  | { kind: 'sign'; id: number; title: string; price: string | null; zone: string; city: string; thumbUrl: string };

export type OgMeta = { title: string; description: string; image: string; imageWidth?: number; imageHeight?: number; url: string };

export function ogFor(item: OgItem | null, origin: string, path: string): OgMeta;
export function renderOgHtml(meta: OgMeta): string;
export function escapeHtml(value: string): string;
```

```json
// vercel.json — before the SPA rewrite
{ "source": "/p/:id", "has": [{ "type": "header", "key": "user-agent", "value": "(?i).*(whatsapp|facebookexternalhit|facebot|twitterbot|telegrambot|slackbot|discordbot|linkedinbot|skypeuripreview|pinterest|redditbot|embedly).*" }], "destination": "/api/og?kind=question&id=:id" },
{ "source": "/l/:id", "has": [ …same… ], "destination": "/api/og?kind=sign&id=:id" }
```

## Implementation plan

1. **Wiki and board.** Add #210 to `huecos-cerrados.md`, update `log.md`, the `index.md` count, `stack.md` and `tecnico.md` in `boliviasabe-docs`, then push. Rewrite the body of issue #18.
2. **Brand card.** Write `scripts/og/card.html` with the brand font, render it in Chromium at 1200×630 to `public/og.png`, and check it is 1200×630 and under 300 KB.
3. **`lib/og/meta.ts`.** `ogFor`, `renderOgHtml` and `escapeHtml`. Smoke-test them with `node` (question, question with photo, letrero with and without price, generic, a text with `<`, `"` and `&`, a 300-character question).
4. **`api/og.ts`.** Read the item with the anon client and answer the HTML with the cache header. `npm run typecheck` passes.
5. **`vercel.json` + `index.html`.** Add the two bot rewrites before the SPA rewrite and the fixed home tags. `npm run build` passes.
6. **Preview deployment.** Open the PR (`Closes #18`). On the preview, check with `vercel curl`:
   - the WhatsApp agent gets the OG HTML for a real `/p/:id` and `/l/:id`;
   - a Chrome agent gets the app.
7. **Production (after Diego authorizes the merge).**
   - Repeat the curl checks on `boliviasabe.vercel.app`.
   - Diego pastes the links in WhatsApp: a question with a photo, a question without one, a letrero, a deleted item and the home.
   - Then he taps one and checks that it opens the detail without asking for an account.

## Acceptance criteria

**Server (curl on the preview, then on production):**

- [ ] With `User-Agent: WhatsApp/2.23.20.0 A`:
  - `/p/<id>` of a visible question answers 200, `text/html`, with `og:title` «¿Alguien sabe? <question>», the right `og:description`, an absolute `og:image` and `og:url` = `https://boliviasabe.vercel.app/p/<id>`.
  - `/l/<id>` of a letrero has «<title> · <price>» and `og:image` = its `thumbUrl`.
- [ ] With the same agent, a question without a photo has `og:image` = `https://boliviasabe.vercel.app/og.png`.
- [ ] With the same agent, `/p/999999` (does not exist) and `/p/abc` answer 200 with the generic preview, never 404 or 500.
- [ ] `facebookexternalhit/1.1` and `TelegramBot (like TwitterBot)` also get the OG HTML.
- [ ] With a Chrome agent (or none), `/p/<id>` and `/l/<id>` answer the app's `index.html`, the same as `/`.
- [ ] The response has `cache-control: public, s-maxage=600, stale-while-revalidate=86400`.
- [ ] A question whose text is `<script>"&` ends up escaped in every tag: `&lt;script&gt;&quot;&amp;`.
- [ ] `/` (any agent) has `og:title` «BoliviaSabe», `og:image` `…/og.png` with `og:image:width` 1200 and `og:image:height` 630.
- [ ] `public/og.png` is 1200×630 and under 300 KB.

**In WhatsApp (Diego, production):**

- [ ] A question link shows «¿Alguien sabe? …», «Pregunta en <zona>, <ciudad>…» and its photo, or the brand card.
- [ ] A letrero link shows its title, price, zone and its photo.
- [ ] The home link shows the brand card.
- [ ] A deleted question shows the generic preview. Opening it shows «Esto ya no está disponible» + Ir a Hoy.
- [ ] Tapping a question or letrero preview opens the detail without asking for an account, on a phone at 360 px.

**Code:**

- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] `git grep -i "SECRET\|SERVICE_ROLE"` shows no values. `/api/og` does not use the service role.
- [ ] The wiki (#210, log, index, `stack.md`, `tecnico.md`) and issue #18 match this spec.

## Decisions taken and discarded

| Decision | Discarded | Why |
|---|---|---|
| Only preview bots go to `/api/og` (rewrite with `has` user-agent) | Every visit goes through a function that injects tags into `index.html` | People keep the static, cached app with no cold start. Installed users get the app from the service worker anyway. A bot missing from the list only loses the preview, never the page. |
| `/api/og?kind=&id=` in `api/og.ts` | `api/og/[tipo]/[id].ts` (what `stack.md` said) | One file, and the rewrite already builds the query. The wiki is updated in step 1. |
| Read with the anon key through `get_question` / `get_sign` | Service role; a new SQL function | It is exactly what a guest sees, deleted / hidden / in review included, with no migration and no secret. |
| Generic preview with 200 for anything not available or any error | 404, or no tags | WhatsApp still shows the brand, and nothing about a deleted item leaks. |
| Letrero picture = the 480 px thumbnail | The 1280 px photo | WhatsApp drops heavy images. The thumbnail weighs tens of KB and looks sharp in the preview. |
| Question picture = its photo, else the brand card | Always the brand card | The photo says more. If it turns out too heavy, see the risks. |
| One fixed brand card, an HTML page rendered once in Chromium | `@vercel/og` image per item; the 512 px app icon; `sharp` (draws Helvetica on macOS instead of the brand font) | Zero cost per request, it uses the real brand font, and it looks good in WhatsApp's large preview. The icon shows as a small square. |
| Fixed OG tags in `index.html` for the home | No home preview | The app's link is shared in the pitch and in groups. It costs a few lines. |
| `s-maxage=600` | No cache; one day | Repeated pastes of the same link do not hit the database, and an edit or a deletion shows within 10 minutes. WhatsApp keeps its own cache anyway. |

## Identified risks

- **The question photo is too heavy for WhatsApp.**
  - Photos are 1280 px at JPEG 0.8, often 150–400 KB.
  - If the step 7 test shows a question preview without its photo, `ogFor` switches questions to the brand card. That is a one-line change, and the spec gets updated.
- **WhatsApp caches previews by URL.** A link pasted before the deploy keeps its old, empty preview for a while. Test with links that were never shared before.
- **A preview bot that is not in the list** gets the SPA and shows a bare link. Adding it is one more word in the regex.
- **Vercel's preview protection** blocks bots on preview URLs. The real WhatsApp test is only possible on production, so the preview is checked with `vercel curl`.
- **The rewrite order.** If the SPA rewrite matches first, no bot reaches `/api/og`. Step 6 checks the WhatsApp agent explicitly.
