# SPEC 29 — Redeem yapitas with partner businesses

> **Status:** Approved
> **Depends on:** SPEC 08 (Stellar account per profile), SPEC 09 (premiar y gastar: `gastar`, `chargeUrgent`), SPEC 21 (Yo: profile card, Movimientos), SPEC 01 and SPEC 11 (data layer, mock and Supabase adapters). Board card: T45 (issue #93). Wiki: #219, `plan-final.md`.
> **Date:** 2026-11-23
> **Objective:** Let a neighbor spend yapitas on a real offer from a partner business, with a real testnet payment from the neighbor's account to the business's account and a receipt to show at the counter.

## Why this spec exists

The redemption was left out of the MVP (#212). The jury's most likely question at the final (Fri 27 Nov) is «what are yapitas for?».
A real redemption closes the loop: help → earn → spend → the business gets customers. It also answers «why Stellar?» with a payment anyone can verify.
The wiki reopened it on 23 Nov (#219). It must be built by Wed 25 Nov so a pilot neighbor can make the first real redemption, and it ships behind a switch so it can be turned off if it fails.

## Scope

**In:**

- **Partner businesses and offers**, loaded by us with a script. A partner is an existing app profile: the owner signs up normally and gets the welcome +5. The script links that profile as a partner and adds its offers (title, cost in yapitas, active). There is no screen to manage them.
- **Yo › profile card:** with the switch on, the bar toward 100 and «Canje con negocios, próximamente» are replaced by a **«Canjear yapitas»** button. With the switch off, the card stays exactly as today.
- **«Canjear» sheet**, one sheet with three views:
  1. **List:** active offers, each with business name, zone · city, offer title and cost («10 yapitas»). An offer the person cannot afford shows «Te faltan N yapitas» and cannot be tapped. One already redeemed today shows «Ya la canjeaste hoy». A partner never sees its own offers. Empty state: «Todavía no hay negocios aliados en tu ciudad».
  2. **Confirm:** «¿Canjear 10 yapitas por <oferta> en <negocio>?». Buttons: **Canjear** / **Volver**. While it pays, the button says «Canjeando…», the sheet cannot be closed and there is no second tap.
  3. **Receipt:** large and readable at the counter: «Canje confirmado», the offer, «en <negocio> · <zona>», date and time, **Código #<id>**, «−10 yapitas», «Ver en el explorador» and a **Listo** button.
- **No minimum:** each offer has its own cost; having enough balance is all it takes. The «desde 100» rule (#212) goes away.
- **Payment:** from the neighbor's custodial account to the partner's account, signed by the server like the urgent −5, with memo `canje:<redemptionId>`. It is all or nothing. If the balance, the limit or Stellar fails, nothing is charged and the person sees the reason. A redemption is never «pending».
- **Limit:** each neighbor can redeem each offer once per Bolivia day, counting confirmed redemptions only.
- **Movimientos:** the neighbor sees «Canje en <negocio>» with −N, and the partner sees «Canje recibido» with +N. Both point to the same transaction. Tapping a redemption movement, on either side, opens its receipt again.
- **Switch:** `CANJE_ENABLED` (server) and `VITE_CANJE_ENABLED` (client), both in Vercel. Off: the server answers «El canje no está disponible ahora» and Yo shows today's card.
- Wiki first: the texts and rules above go into `flujo-final.md` (Yo), `reglas-finales.md` (canje row, limit) and `stellar-final.md` (memo, who signs) before the code.

**Out of scope (for future specs):**

- A screen for businesses to create or edit offers, or to see a list of the redemptions they received.
- QR codes, camera, or a step where the business accepts the redemption before payment.
- «Destacado» and paid plans for businesses (week of 30 Nov).
- Own wallets with Pollar, mainnet, and any value in bolivianos on screen.
- A demo-only business or offer hidden from others. The demo uses a real partner offer that the business agreed to honor (decision below).
- Notifications (push or Avisos) for a redemption.

## Data model

New migration `supabase/migrations/0012_redemptions.sql`:

```sql
create table public.partners (
  id bigint generated always as identity primary key,
  profile_id bigint not null unique references public.profiles (id),
  name text not null check (char_length(name) between 2 and 60),
  city text not null,
  zone text not null,
  created_at timestamptz not null default now()
);

create table public.offers (
  id bigint generated always as identity primary key,
  partner_id bigint not null references public.partners (id),
  title text not null check (char_length(title) between 3 and 80),   -- «Un refresco gratis con tu almuerzo»
  cost integer not null check (cost between 1 and 1000),             -- yapitas
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.redemptions (
  id bigint generated always as identity primary key,               -- memo `canje:<id>`, fits in 28 bytes
  offer_id bigint not null references public.offers (id),
  profile_id bigint not null references public.profiles (id),       -- the neighbor who pays
  partner_id bigint not null references public.partners (id),
  cost integer not null,                                            -- copied from the offer at redemption time
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'error')),
  tx_hash text,
  created_at timestamptz not null default now()
);

alter table public.rewards add column redemption_id bigint references public.redemptions (id);
```

- **RLS:** a signed-in user can read `partners` and active `offers`. They can read only the `redemptions` where they are the neighbor or the partner. Only the server (service role) writes these tables.
- **Rewards rows per confirmed redemption:**
  - neighbor: `memo_key = 'canje:<id>'`, `amount = -cost`, `reason = 'canje'`, `redemption_id = <id>`;
  - partner: `memo_key = 'canje-r:<id>'`, `amount = +cost`, `reason = 'canje'`, `status = 'confirmed'`, same `tx_hash`, created only after the payment is confirmed. The chain memo is `canje:<id>` for both; `canje-r:` exists only because `memo_key` is unique.
- A failed redemption leaves the redemption and the neighbor's row in `error`. Movimientos hides it, as it already hides failed urgent charges. «Reintentar» never applies to `reason = 'canje'`.

Data layer (`src/data/api.ts`, implemented by both adapters):

```ts
export type Offer = { id: Id; title: string; cost: number; partner: { name: string; city: string; zone: string };
  redeemedToday: boolean; mine: boolean };
export type Redemption = { id: Id; offerTitle: string; partnerName: string; partnerZone: string; cost: number;
  createdAt: string; txHash: string; side: 'paid' | 'received' };

redemptions: {
  offers(): Promise<Offer[]>;                 // active offers in the caller's city
  redeem(offerId: Id): Promise<Redemption>;   // throws DataError 'balance' | 'limit' | 'stellar' | 'disabled'
  get(id: Id): Promise<Redemption>;           // the receipt, for either side
};
```

`Movement` gains `redemption?: { id: Id; partnerName: string; side: 'paid' | 'received' }`.

## Implementation plan

1. **Wiki:** record the texts and rules from Scope in `flujo-final.md`, `reglas-finales.md` and `stellar-final.md`, plus an entry in `log.md`. Nothing in the app changes.
2. **Migration** `0012_redemptions.sql` (tables, `rewards.redemption_id`, RLS), applied locally. `npm run typecheck`.
3. **Server:**
   - `planRedeem` and `chargeRedeem` in `lib/stellar/rewards.ts`, next to `chargeUrgent`, paying to the partner's public key. `chargeRedeem` then writes the partner's `canje-r:` row.
   - `gastar` in `lib/stellar/route.ts` accepts `{ reason: 'canje', refId: offerId }`. It checks `CANJE_ENABLED`, that the offer is active, that it is not the caller's own, the daily limit and the balance; then it creates the redemption and charges.
   - `retry` refuses `canje`.
   - Extend `scripts/stellar/e2e.ts` with a redemption (neighbor −N, partner +N) and a second one that hits the limit. `npm run stellar:e2e`.
4. **Partner script** `scripts/seed/partner.ts` (`npm run partner:add -- --profile <id> --name … --city … --zone … --offer "…" --cost 10`). It links the profile and adds or updates the offer. Idempotent by profile and offer title.
5. **Data layer:**
   - `Offer`, `Redemption` and `Movement.redemption` types;
   - mock adapter, with 2 sample partners in the fixtures;
   - Supabase adapter `src/data/supabase/redemptions.ts`, and movements that join the redemption;
   - hooks `src/data/hooks/redemptions.ts` (`useOffers`, `useRedeem`, `useRedemption`), which invalidate wallet and movements after a redemption.
6. **UI:**
   - `src/components/RedeemSheet.tsx` and `redeem-sheet.css`, with the list, confirm and receipt views;
   - `ProfileCard.tsx`: the button when `VITE_CANJE_ENABLED` is on, today's bar when it is off;
   - `MovementsCard.tsx` and `movements.ts`: the «Canje en <negocio>» and «Canje recibido» labels, and a tap that opens the receipt.
   - Check at 360 px, light and dark, text at 130 %, and with reduced motion.
7. **Production:** apply the migration, set both variables in Vercel, link the first real partner with the script, and make one redemption with a team account to check both sides and the explorer.

## Acceptance criteria

- [ ] The wiki has the redemption texts and rules before any code is merged.
- [ ] With `VITE_CANJE_ENABLED` off, Yo shows exactly today's card. With `CANJE_ENABLED` off, `gastar` with `canje` answers `disabled` and charges nothing.
- [ ] With both switches on, a neighbor with enough balance redeems an offer. The testnet explorer shows a payment of N YAPITA from the neighbor's account to the partner's account, with memo `canje:<id>`.
- [ ] The receipt shows «Canje confirmado», the offer, the business, the zone, the date and time, «Código #<id>», «−N yapitas» and a working «Ver en el explorador».
- [ ] The neighbor's Movimientos shows «Canje en <negocio>» with −N, and the partner's shows «Canje recibido» with +N. Tapping either one opens the same receipt.
- [ ] An offer that costs more than the balance shows «Te faltan N yapitas» and cannot be redeemed. If the server sees too little balance, nothing is charged.
- [ ] A second redemption of the same offer the same Bolivia day is refused with «Ya la canjeaste hoy», and nothing is charged.
- [ ] A partner does not see its own offers in the list, and the server refuses them.
- [ ] If Stellar fails, nothing is charged, the person sees «No se pudo canjear, intenta de nuevo» with Reintentar, and the failed attempt does not appear in Movimientos.
- [ ] «Reintentar» on any movement never pays a redemption.
- [ ] No screen shows bolivianos, «XLM», «tokens» or «cripto».
- [ ] `npm run typecheck`, `npm run build` and `npm run stellar:e2e` pass. Tested on a phone at 360 px, in light and dark. `git grep -i "SECRET\|SERVICE_ROLE"` shows no values.

## Decisions

- **Yes:** the yapitas go to the **partner's own account**. **No:** to the distributor. The point of the demo is that value moves from the neighbor to the business. (Diego's choice.)
- **Yes:** the business checks a **receipt on the neighbor's screen**, and can reopen it from Movimientos. **No:** a QR (camera, more code), or the business accepting before payment (two people, hard to demo alone). (Diego's choice.)
- **Yes:** offers loaded by **us with a script**. **No:** a screen for businesses (its own spec). (Diego's choice.)
- **Yes:** **no minimum**; each offer has its own cost. **No:** keeping «desde 100», because pilot neighbors would not reach it before Friday. (Diego's choice; replaces that part of #212.)
- **Yes:** the owner **signs up as a normal user** and the script links the profile. **No:** a Stellar-only account, because the business could not see anything in the app. (Diego's choice.)
- **Yes:** the switch is **an environment variable in Vercel** (a redeploy of about 1 minute). **No:** a database flag, which needs more code. (Diego's choice.)
- **Yes:** **1 redemption per offer per neighbor per Bolivia day.** **No:** no limit. (Diego's choice.)
- **Yes:** **all or nothing**, never pending. The business is waiting at the counter and cannot hand over something half done. (Diego's choice.)
- **Yes:** a **Yo button and one sheet** with three views; no new routes. (Diego's choice.)
- **Yes:** Movimientos says «Canje en <negocio>» and «Canje recibido». (Diego's choice.)
- **Yes:** the live demo redeems a **real partner offer** with Diego's demo account, which the partner agreed to honor, and also shows the real pilot redemption in the explorer. **No:** a hidden demo business. It needs more code and would be presented as fake. (Diego's choice.)
- **Yes:** the partner's row uses `memo_key = 'canje-r:<id>'`, because `rewards.memo_key` is unique. The chain memo is still `canje:<id>`.

## Risks

| Risk | Mitigation |
| --- | --- |
| A Stellar failure in the middle of the demo. | All or nothing, plus Reintentar. Plan B is the recorded video and the pilot redemption in the explorer. The switch turns the feature off with one redeploy. |
| The partner's `canje-r:` row gets paid again by «Reintentar» (`payReward` pays from the distributor). | It is written only as `confirmed`, and `retry` refuses `reason = 'canje'`. Covered by an acceptance criterion. |
| Two taps or two devices redeem at the same time. | The button locks while it pays. Each attempt is its own redemption id, so there is never a double memo. The daily limit is checked again on the server right before charging. |
| No partner says yes before Wednesday. | The code works with any linked profile. Without a real partner there is no live redemption: the demo shows the flow with Diego's own test business, presented as a test. |
| Testnet is reset. | `npm run stellar:reset` (SPEC 20) pays back confirmed rewards. Redemptions are rewards rows, so they are replayed with their memos. |
