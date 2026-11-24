# SPEC 30 — Partners in Hoy: «Destacados» and «Acepta yapitas»

> **Status:** Approved
> **Depends on:** SPEC 29 (partners, offers, the «Canjear» sheet and `VITE_CANJE_ENABLED`), SPEC 05 (Hoy grid, `SignTile`, sections), SPEC 06 (letrero sheet), SPEC 11 (Supabase adapter). Board card: T45 (issue #93) follow-up. Wiki: #219, `plan-final.md`.
> **Date:** 2026-11-23
> **Objective:** Make partner businesses visible in Hoy: a «Destacados» section on top for featured partners, and an «Acepta yapitas» mark that leads to their redemption offers from the letrero itself.

## Why this spec exists

The Atlas analysis 3 noted that «Destacado», the feature businesses would pay for (Bs 20 a month), does not exist yet, and that the redemption has no screen in the app.
SPEC 29 added the redemption; this spec makes it reachable where neighbors already look, Hoy, and shows the paid feature working with the pilot's free month.
It ships behind the same switch as the redemption, so one variable turns the partner experience on in production.

## Scope

**In:**

- **«Destacados» section in Hoy**, above «Hoy · Esta semana · Antes»:
  - It holds up to 4 letreros by partners whose `featured_until` is in the future, from the city in the top bar, published in the last 7 days.
  - **Order:** first the viewer's zone, if they are signed in and have a zone, then the rest of the city; the newest first within each group. A guest gets them by date only.
  - **Tiles:** the same tile as the grid, under the section title «Destacados».
  - **When it shows:** only with no search and no tags active, and only when the switch is on and there is at least one. Otherwise the section is not rendered at all: no title, no empty state.
  - **The list below stays exactly as today:** a featured letrero also appears in its date group.
- **«Acepta yapitas» mark** on the tile of every letrero whose author is a partner with at least one active offer, in the section and in the normal grid. It is one small mark with the yapita disc, and it is the only extra mark on a tile.
- **In the letrero sheet** of a partner's letrero, an «Acepta yapitas» box:
  - It lists that partner's active offers, each with title, cost («10 yapitas») and a **Canjear** button. The button opens the «Canjear» sheet of SPEC 29 directly on the confirmation of that offer.
  - **Same rules as the redemption list:** «Te faltan N yapitas» or «Ya la canjeaste hoy» with the button off.
  - **For a guest,** Canjear asks for an account, like the other 🔒 actions, and goes on to the confirmation after signing in.
  - **On the partner's own letrero** the box is not shown.
- **Featured period:** `partners.featured_until`. `npm run partner:add` gains `--featured-days N`, which sets it to now + N days (`0` clears it). A partner whose period ended still shows «Acepta yapitas» and can still be redeemed; it is only no longer in «Destacados».
- **Switch:** `VITE_CANJE_ENABLED`, the same one as SPEC 29. When it is off, Hoy and the letrero sheet look exactly as today.
- Wiki first: «Destacados», «Acepta yapitas» and the box texts go into `flujo-final.md` (Hoy, letrero detail) and `reglas-finales.md` (Destacado, featured period) as #220, plus `log.md`.

**Out of scope (for future specs):**

- Payment for Destacado (Bs 20 by QR or Pollar), a screen for businesses to manage their period or offers, and invoices.
- «Destacado» in ¿Alguien sabe?, in search results, or in other cities' feeds.
- Changing the order or the pagination of `list_signs`.
- A second mark «Destacado» on tiles.
- Analytics of views or clicks on featured letreros.

## Data model

New migration `supabase/migrations/0015_featured_partners.sql`:

```sql
alter table public.partners add column featured_until timestamptz;

-- sign_json gains `acceptsYapitas`: the author is a partner with at least one active offer
create or replace function public.sign_json(s public.signs) returns jsonb ...   -- same keys as 0005 + 'acceptsYapitas'

-- Up to 4 featured letreros of the city, last 7 days, visible to the caller, viewer's zone first, newest first.
create or replace function public.featured_signs(p_city text) returns jsonb   -- jsonb array of sign_json

-- The active offers of a letrero's author, shaped like `Offer` (SPEC 29); [] when it is the caller's own letrero
-- or the author is not a partner.
create or replace function public.sign_offers(p_sign_id bigint) returns jsonb
```

- `featured_signs` and `sign_offers` are callable by `anon` and `authenticated`: guests see Destacados and the box. `redeemedToday` is false for a guest.
- The «viewer's zone first» rule compares `signs.zone_norm` with the normalized zone of the caller's profile.

Types (`src/data/types.ts`) and API (`src/data/api.ts`):

```ts
// Sign gains:
acceptsYapitas: boolean;

signs: {
  // …existing
  /** «Destacados»: up to 4 featured partner letreros of the city (SPEC 30). */
  featured(city: City): Promise<Sign[]>;
};
redemptions: {
  // …SPEC 29
  /** The redemption offers of a letrero's author; [] for the caller's own letrero or a non-partner. */
  offersForSign(signId: Id): Promise<Offer[]>;
};
```

Hooks: `useFeaturedSigns(city, { enabled })` and `useSignOffers(signId, { enabled })`. Query keys `signs/featured/<city>` and `redemptions/sign/<id>`. A redemption invalidates both (`keys.redemptions()` already covers the second one).

## Implementation plan

1. **Wiki:** #220 in `huecos-cerrados.md`, with the texts and rules in `flujo-final.md` and `reglas-finales.md`, plus `log.md`.
2. **Migration** `0015_featured_partners.sql`, applied locally. Check with SQL: a featured partner's letrero comes in `featured_signs`, a non-partner's does not, the zone order holds, an expired period drops it, and `sign_offers` is empty on one's own letrero.
3. **Partner script:** `--featured-days N` in `scripts/seed/partner.ts`, tested locally.
4. **Data layer:**
   - `Sign.acceptsYapitas`, `signs.featured` and `redemptions.offersForSign` in both adapters;
   - mock fixtures: Marco featured, Jorge not; the mock's letreros by Marco and Jorge accept yapitas;
   - the hooks and query keys.
5. **UI:**
   - the `SignTile` mark;
   - the «Destacados» section in `HoyPage.tsx`;
   - the «Acepta yapitas» box in `SignSheet.tsx`;
   - `RedeemSheet` accepts an `initialOffer` to open on the confirmation;
   - styles in the existing CSS files.
   - Check at 360 px, light and dark, text at 130 %, with the switch on and off.
6. **Production** (with permission): apply the migration; with the first real partner, run `partner:add --featured-days 30`.

## Acceptance criteria

- [x] With `VITE_CANJE_ENABLED` off, Hoy, the tiles and the letrero sheet look exactly as before this spec.
- [x] With it on, no search and no tags, Hoy shows «Destacados» with up to 4 letreros of featured partners of that city from the last 7 days. Those of the viewer's zone come first, and each group is newest first.
- [x] With a search or a tag active, or with no featured letreros, there is no «Destacados» title at all.
- [x] A featured letrero also appears in its normal date group below.
- [x] A partner's letrero shows «Acepta yapitas» on its tile, in the section and in the grid. A non-partner's letrero does not.
- [x] A partner whose `featured_until` passed is not in «Destacados» but still shows «Acepta yapitas», and its offers can be redeemed.
- [x] The letrero sheet of a partner's letrero lists its active offers. **Canjear** opens the «Canjear» confirmation of that offer, and the redemption works as in SPEC 29.
- [x] «Te faltan N yapitas» and «Ya la canjeaste hoy» turn the box's button off.
- [x] A guest who taps Canjear is asked to sign in and then reaches the confirmation.
- [x] The partner does not see the box on its own letrero.
- [x] `partner:add --featured-days 30` sets the period, and `--featured-days 0` clears it.
- [x] No screen shows bolivianos, «XLM», «tokens» or «cripto».
- [x] `npm run typecheck` and `npm run build` pass. Tested at 360 px, in light and dark, text at 130 %.

## Decisions

- **Yes:** a **«Destacados» section on top**, up to 4 letreros. **No:** reordering inside each date group or touching `list_signs` (riskier pagination). (Diego's choice.)
- **Yes:** **`partners.featured_until`**, set by the script; the pilot's free month is `--featured-days 30`. **No:** every partner featured forever, which would mix redemption and paid publicity. (Diego's choice.)
- **Yes:** the **«Acepta yapitas» mark plus a box with Canjear** in the letrero sheet, opening SPEC 29's confirmation. **No:** a mark only. (Diego's choice.)
- **Yes:** the **same switch as the redemption** (`VITE_CANJE_ENABLED`): one thing to turn on in production. **No:** a separate switch. (Diego's choice.)
- **Yes:** the section is **hidden while searching or filtering**. (Diego's choice.)
- **Yes:** a featured letrero **also stays in the normal list**: the list stays complete and in date order. (Diego's choice.)
- **Yes:** **one mark per tile, «Acepta yapitas»**; «Destacados» is the section title. **No:** two marks at 360 px. (Diego's choice.)
- **Yes:** **the viewer's zone first**, then newest; guests by date only. (Diego's choice.)
- **Yes:** guests see «Destacados» and the box, because both functions are callable by `anon`. Redeeming still needs an account.

## Risks

| Risk | Mitigation |
| --- | --- |
| Changing `sign_json` breaks every letrero read. | It only adds one key. The migration keeps the same output for the other keys, and the SQL check in step 2 compares a letrero before and after. |
| With no real partner yet, the section and the mark never appear in production. | That is the switched-off state. The mock and a local partner show it, and production waits for Yaeko's partner like SPEC 29. |
| A featured partner with no letrero in the last 7 days leaves «Destacados» empty. | No title is rendered when it is empty. The partner is asked to upload a letrero when it is linked. |
| Opening «Canjear» from the letrero sheet stacks two sheets. | The letrero sheet closes first, then «Canjear» opens on the confirmation, as other flows do after a sheet closes (`EXIT_MS`). |
