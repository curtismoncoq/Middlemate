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

The first supported API contract is `api:weather@1`, published as an OpenAPI 3.1 document at `/api/schemas/weather/v1`. It defines a JSON `POST /weather/v1/forecast` request with latitude, longitude, and forecast horizon, and a normalized metric response. The `packages/weather-contract` package contains the canonical schema and stable field catalog for the web app and agent.

Request inputs are listed separately from response capabilities. Latitude and longitude are required inputs; they are not marked “not provided” when a provider does not echo resolved coordinates. Providers choose from the response field catalog and publish a public JSON manifest at the sibling `/weather/v1/capabilities` path:

```json
{"schema":"api:weather@1","availableFields":["forecast.temperatureC","forecast.validAt"]}
```

The listing form checks that this manifest matches the provider's field selection before registering. The catalog labels those fields as provider-declared; it must not present declarations as independently verified until the weather audit verifies them. The paid forecast route reuses x402; the capability route is public metadata and must allow cross-origin browser reads. The contract is deliberately bounded to one weather operation and is not a generic OpenAPI marketplace.

For the synthetic local walkthrough, `pnpm demo:weather` starts three unlisted fixture endpoints on ports 4003–4005. Owners manually submit the endpoint they choose through `/list`; only then does it appear in the catalog. `Weather Atlas Demo` supports the full response field set; `Thermo Simple Demo` returns core temperature fields; `Rain & Wind Demo` focuses on precipitation, wind, cloud cover, coordinates, and the weather code. Values are generated fixtures, not upstream weather data. Their API requests are real x402 USDC payments to each fixture's own testnet wallet (roles `weatherAtlas`, `weatherThermo`, `weatherRainwind`, created by `scripts/setup-keys.sh`), and follow `PAYMENTS_MODE` like every other endpoint. Paywalled servers use the shared `buyerCors` middleware (`apps/providers/src/cors.ts`) so browser buyers can pay. Listing and stake transactions use the configured registry mode; with the demo's normal `REGISTRY_MODE=onchain` setting they are signed in the wallet and submitted to Stellar Testnet.

## Serving: reuse the paywall

API providers go through the same x402 path as the LLM providers:

- Server: `paywall(route, priceUsd, payTo)` from `apps/providers/src/paywall.ts`. Mount it either in `createApp()` beside the LLM routes, or in a new app that reuses `paywall()` and the same CORS middleware. Browsers send `payment-signature` and `access-control-expose-headers`, and must be able to read `payment-response`; see the CORS tests in `apps/providers/test/providers.test.ts`.
- Client: `createPayingFetch(secret)` from `@tb/x402-client`. The agent and auditor already use it; it returns `res.payment.txHash`.
- One honest provider and one cheater, both ours, make the demo story work. A cheater could serve stale data, break the schema, or return fixed or fabricated values.

## Auditing: plug in beside the LLM path

Today `apps/auditor/src/runner.ts` sends every active listing chat-completion probes. For an `api:` listing those requests fail, so the verdict comes out *inconclusive* or *unverifiable* and the listing is **never slashed**. That safe default holds until a real API audit exists.

To add one, keep these rules:

- **Dispatch on the prefix inside `auditOne()`.** `api:` listings go to the new audit; everything else stays on the existing path, untouched.
- **Return the same `Verdict` shape** (`apps/auditor/src/scoring.ts`): `score` 0–100, `pass`, `inconclusive`, `scored`, `matchedModel` (for APIs, a short label of what was observed, e.g. `"schema mismatch"`), `confidence`. The web card, audit log and slash logic read exactly these fields.
- **Slash through the existing path.** `registry.slash` and then `registry.pauseListing`, with the auditor key. The auditor role is the only one that can slash.
- **Keep the safety rules the LLM audit follows.** A verdict needs at least `MIN_SCORED` (5) scored probes. Network errors are retried once and then excluded, never counted as cheating. An undecidable result is `inconclusive: true` and never slashes.
- **Probes are paid traffic.** The auditor pays every probe over x402 like a customer, so probes look like ordinary requests.

Ideas, not requirements: JSON-Schema validation of every response; cross-checking values against an independent source (e.g. a second weather API) within a tolerance; freshness checks on timestamps; repeated identical queries to catch fabricated randomness.

## UI and agent

- `ListingCard` shows `claimedModel` as "Serves …". An `api:` label should render readably (e.g. "Weather API v1").
- "Try it" (`TryItPanel`) speaks chat completions only. Hide it for `api:` listings or give them their own panel. Don't change the chat path.
- `chooseListing()` in the agent matches `claimedModel` exactly, so an agent can shop for `api:weather@1` with no code change.

## Done when

- `pnpm test` and `cargo test -p registry` are green, and the new audit has tests in the RED→GREEN style used in `apps/auditor/test/` (an honest API passes, a cheating API is slashed once, an erroring API is not slashed).
- The LLM demo still runs unchanged (`docs/demo-runbook.md`).
- The README's "Honest limits" section gains one line describing what the API audit can and cannot catch.
