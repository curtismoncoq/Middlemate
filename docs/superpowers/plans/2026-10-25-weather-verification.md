# Plan — MET Norway weather verification

## 1. Contract and fixtures

- [x] Replace the selectable response catalog with MET Norway-backed normalized fields.
- [x] Add validated free-form `extraFields` to capabilities and `extras` to responses.
- [x] Add a cached, identified MET Norway client and mapping tests.
- [x] Start four live-reference fixtures on ports 4003–4006: exact, tolerant, false and extras.

## 2. Auditor

- [x] Dispatch `api:weather@1` beside the unchanged LLM audit path.
- [x] Pay for five provider probes, compare declared canonical fields and exclude reference/network errors.
- [x] Persist field-level evidence and warning 1/2; slash and pause only on the third failed weather audit.
- [x] Keep listing identity `id ?? provider` throughout.

## 3. Web

- [x] Let providers enter additional field names and require the public manifest to match.
- [x] Show canonical MET Norway fields and unverified extras in catalog/Try it.
- [x] Show warnings, evidence, source attribution and chain transactions on Dashboard.
- [x] Route shared demo payments to the verified onchain listing owner; pass listing identity from browser, agent and auditor.
- [x] Decode current SAC events, scan empty RPC pages, index both wallet directions and exclude wallet funding from payment totals.

## 4. Documentation and gates

- [x] Update `docs/api-listings.md`, demo runbook and README honest limits/testing steps.
- [x] Run `pnpm test`, `pnpm typecheck`, and `cargo test -p registry`.
- [ ] Inspect responsive web output manually with the app running.
