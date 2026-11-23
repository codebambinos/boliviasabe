# SPEC 31 — First real payments on mainnet: own wallet with Pollar

> **Status:** Approved
> **Depends on:** SPEC 08 (custodial testnet account), SPEC 21 (Yo), SPEC 29 (partners, offers, redemption rules and receipt). Wiki: `pollar.md`, `stellar-final.md`, `plan-final.md`.
> **Date:** 2026-11-23
> **Objective:** Let invited neighbors and partners connect their own Pollar wallet in Yo and make real YAPITA payments on Stellar mainnet (a 5-yapita welcome and a redemption), isolated from the testnet pilot.

## Why this spec exists

The Atlas analysis 3 marked three Stellar gaps: everything is custodial, everything is testnet, and the cost of an account on mainnet is not solved.
Pollar answers all three. Ale (its founder) confirmed on 23 Nov that it supports a custom asset, the trustline and payments, that the app pays per use, and that its ramp works with QR.
The pilot stays on testnet, where it is tested and safe. This spec adds a separate, switchable path so the final can show real mainnet payments that already happened before Friday, not a first try on stage.

## Scope

**In:**

- **YAPITA on mainnet.** A new script `npm run stellar:mainnet-setup` does the following:
  - creates a mainnet issuer and distributor and prints their public addresses;
  - waits until Diego funds them with real XLM (he does that himself);
  - adds the distributor's trustline and issues a fixed **1.000.000 YAPITA**;
  - **locks the issuer** (master weight 0), with memo `emisora:cerrada`.

  The issuer secret is used once and never stored after the lock. The distributor secret is written only to `.env`, never printed. Diego then copies it to Vercel as a sensitive variable.
- **Invite list.** Only signed-in people whose e-mail is in `MAINNET_BETA_EMAILS` (server) see anything of this spec: the team, the partner and the invited pilot neighbors.
- **«Mi billetera propia · Stellar (red principal)» card in Yo**, next to «Mi cuenta de prueba», which does not change:
  - **Not linked:** «Conectar mi billetera». It opens the Pollar login (Google or e-mail) and waits until the wallet is `READY` («Creando tu billetera…»). Then it adds the YAPITA trustline (`setTrustline`) and links the address to the profile.
  - **Linked:** the short address with Copiar, the YAPITA balance read from Horizon mainnet, «Ver en el explorador» (stellar.expert, public network) and **Canjear en la red principal**.
  - **Errors:**
    - «No se pudo conectar tu billetera, intenta de nuevo» + Reintentar;
    - «Tu billetera todavía se está creando» while it is `CREATING`.
- **Linking and welcome (server).** `POST /api/stellar/mainnet` with `{ action: 'link', pollarToken }`:
  - verifies the token with Pollar (`POST https://server.api.pollar.xyz/v3/tokens/verify`, header `x-pollar-api-key`);
  - checks the invite list and that the token's wallet has the YAPITA trustline on mainnet;
  - saves `profiles.mainnet_address`;
  - pays **5 YAPITA once per profile** from the mainnet distributor, with memo `bienvenida`, and records it.
- **Redemption on mainnet**, with the same rules as SPEC 29: offer active, not one's own, 1 per offer per Bolivian day, and the cost must be covered by the mainnet balance.
  - **Who appears:** only partners that also linked their own wallet.
  - **Flow:**
    1. `{ action: 'start-redeem', offerId }` creates a pending redemption (`network = 'mainnet'`) and returns its id, the partner's address, the amount and the memo `canje:<id>`.
    2. The neighbor signs the payment with Pollar (`runTx('payment', …)`), with memo if Pollar supports it.
    3. `{ action: 'confirm-redeem', redemptionId, txHash }` verifies the transaction on Horizon mainnet (source, destination, YAPITA of the mainnet issuer, amount, and memo when present), then confirms it.
  - **The receipt** is SPEC 29's, with «Ver en el explorador» pointing to mainnet.
  - **If the memo is not supported,** the payment goes without one and the stored hash plus verification is the proof (Diego's choice).
- **Switch:** `MAINNET_ENABLED` (server) and `VITE_MAINNET_ENABLED` (app), apart from the redemption switch. `VITE_POLLAR_NETWORK` (`testnet` | `mainnet`) and the matching issuer and distributor let the whole path run on testnet first.
- **Test gates (mandatory):**
  1. The whole path works on **testnet** with Pollar's testnet key.
  2. **At least 3 real mainnet payments** are verified in the explorer **before Thu 26 Nov at 20:00:** 2 welcomes (Diego and the partner) and 1 redemption between them.
  3. If gate 2 is not reached, mainnet is **not shown live** on Friday; it is presented as the next step.
- **Wiki first:**
  - #221 amends «Testnet only»: the pilot stays on testnet, plus an isolated mainnet path for invited accounts, with own wallets and no custody.
  - It also adds the card texts to `flujo-final.md`, the mainnet section to `stellar-final.md`, and an update to `pollar.md`.

**Out of scope (for future specs):**

- Moving the pilot, its accounts, balances or rewards to mainnet; paying regular rewards on mainnet.
- Replacing the app's login with Pollar.
- Pollar ramps (QR or bank) and any value in bolivianos.
- Custodial keys on mainnet: mainnet uses own wallets only.
- Partners who do not link a wallet; a screen for partners to manage mainnet offers.
- Changing `CLAUDE.md`'s general rule beyond what #221 records.

## Data model

New migration `supabase/migrations/0014_mainnet_wallets.sql`:

```sql
alter table public.profiles add column mainnet_address text unique;          -- G... of the Pollar wallet
alter table public.redemptions add column network text not null default 'testnet'
  check (network in ('testnet', 'mainnet'));

create table public.mainnet_payments (
  id bigint generated always as identity primary key,
  profile_id bigint not null references public.profiles (id),
  kind text not null check (kind in ('bienvenida', 'canje')),
  redemption_id bigint references public.redemptions (id),
  amount integer not null,
  tx_hash text not null unique,
  created_at timestamptz not null default now(),
  unique (profile_id, kind, redemption_id)      -- with redemption_id null: one welcome per profile (partial unique index)
);
```

- RLS: a user reads their own `mainnet_payments` and their own `mainnet_address` (already covered by the profiles owner policy). Only the service role writes.
- `list_offers` (0012) gains a `p_network` parameter: for `mainnet` it returns only offers whose partner has a `mainnet_address`.

Environment (values only in `.env` and Vercel, never in the repo):

| Variable | Where | What |
|---|---|---|
| `MAINNET_ENABLED`, `VITE_MAINNET_ENABLED` | server / app | the switch (`true` to turn on) |
| `MAINNET_BETA_EMAILS` | server | the invite list, comma-separated |
| `POLLAR_SECRET_KEY` | server (sensitive) | `sec_testnet_…` or `sec_mainnet_…` |
| `VITE_POLLAR_PUBLISHABLE_KEY`, `VITE_POLLAR_NETWORK` | app | `pub_…` and `testnet` or `mainnet` |
| `POLLAR_YAPITA_ISSUER_PUBLIC`, `VITE_POLLAR_YAPITA_ISSUER_PUBLIC` | server / app | issuer of the network in use |
| `POLLAR_YAPITA_DISTRIBUTOR_SECRET` | server (sensitive) | distributor of the network in use |

Code layout:

- `lib/stellar/network.ts`: the Horizon URL, passphrase and explorer for a given network. `points.ts` stays as it is for the pilot.
- `lib/stellar/ownWallet.ts`: `payWelcome`, `verifyPayment` and `hasTrustline` for the configured network.
- `lib/pollar/server.ts`: `verifyPollarToken`.
- `api/stellar/mainnet.ts`: one route with three actions (link, start-redeem, confirm-redeem).
- `src/data`: an `ownWallet` group in `DataApi`, with both adapters: `status()`, `link(token)`, `offers()`, `startRedeem(offerId)`, `confirmRedeem(id, hash)`. The balance is read from Horizon with `fetch`.
- `src/components/OwnWalletCard.tsx`, which lazy-loads `@pollar/react` so the pilot's bundle does not grow, and a mainnet redemption view that reuses the SPEC 29 receipt.
- Packages pinned exactly: `@pollar/react` and `@pollar/core` at the same 0.12.x version.

## Implementation plan

1. **Wiki:** #221, `flujo-final.md` (Yo card texts), `stellar-final.md` (mainnet section), `pollar.md` (decision updated) and `log.md`.
2. **Network config:** `lib/stellar/network.ts`, plus `stellar:mainnet-setup` with a `--network testnet` dry mode, so it can be tested without real XLM. `npm run stellar:e2e` still passes (the pilot is untouched).
3. **Migration** `0014`, applied locally, with SQL checks: one welcome per profile, and mainnet offers only with a partner wallet.
4. **Server:** `lib/pollar/server.ts`, `lib/stellar/ownWallet.ts` and `api/stellar/mainnet.ts`. Their rules are tested with the in-memory pattern of the e2e, on testnet.
5. **Data layer:** the `ownWallet` group in both adapters. The mock pretends a linked wallet for the team's mock user.
6. **UI:** `OwnWalletCard` (lazy Pollar provider, login, `READY` wait, trustline, link, balance) and the mainnet redemption view. Check at 360 px, light and dark.
7. **Gate 1, testnet:** with Pollar's testnet keys and our testnet issuer, link Diego's wallet, receive the welcome and redeem to a test partner wallet. The explorer shows all three.
8. **Mainnet setup (with permission):** Diego funds the issuer and distributor with real XLM. Then the script issues and locks, and the variables go to Vercel.
9. **Gate 2, mainnet:** 2 welcomes and 1 redemption with real accounts, verified in the explorer, before Thu 20:00. Record the links in the wiki.

## Acceptance criteria

- [ ] With `VITE_MAINNET_ENABLED` off, or for an e-mail not on the invite list, Yo looks exactly as before. With `MAINNET_ENABLED` off, the route answers `disabled`.
- [ ] `npm run stellar:e2e` passes unchanged: the testnet pilot is not affected.
- [ ] On mainnet, the issuer holds 0 signers with weight (locked), the distributor holds 1.000.000 YAPITA minus what was paid, and the lock transaction carries memo `emisora:cerrada`.
- [ ] No secret appears in the repo, the chat or logs. `git grep -i "SECRET\|SERVICE_ROLE"` shows no values, and the issuer secret is not stored anywhere after the lock.
- [ ] An invited person connects a Pollar wallet. The card shows its address, «Ver en el explorador» opens it on the public network, and the welcome of 5 YAPITA with memo `bienvenida` arrives once (linking again pays nothing).
- [ ] A token that Pollar rejects, an e-mail not on the list, or a wallet without the YAPITA trustline is refused, and nothing is paid.
- [ ] A mainnet redemption between two linked wallets is confirmed only after the server verifies, on Horizon mainnet, the source, destination, asset, amount (and memo when present). The receipt links to the mainnet transaction.
- [ ] The SPEC 29 rules hold on mainnet: own offer refused, 1 per offer per day, a short balance refused.
- [ ] **Gate 1:** the whole path ran on testnet with Pollar.
- [ ] **Gate 2:** at least 3 real mainnet payments (2 welcomes and 1 redemption) are verified in the explorer before Thu 26 Nov at 20:00, and their links are in the wiki.
- [ ] No screen shows bolivianos, «XLM», «tokens» or «cripto»; «Stellar (red principal)» appears only on the Yo card.
- [ ] `npm run typecheck` and `npm run build` pass. The pilot's main bundle does not include Pollar (lazy chunk). Tested at 360 px, in light and dark.

## Decisions

- **Yes:** an **invite list** (`MAINNET_BETA_EMAILS`), so Diego controls the Pollar credits. **No:** everyone. (Diego's choice.)
- **Yes:** **Pollar as a separate login inside Yo**, linked to the profile and verified on the server. **No:** replacing the app's login. (Diego's choice.)
- **Yes:** **a mainnet welcome (5, memo `bienvenida`) and a mainnet redemption.** **No:** paying every pilot reward on mainnet. (Diego's choice.)
- **Yes:** **a fixed 1.000.000 YAPITA on mainnet**, with the issuer locked from day one, like testnet. (Diego's choice.)
- **Yes:** the redemption on mainnet lives **inside «Mi billetera propia»**; SPEC 29's sheet is untouched. (Diego's choice.)
- **Yes:** **its own switch** (`MAINNET_ENABLED`). (Diego's choice.)
- **Yes:** a **one-use issuer key**, and the **distributor secret only in `.env` and Vercel**. (Diego's choice.)
- **Yes:** **3 verified mainnet payments before Thu 20:00**, or no live mainnet on Friday. (Diego's choice: the demo is never the first test.)
- **Yes:** **without a memo, the redemption is proved by the stored, verified hash.** (Diego's choice.)
- **Yes:** mainnet uses **own wallets only**, never server custody. With a real asset, custody is the risk Pollar removes.
- **Yes:** a **separate network module**; `points.ts` and the pilot's code paths are not refactored before the final.
- **Diego buys and sends the XLM himself.** Claude never buys, sends or moves crypto.

## Open dependencies (waiting on Ale or Diego)

- **From Ale:**
  - the testnet and mainnet keys;
  - how to load credits, and an estimate for about 20 accounts and 50 payments;
  - **whether `runTx` / `sendPayment` take a text memo** for a custom asset;
  - whether Live mode requires a co-sign confirmation on every payment.
- **From Diego:**
  - roughly 10 real XLM for the issuer and the distributor;
  - the Pollar keys, stored only in `.env` and Vercel;
  - the invite list.
- **From Yaeko:** the partner, who must also connect a wallet for the mainnet redemption.

## Risks

| Risk | Mitigation |
| --- | --- |
| Pollar answers late or the keys arrive Wednesday. | Steps 1 to 6 do not need the keys (mock and network config). Without the testnet keys by Wednesday noon, the mainnet live demo is dropped (gate rule). |
| `runTx` takes no memo. | Proof by verified hash (decision). The welcome keeps its memo because our server signs it. |
| A co-sign modal on every payment slows the live demo. | The 3 gate payments show it, and the demo shows payments made before plus one live payment only if the rehearsal on Thursday is smooth. |
| Pollar's SDK grows the pilot's bundle or breaks it. | It is lazy-loaded only in the card, behind the switch and the invite list. The pilot never loads it. |
| A mistake with real funds. | Fixed fund, locked issuer, a 5-yapita welcome once per profile, invited accounts only, and every redemption verified on Horizon before confirming. Only YAPITA moves, not XLM, apart from the one-time setup. |
| Server API v1 of Pollar retires on 30 Nov. | Only v3 endpoints are used. |
