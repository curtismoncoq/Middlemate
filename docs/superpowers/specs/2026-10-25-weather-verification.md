# TrustBazaar — MET Norway weather verification

Date: 2026-10-25
Branch: `feat/weather-api-verification`
Status: Approved for implementation

Enforcement update: the subsequent approved [community trust specification](2026-10-25-community-trust.md) replaces the automatic three-warning weather slash with human review. Comparisons and grading below remain; weather disagreement alone never sanctions a provider. The original progression described here is retained as the design history.

## Product rule

TrustBazaar designates MET Norway Locationforecast 2.0 as the reference for every `api:weather@1` listing. Providers may use any upstream source, but by listing under the weather contract they accept comparison against MET Norway. The listing form, catalog and provider dashboard identify MET Norway, link to the official service and explain that repeated material contradictions can slash the listing stake.

MET Norway is a forecast reference, not a measurement oracle. One outlier is evidence, not fraud. A financial sanction therefore requires three failed audit rounds, each containing at least five valid, comparable paid probes. Network errors, missing reference values and malformed upstream responses are retried once and excluded. Fewer than five scored probes is inconclusive and cannot create a warning or slash.

## Canonical fields

The selectable fields mirror normalized values returned by MET Norway Locationforecast `complete`: resolved latitude and longitude; forecast time; source update time; air and apparent temperature; relative humidity; dew point; one-hour precipitation; wind speed and direction; total, low, medium and high cloud cover; sea-level pressure; clear-sky UV index; fog area fraction; and the MET Norway symbol code.

Units are normalized in `api:weather@1`: Celsius, percent, millimetres, kilometres per hour, degrees and hPa. Provider capability manifests declare a subset of those stable IDs.

Providers may also declare free-form `extraFields`. Extra values are returned under the response `extras` object. Their names are displayed to buyers but never scored or used for warnings or slashing in this version.

## Comparison and verdict

The auditor selects five fixed global coordinates and forecast horizons. For every probe it buys the provider response over x402 and fetches the corresponding MET Norway reference server-side. The provider is judged only on canonical fields it declared. A missing declared field is a contradiction; a MET field unavailable for that location/time is excluded.

Field tolerances are published in `apps/auditor/src/weather-audit.ts`. Circular distance is used for wind direction; timestamps use a time tolerance; strings such as `symbolCode` require equality. Each numeric/timestamp field earns `max(0, 100 - 20 × absoluteError / tolerance)` points, so a deviation reduces the grade even inside the tolerance. Missing, invalid and physically impossible provider values earn 0; unusable reference values are excluded. Strings earn 100 for an exact match and otherwise 0. The overall grade is the mean of compared field scores rounded down. The initial pass line is 80/100, with at least five scored probes. Historical binary-tolerance grades remain labeled as previous grading; they are not rewritten.

The first failed audit produces warning 1, the second consecutive failed audit warning 2, and the third failed audit calls the existing per-listing `slashEndpoint` followed by `pauseEndpoint`. A passing audit resets the consecutive-warning sequence. Inconclusive audits neither increase nor reset it. Other listings owned by the wallet are unaffected.

## Evidence and storage

The auditor's durable JSON store records the reference name and URL, request coordinates/horizon, provider values, reference values, tolerances, field results, ignored extra-field names, warning level, paid probe transactions and onchain slash/pause transactions. The smart contract remains responsible for stake, slash and listing status; weather evidence stays offchain for this hackathon.

The provider dashboard shows the latest state per listing and an expandable evidence table. It distinguishes passed, warning, inconclusive and slashed states and links to MET Norway and Stellar transactions.

## Demo fixtures

`pnpm demo:weather` starts four manually-listable fixtures:

- port 4003: an exact normalized MET Norway response;
- port 4004: small deviations inside the published tolerances;
- port 4005: material fabricated deviations that fail;
- port 4006: an exact response plus unverified extra fields.

The fixtures remain unlisted until a user registers them from `/list`. Paid forecast calls keep the existing x402 path and public capability discovery remains free.

## Operational requirements

MET Norway calls identify TrustBazaar with a User-Agent, truncate coordinates to four decimals, cache according to response expiry headers and attribute the source under CC BY 4.0. The README documents that reference availability varies by region/horizon, MET Norway has no SLA, evidence is stored by the auditor rather than onchain, and extra fields are unverified.

## Payment routing and visibility

Shared weather demo hosts resolve `x-tb-listing-id` against the registry and validate the endpoint, active status, exit deadline and stake before requesting payment. They charge the registered price and pay the registered owner. No caller-provided payout wallet is trusted. A single matching active listing can be selected without an ID; ambiguous requests fail before payment. Unregistered fixtures retain the configured demo payout identities. No registry ABI change is needed.

The dashboard reads incoming and outgoing USDC events for the connected wallet, supporting three/four-topic events and map amounts. It continues RPC pagination over empty scan pages and follows only new ledgers after the initial read. It checks each transaction envelope for a direct SAC transfer, excluding classic wallet funding and nested registry movements. Legacy transfers to fixture wallets appear in buyer history under their actual recipient and never become earnings of a different owner. Direct token payments cannot prove the HTTP request outcome or distinguish several services sharing the same owner wallet.
