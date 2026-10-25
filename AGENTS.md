# TrustBazaar

Hackathon build (HackMeridian, deadline **12:00 2026-10-26**): a Stellar-testnet marketplace for pay-per-request LLM endpoints. Providers stake in a Soroban registry; an auditor probes them over x402 and slashes liars.

- **Spec** (the authority on what to build): `docs/superpowers/specs/2026-10-25-trustbazaar-design.md`
- **Plan** (task order, interfaces, tests): `docs/superpowers/plans/2026-10-25-trustbazaar.md`
- **Progress ledger** (which tasks are done, every ruling made): `.superpowers/sdd/2026-10-25-trustbazaar/progress.md`. Read it before resuming work, and append a `Ruling:` line whenever you deviate from the plan.

## Boundaries

- Every app reads and writes the registry through `@tb/registry-client`. `REGISTRY_MODE=onchain|offchain` switches the implementation; both follow the contract's rules and error names (`AlreadyRegistered`, `NotRegistered`, `NonPositiveAmount`).
- Every x402 payment goes through `paywall()` (`apps/providers/src/paywall.ts`) on the server side and `createPayingFetch()` (`@tb/x402-client`) on the client side. `PAYMENTS_MODE=simulated` is the documented fallback; the README must say when it is used.
- Seed listing metadata (names, claimed versus served models, prices) has one source: `seedListings()` in `@tb/config`.

## Gotchas

- `FACILITATOR_URL=local` runs an in-process x402 facilitator that pays fees with the admin key. The hosted OpenZeppelin facilitator needs an API key, and using generated keys was blocked, so the user decides whether to switch to it.
- MiniMax: `MiniMax-M2` is retired; use `MiniMax-M2.7`. Responses include `<think>…</think>` blocks, which must be stripped before showing or scoring them.
- Version pins: soroban-sdk `=28.0.0` with OpenZeppelin Stellar crates `=0.8.0`, and `@x402/*` 2.28.0. Upgrading one without the others breaks the build.
- OpenZeppelin Pausable already defines a `Paused` event, so contract events need different names (we use `ListingPaused`).
- Testnet identities live in the stellar CLI as `tb-<role>` (`stellar keys ls`), and `.env` mirrors them as `TB_<ROLE>_PUBLIC/SECRET`. Secrets stay in `.env`: read them through `loadConfig()`, and keep them out of output and commits.
- A settled x402 payment takes about 10 seconds. Allow for that in timeouts and in the demo pacing.

## Commands

`pnpm test` (vitest), `pnpm typecheck`, `cargo test -p registry`, `scripts/deploy-registry.sh`, `pnpm tsx scripts/seed-listings.ts`, `pnpm tsx scripts/check-env.ts`.
