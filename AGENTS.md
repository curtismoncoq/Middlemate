# TrustBazaar

Hackathon build (HackMeridian, deadline **12:00 2026-10-26**): a Stellar-testnet marketplace for pay-per-request AI and API endpoints. Providers stake in a Soroban registry; an auditor probes them over x402 and slashes liars. The LLM marketplace is finished and demo-ready. Every change must leave it working.

- **Spec** (what was built and why): `docs/superpowers/specs/2026-10-25-trustbazaar-design.md`
- **Plan and ledger** for the LLM marketplace: `docs/superpowers/plans/2026-10-25-trustbazaar.md` and `.superpowers/sdd/2026-10-25-trustbazaar/progress.md` (task status plus every `Ruling:`). New work gets its own spec, plan and ledger; leave these ones as the record.
- **Adding a non-LLM API category** (weather, prices…): read `docs/api-listings.md` before writing code.
- **Recording the demo:** `docs/demo-runbook.md`.
- **Changing anything visual** in `apps/web`: follow `docs/design.md` (colours, type, radius 0, the stall drawing).

## Contracts you must keep

These interfaces are shared by the contract, providers, auditor, agent and web app. Extend them by adding beside them, and keep existing signatures and behaviour intact.

- **The registry ABI is shared by every app.** The deployed registry is `CCW4UFJ7MSNSWOQWZWG3XOF2IVVWVRINK3YCEROH6PDO4LW5ZPA6ELUA` (`REGISTRY_CONTRACT_ID` in `.env`). Change the ABI (`register`, `stake`, `slash`, `pause_listing`, `unregister`, `is_active`, `get`, `list`, the `Listing` struct, the `auditor` role) only with the team's agreement. A redeploy needs `scripts/deploy-registry.sh`, a restart of `pnpm dev`, and then `pnpm demo:reset`; stakes come back first via `unregister`.
- **Registry access goes through `@tb/registry-client`**: `createRegistryClient()` → `list/get/isActive/register/stake/slash/pauseListing/unregister`, with amounts as `bigint` USDC atomic units (7 decimals). `REGISTRY_MODE=onchain|offchain` swaps the backend; both follow the contract's rules and error names (`AlreadyRegistered`, `NotRegistered`, `NonPositiveAmount`).
- **Multiple listings are additive.** `LISTING_REGISTRY_CONTRACT_ID` points to an additional instance exposing `register_endpoint`, per-ID stake/audit/rename, and request/cancel/withdraw exit methods. Preserve the legacy ABI and deployment. New `Listing.id` identifies the service; `provider` remains its owner/payout wallet. Always key audits, UI rows and agent exclusions by `id ?? provider`. New exits default to 10 seconds (admin-configurable onchain); legacy unregister remains immediate. Never reset or redeploy a registry holding per-listing stakes without owner withdrawals.
- **Payments go through x402**: `paywall()` (`apps/providers/src/paywall.ts`) on the server and `createPayingFetch()` (`@tb/x402-client`) on the client. Browser buyers also need CORS: mount `buyerCors` (`apps/providers/src/cors.ts`) on every paywalled server. `PAYMENTS_MODE=simulated` is the documented fallback, and the README must say when it is used.
- **Audit verdicts keep their shape and safety rules**: the `Verdict` type in `apps/auditor/src/scoring.ts`. Slashing needs at least `MIN_SCORED` scored probes; errors are retried and excluded; a claimed model or schema with no reference is *unverifiable* and never slashed. Only the auditor key slashes, and always `slash` then `pauseListing`.
- **Category by prefix**: a `claimedModel` starting with `api:` is an API listing (`api:<schema>@<version>`); everything else is an LLM. The demo listings come from `seedListings()` in `@tb/config` and must stay as they are (Provider A, Provider B, CheapMax).
- **README honesty**: every limit of a new feature gets a line in the README's "Honest limits" section.

## How to work here

- Branch from `build` and merge back into `build`.
- Test-first: write the test, watch it fail, then make it pass. `pnpm test` (vitest), `pnpm typecheck` and `cargo test -p registry` are all green before every commit.
- Secrets stay in `.env`: read them through `loadConfig()`, and keep them out of output, logs and commits. Testnet identities are `tb-<role>` in the stellar CLI and `TB_<ROLE>_PUBLIC/SECRET` in `.env`.

## Gotchas

- `FACILITATOR_URL=local` runs an in-process x402 facilitator that pays fees with the admin key. The hosted OpenZeppelin facilitator needs an API key, which the user would have to provide.
- MiniMax: `MiniMax-M2` is retired; use `MiniMax-M2.7`. Its output contains `<think>…</think>` blocks; `stripThinking()` removes them.
- Version pins: soroban-sdk `=28.0.0` with OpenZeppelin Stellar crates `=0.8.0`, and `@x402/*` 2.28.0. They upgrade together or not at all.
- OpenZeppelin Pausable already defines a `Paused` event (ours is `ListingPaused`).
- The x402 browser client resends the paid request with an `Access-Control-Expose-Headers` request header; any paywalled server must allow it in CORS preflight.
- A settled x402 payment takes about 10 s; set timeouts with that in mind.
- `pnpm demo:reset` (with `pnpm dev` running) unregisters every listing (stakes refunded), seeds Provider A, and audits it once.
- `AUDIT_INTERVAL_MS=0` keeps the auditor timer off, because every audit round spends the auditor's USDC.

## Commands

`pnpm dev`, `pnpm test`, `pnpm typecheck`, `cargo test -p registry`, `pnpm agent`, `pnpm seed`, `pnpm demo:reset`, `pnpm check-env`, `scripts/deploy-registry.sh`.
