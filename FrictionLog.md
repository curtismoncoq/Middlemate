# Middlemate — HackMeridian 2026 friction log

## What we built

Middlemate is a Stellar Testnet marketplace for pay-per-request AI and API endpoints. Providers stake USDC in a Soroban registry. Humans and agents buy requests over x402; an auditor buys hidden probes, compares model answers with references, and can slash and pause dishonest LLM listings. We also added weather APIs, with reference comparisons and human review rather than automatic slashing for forecast disagreement.

Based on the repo, build notes and available conversation context. **Durations were not logged: ranges below are inferred effort estimates, not measured time or confirmed recollections; do not total them.** Later dashboard/wallet work is identified separately.

## Stellar tools we used

| Tool | How we used it |
|---|---|
| Soroban / Rust `soroban-sdk` 28.0.0 | Registry contracts for listings, USDC stakes, auditor-only slashing, pausing and withdrawals; local contract tests. |
| OpenZeppelin Stellar Contracts 0.8.0 | Access Control for the auditor role and Pausable for enforcement. |
| JavaScript Stellar SDK 16.4.1 | Build, simulate, sign and submit registry transactions; encode/decode contract values; read payment events through Stellar RPC. |
| Stellar CLI 28 | Generate and fund Testnet identities, create USDC trustlines, build Wasm and deploy the registry through scripts. |
| USDC / Stellar Asset Contract | Direct buyer-to-provider payments, stake custody, refunds and transfers to the treasury when slashed. Circle's Testnet faucet supplied USDC separately from account funding. |
| x402 Stellar libraries 2.28.0 | Express paywall, paying fetch clients and fee-sponsored settlement through an in-process facilitator. |
| Freighter / Stellar Wallets Kit 2.7.1 | Browser authorization-entry signatures for x402, transaction signatures for staking/withdrawals, and later SEP-53 message signatures for wallet login. |
| Stellar RPC, Horizon and Stellar Expert | RPC contract access and payment history; Horizon account/balance checks; explorer links to verify payments and sanctions. |

**Raven / other Stellar MCP:** no use is confirmed by the available repo or conversation context. We cannot honestly credit one as a tool used in this build.

## Main friction

| What happened | Rough cost* | Workaround / outcome |
|---|---|---|
| The hosted OpenZeppelin x402 facilitator required an API key, adding a dependency before we could settle payments. | 30–60 min | Used `FACILITATOR_URL=local`: an in-process facilitator built from the official libraries, with our admin account sponsoring fees. Real Testnet settlement worked; simulated mode remains an explicit fallback. |
| Browser paid retries needed unexpected CORS handling: the x402 client sent `Access-Control-Expose-Headers` as a request header. A dedicated fix records this integration problem. | 20–45 min | Shared `buyerCors` middleware allows that header plus payment headers and exposes settlement headers on every paywalled server. |
| Onchain smart-account spending limits were blocked by upstream facilitator policy-event/fee issues recorded in our design notes. | Actual time unknown; planned timebox about 2 h | Shipped an ordinary wallet with an offchain $0.50 budget and request price caps; documented that a compromised agent could bypass its budget. |
| Testnet setup involved several independent steps: funded accounts, USDC trustlines, then separate USDC faucet funding for multiple roles. | 30–60 min | Added repeatable identity/trustline setup and `pnpm check-env`; documented the separate USDC funding step. |
| RPC history needed five-topic-pattern batching, multiple SAC transfer formats and pagination through empty pages. | 1–2 h, including later dashboard work | Added batching, decoding, cursor handling and caching. Retention still limits history; plain transfers cannot attribute earnings to individual endpoints sharing a wallet. |
| The available MetaMask Stellar adapter was PUBNET-only; reload also needed explicit address restoration. | 30–60 min, including later wallet work | Used Freighter only and silently restored its already authorized address. |
| Real x402 settlement takes about 10 seconds, making sequential payment/audit flows slow to iterate and demo. | About 10 s per payment, repeatedly; total untracked | Adjusted timeouts, ran audit rounds in the background and documented demo timings. Settlement latency remains visible. |

*Effort estimates, except where a latency or planned timebox is explicitly identified. Evidence: [README limits](README.md#honest-limits), [design notes](docs/superpowers/specs/2026-10-25-middlemate-design.md), [setup script](scripts/setup-keys.sh), [CORS middleware](apps/providers/src/cors.ts), [RPC reader](apps/web/lib/stellar-activity.ts), and [wallet wrapper](apps/web/lib/wallet.ts).

## What worked well

- We completed real Testnet x402 payments from both code and Freighter, plus onchain stake/slash flows, with explorer transaction links in the README.
- Soroban tests and OpenZeppelin access control let us verify custody and auditor permissions locally. We pinned SDK/OZ versions together and used `ListingPaused` to avoid OZ's existing `Paused` event name.
- A shared registry client and explicit simulated/offchain development modes made it easier to test application behavior without paying for every iteration.

## What would have made it easier

- One maintained, version-pinned example covering a Stellar x402 server, browser CORS, Freighter authorization, fee sponsorship and settlement errors end to end.
- A clearer facilitator setup guide explaining hosted credentials, local operation and smart-account compatibility, with known issues beside the examples.
- One Testnet onboarding checklist covering XLM funding, USDC trustlines and USDC faucet funding; a helper for funding multiple development roles would save repetition.
- RPC examples showing SAC transfer formats, filter limits, cursor behavior on empty pages and history retention; a wallet/network capability matrix would also help.

We can point to integration fixes and missing guidance we needed, but the retained notes do not justify claiming a particular documentation page was incorrect.
