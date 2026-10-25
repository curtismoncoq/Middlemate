# Plan — Wallet dashboard

Branch: `feat/api-providers-marketplace`

1. [x] Create provider and buyer dashboard views with empty states, stake cards, recent activity, and money charts.
2. [x] Read listings, stake, and audits through existing application services.
3. [x] Replace local request logging with successful USDC transfer events read from Stellar Testnet RPC.
4. [x] Limit activity/chart labeling to the RPC's recent seven-day event window.
5. [x] Keep synthetic weather fixture requests simulated and explicitly exclude them from chain-based earnings/spend.
6. [x] Keep provider shutdown messaging consistent with the auditor-only `pause_listing` contract role.
7. [x] Run focused tests, `pnpm typecheck`, full `pnpm test`, and `cargo test -p registry`; inspect final diff for accidental changes to LLM behavior.

## Current status

Implementation is in place. `pnpm test` passes (68 tests), `pnpm typecheck` and the web TypeScript check pass, and `cargo test -p registry` passes (11 tests). Full diff review and teammate review remain.
