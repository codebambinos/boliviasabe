# BoliviaSabe

*Entre bolivianos nos ayudamos.*

A mobile-first web app where neighbors share what is happening in their city today: photo
"letreros" with local prices and offers, and questions anyone can answer. Helpful answers earn
**yapitas**, an asset on the Stellar test network. Built by CodeBambinos for the National Startups
by Stellar hackathon (2026).

## Requirements
- Node 24 (`nvm use`)
- A Supabase project and, for deploys, a Vercel project

## Setup
```bash
npm install
cp .env.example .env      # fill in the Supabase values
npm run stellar:setup     # creates the testnet issuer and distributor, writes keys to .env
npm run stellar:e2e       # checks the YAPITA flow end to end
npm run dev
```

## Scripts
| Script | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Type-check and production build |
| `npm run typecheck` | Type-check only |
| `npm run stellar:setup` | Create or reuse the YAPITA issuer and distributor (idempotent) |
| `npm run stellar:e2e` | End-to-end check on testnet |

## Notes
- Stellar **testnet only**: no real money is involved.
- Never commit `.env`. See `CLAUDE.md` for the project rules.
