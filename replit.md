# SolBubble

SolBubble is a fast Solana memecoin research tool that combines DexScreener market context with Helius on-chain intelligence.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/solbubble/src/` — responsive React interface for search, token intelligence, and wallet profiles
- `artifacts/api-server/src/routes/intelligence.ts` — validated API routes for token and wallet research
- `artifacts/api-server/src/lib/solana-intel.ts` — DexScreener and Helius provider adapters
- `lib/api-spec/openapi.yaml` — source of truth for the typed API contract
- `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` — generated client hooks and response schemas

## Architecture decisions

- Market search and token metadata come from DexScreener's public API.
- Holder, early buyer, and wallet enrichment runs server-side through Helius so the API key never reaches the browser.
- The app uses the shared Express API server and the workspace's OpenAPI-first code generation rather than direct browser calls to third-party APIs.
- When a provider cannot return a data set, the UI shows an explicit error or empty state instead of inventing trust-critical data.

## Product

- Search Solana tokens by name, symbol, or mint.
- Inspect live market stats, pair context, approximate token age, social links, and a 24-hour pulse.
- Compare top holders, concentration risk, and earliest detected buyers.
- Open any wallet to inspect holdings, recent activity, and wallet-age cues.

## User preferences

- Keep the product dark, clean, modern, readable, responsive, and focused on a free DexScreener + Helius stack.

## Gotchas

- `HELIUS_API_KEY` is required for holders, early buyers, and wallet profiles; DexScreener search and market pages work independently.
- Run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI change, then run the relevant workspace typecheck.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
