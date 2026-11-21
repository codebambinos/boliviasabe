# Data layer (`src/data`)

Every screen reads and writes data through this folder, using **hooks** (TanStack Query).
Screens never import `./mock`, `./api` or `@supabase/supabase-js`: always `from '../data'`.
Spec: [`specs/01-data-layer-and-mock-adapter.md`](../../specs/01-data-layer-and-mock-adapter.md).

## Using a hook

```tsx
import { useSigns, useVoteSign, isDataError } from '../data';

function Hoy() {
  const signs = useSigns({ city: 'Cochabamba', search, tags });
  const vote = useVoteSign();

  if (signs.isPending) return <Skeletons />;
  if (signs.isError) return <ErrorBox error={signs.error} onRetry={() => signs.refetch()} />;

  const items = signs.data.pages.flatMap((page) => page.items);
  // «Ver más»: signs.hasNextPage && signs.fetchNextPage()
  // «Me sirvió»: vote.mutate({ id: sign.id, value: 'helpful' })
}
```

- **Lists** (`useSigns`, `useQuestions`, `useMovements`) return pages of 30: join `data.pages`.
- **Mutations** expose `mutate`, `isPending` (disable the button while it works) and `error`.
- Mutations are **never retried automatically**; show «Reintentar» instead.

## Errors

Every failure is a `DataError`. Pick the wiki message from `error.code`:

| `code` | When | What the screen does |
|---|---|---|
| `offline` | No connection | «Sin conexión, intenta de nuevo» + Reintentar |
| `server` | Server failure | «Algo falló, intenta de nuevo» |
| `unauthenticated` | Guest acting, or `field: 'profile'` when «Tu barrio» is pending | Open «Crea tu cuenta para seguir» (or «Tu barrio») |
| `forbidden` | Not allowed (own content, second vote, not the asker…) | Hide or disable the action |
| `not_found` | Deleted or hidden | «Esto ya no está disponible» + Ir a Hoy |
| `validation` | Bad input; `error.field` says which | Message next to that field |
| `limit` | A wiki limit; `error.limit` and `error.until` | Explain which limit and until when |

`limit` values: `questions_per_day`, `open_questions`, `urgent_active`, `insufficient_balance`.

## Mock adapter

With no `.env` (or `VITE_DATA_SOURCE=mock`) the app uses an in-memory mock. It resets on reload.
Every call waits 300–600 ms, so skeletons and disabled buttons are visible.

**Failure modes** — add to the URL, e.g. `http://localhost:5173/?mock=offline`:

| URL | Effect |
|---|---|
| `?mock=slow` | Every call takes 2.5 s |
| `?mock=offline` | Every call fails with `offline` |
| `?mock=error` | Every call fails with `server` |
| `?mock=stellar-error` | New rewards end in «Error» (try «Reintentar»); urgent questions publish as normal |

**Users:**

| How to sign in | Who | Useful for |
|---|---|---|
| «Continuar con Google» | Lucía M. (Cala Cala), balance 17, 2 open questions with answers | The normal signed-in flow |
| Email `jorge@example.com` | Jorge R., has an active urgent question | Answering Lucía's questions |
| Email `ana@example.com` | Ana R., balance 3 | «Te faltan yapitas» on Urgente |
| Any other email (password ≥ 6) | New user without profile | «Tu barrio», «Preparando tu cuenta», welcome +5 |

Any password of 6+ characters works for the seed emails. Cochabamba has 35 signs (two pages),
La Paz has a few items, and Cobija is empty (empty states).

Rewards show as «Pendiente» and become «Confirmado» about 2 s later; `useWallet` and
`useMovements` refresh by themselves while something is pending.

## Adding a method

1. Add it to the `DataApi` contract in `api.ts` (types in `types.ts`).
2. Implement it in `mock/adapter.ts`, with its rule checks in `mock/rules.ts`.
3. Add a key in `keys.ts` and a hook in `hooks/`, invalidating what it changes.
4. Export the hook from `index.ts`.
