# Adding plain-API listings (weather, prices, geocoding…)

The LLM marketplace is finished and recorded. This guide covers adding a second **category**: paid non-LLM APIs that are staked, audited and slashed through the same trust system. How plain APIs are *audited* is the owner's design call. Everything else here is a contract with the existing code, and the [AGENTS.md](../AGENTS.md) "Contracts you must keep" section applies on top.

## Listing identity: the `api:` prefix

The registry contract is deployed with stakes locked in it and has no category field, so it stays as is. A listing is an API listing when its `claimedModel` starts with `api:`:

```
claimedModel = "api:<schema-name>@<version>"      e.g. "api:weather@1"
```

- The schema lives in `schemas/<schema-name>@<version>.json` (JSON Schema). That is the declaration the provider stakes on, and the one the auditor checks against.
- `endpoint` is the paid URL. Pick the HTTP method and request shape per schema, and document them in the schema file (e.g. an `x-request` block).
- Price and stake follow the same rules: USDC atomic units (7 decimals), `register` then `stake`, using the provider's own key.
- `seedListings()` in `@tb/config` is typed for the three LLM listings. Add a sibling such as `seedApiListings()` next to it, and keep `seedListings()` returning the LLM set unchanged (the demo depends on it).

### Weather v1 contract and capability declaration

The first supported API contract is `api:weather@1`, published as an OpenAPI 3.1 document at `/api/schemas/weather/v1`. It defines a JSON `POST /weather/v1/forecast` request with latitude, longitude, and forecast horizon, and a normalized metric response. Its canonical response fields map to MET Norway Locationforecast 2.0 values. Provider-specific values may be declared separately in `extraFields` and returned under `extras`; buyers can see them, but the auditor excludes them from comparison and sanctions.

Request inputs are listed separately from response capabilities. Latitude and longitude are required inputs. Providers choose canonical response fields from the MET Norway field catalog and publish a public JSON manifest at the sibling `/weather/v1/capabilities` path:

```json
{"schema":"api:weather@1","availableFields":["forecast.temperatureC","forecast.validAt"],"extraFields":["pollenRisk"]}
```

The listing form checks that this manifest matches the provider's field selection before registering. The catalog labels canonical fields as provider-declared and shows extras as unverified. The paid forecast route reuses x402; the capability route is public metadata and must allow cross-origin browser reads. The contract is deliberately bounded to one weather operation and is not a generic OpenAPI marketplace.

For the live walkthrough, `pnpm demo:weather` starts four unlisted local endpoints on ports 4003–4006. Owners manually submit the endpoints through `/list`; only then do they appear in the catalog. Port 4003 relays MET Norway values exactly, 4004 makes small in-tolerance adjustments, 4005 makes large contradictions, and 4006 returns the reference values plus extra fields. All four call MET Norway; the adjustments are intentional demo behavior. Paid forecast calls use x402 and follow `PAYMENTS_MODE`. For shared demo hosts the browser, agent and auditor send `x-tb-listing-id`. The host resolves that ID against the registry, verifies the endpoint and active stake, and charges the listing price to its registered owner. It never trusts a client-supplied payout address. A unique active endpoint registration can be selected without the header; ambiguous requests fail before payment. Unregistered demos use the original `TB_WEATHER_*` payout identities. Historical transfers to those fixtures stay credited to the fixtures and are displayed to buyers as legacy payouts. Paywalled servers allow the routing header in shared `buyerCors`. Listings and stakes normally require wallet signatures on Stellar Testnet.

## Multiple listings and exits

The provider wallet owns the listing; a separate 32-byte listing ID identifies each service. A wallet can create multiple endpoints, including several weather listings, each with an independent user-entered name and stake. The human form uses `registerEndpoint` to register and transfer the initial stake atomically in a wallet-signed transaction. New records live in the additional `LISTING_REGISTRY_CONTRACT_ID` instance; legacy records remain in `REGISTRY_CONTRACT_ID`. Reads aggregate both.

Dashboard exposes per-ID top-up, rename, removal request, cancellation, and withdrawal with wallet approval. The onchain exit grace is initially 10 seconds and can be changed by the admin with `set_exit_cooldown`; existing exit deadlines do not change. Listing discovery stops after the grace; the owner then confirms withdrawal. Slashing can still consume remaining stake before that withdrawal. Retired records stay in history. Legacy entries support the deployed immediate `unregister` refund.

Audits and agent exclusion/trust checks use `id ?? provider`, so a failed service does not slash or exclude every service owned by the same account. Earnings from plain USDC transfers can only be attributed to the payout wallet, not to an individual endpoint when wallets are shared.

## Serving: reuse the paywall

API providers go through the same x402 path as the LLM providers:

- Server: `paywall(route, priceUsd, payTo)` from `apps/providers/src/paywall.ts`. Mount it either in `createApp()` beside the LLM routes, or in a new app that reuses `paywall()` and the same CORS middleware. Browsers send `payment-signature` and `access-control-expose-headers`, and must be able to read `payment-response`; see the CORS tests in `apps/providers/test/providers.test.ts`.
- Client: `createPayingFetch(secret)` from `@tb/x402-client`. The agent and auditor already use it; it returns `res.payment.txHash`.
- One honest provider and one cheater, both ours, make the demo story work. A cheater could serve stale data, break the schema, or return fixed or fabricated values.

## Auditing: plug in beside the LLM path

`apps/auditor/src/runner.ts` dispatches `api:weather@1` to a MET Norway comparison and keeps the existing LLM path for other listings.

To add one, keep these rules:

- **Dispatch on the prefix inside `auditOne()`.** `api:` listings go to the new audit; everything else stays on the existing path, untouched.
- **Return the same `Verdict` shape** (`apps/auditor/src/scoring.ts`): `score` 0–100, `pass`, `inconclusive`, `scored`, `matchedModel` (for APIs, a short label of what was observed, e.g. `"schema mismatch"`), `confidence`. The web card, audit log and slash logic read exactly these fields.
- **Slash through the existing path.** `registry.slash` and then `registry.pauseListing`, with the auditor key. The auditor role is the only one that can slash.
- **Keep the safety rules the LLM audit follows.** A verdict needs at least `MIN_SCORED` (5) scored probes. Network errors are retried once and then excluded, never counted as cheating. An undecidable result is `inconclusive: true` and never slashes.
- **Probes are paid traffic.** The auditor pays every probe over x402 like a customer, so probes look like ordinary requests.

Each numeric or timestamp field earns `max(0, 100 - 20 × absoluteError / tolerance)` points: exact values earn 100, an error equal to the tolerance earns 80, and five tolerance units earn 0. Wind direction uses circular distance. Missing, malformed or physically invalid provider values earn 0; reference values that cannot be checked are excluded. Exact-match strings earn 100 or 0. The overall grade is the mean of all compared field scores, rounded down. The initial passing grade is 80/100, configurable with `WEATHER_TRUST_THRESHOLD`. This measures agreement with MET Norway, rather than the probability that a provider is honest. Earlier audits used a binary in-tolerance percentage; the dashboard identifies those historical results rather than silently rewriting them.

Weather disagreements and user votes no longer trigger automatic warnings or slashing. A comparable failed audit may open one shared review case per listing; configured human moderators examine evidence and the provider's response. Financial sanctions require a public reason and a separate signed approval; the auditor executes slash then pause. The old `WEATHER_WARNING_THRESHOLD` setting is ignored. Evidence, cases and decisions are persisted in Supabase when configured; standalone local auditing remains available. See [community trust](superpowers/specs/2026-10-25-community-trust.md) and the [Supabase setup guide](supabase-setup.md).

## UI and agent

- `ListingCard` shows `claimedModel` as "Serves …". An `api:` label should render readably (e.g. "Weather API v1").
- "Try it" (`TryItPanel`) speaks chat completions only. Hide it for `api:` listings or give them their own panel. Don't change the chat path.
- `chooseListing()` in the agent matches `claimedModel` exactly, so an agent can shop for `api:weather@1` with no code change.

## Done when

- `pnpm test` and `cargo test -p registry` are green, and the new audit has tests in the RED→GREEN style used in `apps/auditor/test/` (an honest API passes, a cheating API is slashed once, an erroring API is not slashed).
- The LLM demo still runs unchanged (`docs/demo-runbook.md`).
- The README's "Honest limits" section gains one line describing what the API audit can and cannot catch.
