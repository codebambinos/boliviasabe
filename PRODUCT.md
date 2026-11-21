# Product

<!-- impeccable:product-schema 1 -->

> Source of truth for flows and rules is the wiki (`wiki/index.md`, `wiki/flujo-final.md`,
> `wiki/reglas-finales.md`, `wiki/marca.md`). This file records the product facts that steer
> design decisions; when they disagree, the wiki wins.

## Platform

web

Mobile-first installable PWA. Phone at 360 px is the primary frame; on desktop the same app shows
a sidebar and a detail panel on the right.

## Users

- **Immediate audience: the hackathon jury** (National Startups by Stellar, final delivery
  Sun 22 Nov 2026; 10 finalists pitch 5 minutes in Santa Cruz on 27 Nov). They judge a working
  product through the live demo URL, a 3-minute video and the repo. Their heaviest criteria are
  problem and user, a working product, and Stellar as a central part of the product.
- **The people the product is for, and what the jury must believe in:** neighbors and students
  in Cochabamba (first zones: Cala Cala, Sarco, Centro) who want today's local deals or quick
  help, on their own phone, often on a cheap Android with poor signal. Neighborhood businesses
  are a secondary audience that posts "letreros".
- Design decisions are made for the neighbor on a cheap phone. The jury is won by seeing that
  product actually work, not by demo-only spectacle.

## Product Purpose

Neighbors post photo "letreros" (local prices, offers and services) and ask questions in
"¿Alguien sabe?". Answers have their own conversation threads, questions are shared to WhatsApp,
and push notifications bring people back. When an answer helps ("Me sirvió"), the helper earns
**yapitas** and trust, and every reward is recorded on Stellar testnet with a public link.

Success: a working end-to-end product for the demo; after the hackathon, 200 accounts, 60 weekly
active and under 30 minutes to the first answer (30-day plan in `wiki/hackathon.md`).

## Positioning

Today the same question goes to five WhatsApp or Facebook groups; answers arrive late, get lost,
and nobody knows if they are still true or whom to trust. Helpers get nothing. BoliviaSabe keeps
local knowledge in one place, ordered by city and zone, searchable, with a thread per answer, and
rewards the person who helped with a public, verifiable record. WhatsApp is a growth channel, not
a competitor to beat. Never claim "we are the first".

Brand line: «Entre bolivianos nos ayudamos». Pitch line: «Lo que pasa hoy en tu ciudad, lo sabemos
entre todos.»

## Operating Context

- Used on the street or at home, one-handed, on a phone; bad signal is normal. Forms keep text
  and photo on failure; the PWA opens offline with the last loaded data.
- Opening the link goes straight to **Hoy** for Cochabamba: no intro, login wall or tutorial.
  Browsing needs no account; acting (post, ask, answer, rate, save, report) opens the soft wall
  «Crea tu cuenta para seguir» and returns to the pending action without losing input.
- Three tabs: **Hoy · ¿Alguien sabe? · Yo**, plus a floating action button per tab.
- 10 Bolivian cities (Cochabamba default); the city picker changes what you see, posting always
  goes to your profile city.
- Demo story: a pipe breaks on a Sunday; you ask with a photo, share it to your groups, neighbors
  answer, you talk in the thread and mark «Me sirvió».

## Capabilities and Constraints

- Stack in place: Vite + React + TypeScript, React Router, TanStack Query, Supabase, Vercel
  functions, Web Push, `vite-plugin-pwa`. Data access only through `src/data/`.
- **Stellar testnet only.** A Stellar failure never blocks rating, answering or posting; the
  reward shows as pending.
- On screen the currency is always «yapitas» (★). Never «XLM», «estelares», «tokens», «cripto»,
  «blockchain», «puntos» alone, any value in bolivianos, promises of real money, visible phone
  numbers or «contactar por WhatsApp». Contact is shared only when both people accept.
- Flows, numbers and limits are fixed in the wiki (v3.2, no open decisions). A flow does not
  change without a product decision recorded there first.
- Timeline: feature freeze Saturday 21 Nov at night; after that, bug fixes only.

## Brand Commitments

- Name **BoliviaSabe**; first city Cochabamba. Team: CodeBambinos.
- **Aguayo palette** and theme tokens live in `src/styles/tokens.css` (owned by Yaeko); light and
  dark always, following the system and switchable in Ajustes. The aguayo stripe is a detail, not
  a pattern to cover surfaces.
- Type: Bricolage Grotesque (headings) and Figtree (text), since 20 Nov (wiki #136). Art direction «Letrero» in `DESIGN.md`.
- Logo: F5 is provisional (Bolivia map with the B and the yapita bubble) until the final one.
- **Tilcho** (tilcayo cat mascot) appears only in the Yo tab, on the profile card. Never on entry,
  empty states or as a guide.
- Voice: friendly Bolivian Spanish («¡Ya está!», «Chuta», «Gracias, pues», greeting by time of
  day). UI copy comes from the wiki.

## Evidence on Hand

- Wiki with the full flow, rules, Stellar design and pitch (`wiki/`).
- Prototype, flow map and design assets (tokens, logos, Tilcho SVG/PNG and `tilcho.js`) live in
  the team's raw sources referenced by `wiki/index.md`, not in this repo.
- Five user interviews by Yaeko are the basis of the problem statement.
- No real testimonials, customers, usage numbers or business partners yet. Do not invent them.
  The census figure (2,005,373 inhabitants of Cochabamba department, INE 2024 preliminary) is the
  only market number in use.

## Product Principles

1. **Zero friction on the phone.** Look first, sign up only when acting, never lose what the
   person typed.
2. **The cheap phone decides.** When demo polish and real-world use conflict, real use wins.
3. **Helping is visible and rewarded.** Yapitas and trust follow the person who helped; the record
   is public and cannot be faked.
4. **Local and current.** Everything is ordered by city and zone; stale information says so.
5. **Stellar is felt, not named.** The blockchain does its job underneath; the screen speaks
   yapitas.

## Accessibility & Inclusion

- Body text and UI meet 4.5:1 contrast. Orange, green and coral from the palette fail on light
  backgrounds for small text and are used only as fills or icons, with dark text on top.
- Type follows the phone's text size (all in `rem`) and is tested at 130 %.
- Tested on Android, iPhone and desktop at 360 / 768 / 1280 px, light and dark.
