# TrustBazaar API Marketplace — Weather v1

Date: 2026-10-25
Branch: `feat/api-providers-marketplace`
Status: Design in progress; weather reference coverage is awaiting a product decision.

## Goal

Add a weather API category to TrustBazaar so providers can list a weather endpoint, stake through the existing registry, sell requests over x402, and disclose exactly which standardized weather fields they provide. Human buyers see an understandable capability matrix; agents can discover the same contract and capability data programmatically.

Keep the existing LLM marketplace and demo listings working unchanged. Keep the deployed registry ABI frozen.

## Catalog categories

The catalog has three filters: **All**, **API**, and **Inference**. Listings are classified from the existing `claimedModel` value: an `api:` prefix means API; all other listings are inference. The three existing demo listings and `seedListings()` remain unchanged.

## Weather contract

- Category identity: `api:weather@1`.
- A canonical, versioned JSON Schema describes the request and response. The marketplace publishes it for both agents and the human Try it form.
- Requests use JSON over `POST`; the provider endpoint is paid by x402. V1 supports one weather operation per listing.
- Request fields and response fields are distinct. Location coordinates are request inputs; if a provider echoes resolved coordinates, those are response capabilities. The UI must not confuse an input with an unavailable output.
- The schema defines a broad, stable field catalog. Providers declare a subset they supply. Each provider capability response uses stable field IDs from that catalog and includes a schema version.
- Capability discovery is public and machine-readable; weather data calls remain paywalled. The discovery response is a provider claim, and the auditor checks that claimed fields are actually returned.
- Human UI shows a green check and “Provided” for declared fields and a red crossed-circle and “Not provided” for the others. Labels include units and short descriptions. Screen readers receive text labels; color/icon alone does not carry meaning.
- Buyers and agents can retrieve the canonical schema and provider capability manifest without paying. Providers must not expose upstream API credentials in these documents or in buyer responses.

## Registry and payments

Providers register and stake with their own key through `@tb/registry-client`; amounts remain USDC atomic units. API identity stays in `claimedModel` as `api:weather@1`. No contract or registry ABI changes are allowed. API requests and auditor probes use the existing `paywall()` and `createPayingFetch()` x402 path. Existing CORS behavior must continue to allow browser payment headers and expose payment response headers.

The listing UI must disclose that stake is locked by the current registry (there is no unstake operation). The README must state the actual payment mode and all limitations of weather verification.

## Audit safety

The auditor dispatches by the `api:` prefix and preserves the existing `Verdict` shape. It validates responses against the canonical schema and checks declared capabilities. A schema or field claim that cannot be checked against a trusted reference is unverifiable and never slashed. Network failures are retried once and excluded. At least `MIN_SCORED` (5) scored probes are required. A failed, sufficiently scored audit uses the existing auditor key and calls `slash` before `pauseListing`.

The exact reference source, geographic coverage, field tolerances, and freshness limits are a blocking design decision. Do not implement semantic weather slashing until this is resolved and the comparison rules are written down. Schema conformance and source-specific response differences alone must not be presented as proof of truthful weather data.

## Provider and buyer experience

- Provider selects a supported category/schema, supplies a paywalled endpoint and declares supported fields from the shared field catalog.
- Provider publishes a capability manifest at the documented endpoint convention. The manifest contains category/version, field IDs, units/format where relevant, and no secrets.
- Catalog shows field availability per API listing and lets buyers inspect the canonical request/response example.
- Human Try it renders inputs from the request schema, makes one paid request, displays structured output with units, and shows the x402 transaction hash.
- Agents select an API listing by schema ID, retrieve the schema and capabilities, construct a valid request, pay through x402, and parse the declared response.
- “Other” is not a v1 category. Unsupported schemas are not silently accepted as weather and cannot receive weather verification claims.

## Out of scope for v1

Arbitrary user-defined API schemas, generic truth verification for every API, streaming, file/binary payloads, multi-operation OpenAPI services, and registry contract changes.

## Acceptance criteria

1. Catalog filters show All, API, and Inference, with current LLM seed behavior unchanged.
2. `api:weather@1` has one canonical request/response schema and stable field catalog.
3. A provider can declare a subset of fields; buyers can retrieve it and understand supported versus unavailable fields visually and with assistive technology.
4. Human Try it and an agent use the same schema, capability manifest, endpoint contract, and x402 payment flow.
5. The API audit can only slash after the documented reference checks are resolved, at least five probes are scored, and the verdict is not inconclusive.
6. Existing LLM serving, auditing, listing, and demo flows remain unchanged.
7. README Honest limits documents coverage, reference source, field accuracy limits, payment mode, and locked stake behavior.

## Open decision

Choose either (a) U.S.-only v1 using the NWS API as an open reference, or (b) global coverage using a paid/licensed weather reference. No free Open-Meteo dependency will be used for a commercial or promotional marketplace demo without confirming the appropriate paid license.
