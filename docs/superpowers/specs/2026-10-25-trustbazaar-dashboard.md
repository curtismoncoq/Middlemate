# TrustBazaar user dashboard

## Goal

Give a connected Stellar wallet one place to inspect its provider listings, registry stake, confirmed marketplace earnings, buyer spend, and auditor results. Provider controls must not imply authority the deployed contract does not grant.

## Data sources

- Listings, active state, and stake come from `@tb/registry-client`; in the current demo configuration this is the deployed Stellar Testnet registry.
- Earnings and buyer spend come from successful USDC SAC `transfer` contract events read from Stellar RPC. Events are filtered to transfers whose recipient is a registered provider address. The dashboard refreshes without writing activity to a local file.
- RPC retains recent events for about seven days. Charts and activity state that limit; complete historical analytics require an indexer or archival data source.
- Synthetic weather endpoint calls remain simulated and are not counted as USDC earnings or spend.
- Auditor summaries come from the auditor service.

## UI

- Provider section: earnings chart, total stake, paid transfer count, active listing count, per-listing stake and seven-day earnings, add-stake wallet flow, recent transfers, audit results.
- Buyer section: spend chart, total, call count, average transfer, recent transfers.
- Empty states explain the connected wallet has no matching registry listings or onchain transfers in the retained window.
- Provider shutdown means disabling the API at its host. The frozen registry permits only the auditor to pause listings; the dashboard must not simulate a provider-controlled chain pause.

## Safety and boundaries

- Keep registry ABI, `@tb/registry-client` signatures, audit verdicts, and LLM seed data unchanged.
- Only include confirmed successful USDC transfer events to registered provider accounts. Do not treat HTTP success, local logs, simulated x402 responses, or arbitrary USDC transfers as marketplace revenue.
- Keep new behavior server-side for RPC access; do not expose secrets or write chain activity to local persistence.
- Dashboard reads may fail if Stellar RPC is unavailable; surface a clear error and retry on the next refresh.
