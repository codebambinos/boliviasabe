# BoliviaSabe

Mobile-first web app (PWA) for the National Startups by Stellar hackathon
(**deadline: Sunday, 22 Nov 2026**). Neighbors post photo "letreros" (local prices, offers and
services) and ask questions in "¿Alguien sabe?". Helping earns **yapitas**, a YAPITA asset on
Stellar testnet.

**Read the wiki before writing code or answering product questions.** The wiki is the final
contract for every flow and rule. Start with `wiki/index.md`, then `wiki/flujo-final.md`,
`wiki/reglas-finales.md`, `wiki/stellar-final.md` and `wiki/tecnico.md`.
The wiki lives in the private repo `CodeBambinos/boliviasabe-docs`. Clone it next to this repo
and link it: `ln -s ../boliviasabe-docs/wiki wiki` (the link is git-ignored). Run `git pull` there
to get the latest version. Tasks live on the GitHub Projects board "BoliviaSabe – Delivery".

## Language
- **Code is in English:** identifiers, file names, tables, comments, commits and PRs.
- **UI copy is in Spanish (Bolivia)**, taken from the wiki.
- **The wiki is in Spanish.** Any product change is recorded in the wiki first
  (`huecos-cerrados.md` + `log.md`), never only in code.

## Rules that never break
- Flows follow `wiki/flujo-final.md`. Do not change a flow without a product decision in the wiki.
- On screen the currency is always «yapitas». Never «XLM», «estelares», «tokens», «cripto»,
  «blockchain», «puntos» alone, or any value in bolivianos.
- **Testnet only.** Secrets live in `.env` or Vercel environment variables, never in the repo or
  the browser bundle. Only `VITE_*` variables reach the client, and they must be public values.
- `@stellar/stellar-sdk` is server-only (`api/`, `lib/`, `scripts/`). The browser reads balance and
  movements from Horizon with `fetch`.
- All data access goes through `src/data/` (one interface, a Supabase adapter and a mock adapter).
- Table IDs are numeric (`bigint identity`): Stellar memos hold at most 28 bytes.
- A Stellar failure never blocks rating, answering or posting: the reward stays `pending`.
- Colors and fonts come from CSS variables in `src/styles/tokens.css`. Light and dark always.

## Stack
Vite + React + TypeScript (strict), React Router, TanStack Query, Supabase (Auth, Postgres + RLS,
Storage, Realtime), Vercel functions in `api/`, Web Push (`web-push`), `vite-plugin-pwa`.
Versions are pinned exactly in `package.json`; install with `--save-exact`.

## Commands
- `npm run dev` / `npm run build` / `npm run typecheck`
- `npm run stellar:setup`: create or reuse issuer and distributor, issue YAPITA (idempotent).
- `npm run stellar:e2e`: end-to-end check on testnet (+5, +5, −5 → balance 5).

## Definition of done
`npm run typecheck` and `npm run build` pass, `npm run stellar:e2e` passes when Stellar is touched,
the screen was tested on a phone at 360 px, and `git grep -i "SECRET\|SERVICE_ROLE"` shows no values.

## Git
- Short imperative commit subjects in English (`feat:`, `fix:`, `chore:`). No AI attribution.
- `main` is protected: work in branches and open a PR.
- One branch per task (e.g. `feat/t18-hoy`). Every PR links its board issue in the description
  (`Closes #11`) so the card moves to Done on merge.
