# Plan — Weather API Marketplace

Work on branch `feat/api-providers-marketplace`; merge back into `build` only after the feature gates are satisfied. The LLM marketplace is a protected baseline. Do not change the deployed registry ABI.

## Stage 0 — Design gate

- [x] Create an isolated API marketplace branch.
- [x] Read `docs/api-listings.md` and the current listing, provider, auditor, and catalog interfaces.
- [x] Draft the weather v1 spec with catalog filters, schema discovery, capability disclosure, visual states, and audit safeguards.
- [ ] Decide audit reference geography/source (U.S.-only NWS or global paid source).
- [ ] Define field-level comparison tolerances and freshness rules for the selected source.
- [ ] Update the spec and ledger with the final ruling before semantic audit implementation.

## Stage 1 — Canonical weather contract

- [x] Add a versioned `api:weather@1` OpenAPI 3.1 contract and shared field catalog with stable IDs, labels, units, descriptions, and request/response grouping.
- [x] Add capability validation and URL helpers in a shared package; keep `seedListings()` unchanged.
- [x] Define a public capability manifest and endpoint convention; it declares only response field IDs from the canonical catalog and identifies the schema version.
- [x] Document which fields are request inputs versus response capabilities.

## Stage 2 — Provider contract and paid endpoint

- [x] Add a synthetic local weather fixture adapter for demo/testing; real upstream source remains undecided.
- [x] Reuse the existing x402 paywall and browser CORS rules for weather requests.
- [x] Expose public schema/capability discovery without charging for metadata.
- [x] Add isolated local fixture endpoints with simulated API request payments; never auto-seed weather into the catalog.
- [x] Ensure the listing form registers and stakes through the existing wallet-signed registry transaction path; the demo script preserves the configured Testnet modes.

## Stage 3 — Audit path

- [ ] Dispatch `api:` listings to a weather auditor while preserving the current LLM path and `Verdict` shape.
- [ ] Validate response schema and declared field behavior.
- [ ] Apply the agreed independent reference checks, tolerances, and freshness limits.
- [ ] Retry network failures once and exclude them; mark no-reference/too-few-score results inconclusive.
- [ ] Slash only after `MIN_SCORED` scored probes and use the existing `slash` then `pauseListing` sequence.

## Stage 4 — Marketplace and clients

- [x] Add All / API / Inference catalog filters; preserve listing identity and current LLM seed cards.
- [x] Add a weather capability matrix with green check “Provided” and red crossed-circle “Not provided”, separate request inputs, text labels, field units, and descriptions.
- [x] Add a weather Try it form with the shared contract request and x402 payment/transaction display.
- [x] Add an agent weather request path that discovers capabilities and uses the shared schema ID.
- [x] Add weather category selection and capability checkboxes to provider listing; require the public capability manifest to match before registration.
- [ ] Keep LLM Try it behavior unchanged.

## Stage 5 — Honest limits and integration gate

- [x] Update README Honest limits and weather provider instructions.
- [x] Update demo runbook with synthetic weather flow and reference constraints.
- [ ] Follow repository test-first workflow and project gates before any commit: `pnpm test`, `pnpm typecheck`, and `cargo test -p registry`.
- [ ] Exercise LLM demo unchanged and one honest API provider end-to-end; verify no false slashes on errors or unverifiable data.

## Current status

The contract, public schema route, generic x402 weather provider mount, capability discovery, catalog filters, capability display, provider declaration form, weather Try it form, and agent request path are implemented. `pnpm demo:weather` starts three unlisted synthetic API endpoints; a user submits one via `/list`, and with the repository's configured `REGISTRY_MODE=onchain` the listing and stake go to the deployed Testnet registry after wallet signatures. Calls to these local fixtures use simulated API payments only. The dashboard reads confirmed USDC transfers from Stellar RPC (recent seven-day window), never a local activity file. Real upstream integration and API auditing remain open. The reference geography/source decision is pending, so no semantic weather slashing has been added.
