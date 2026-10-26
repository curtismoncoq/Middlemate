# Middlemate — Design

Date: 2026-10-25 · Event: HackMeridian 2026 (Lisbon), Genesis path, sub-tracks Stellar Composed (+ Stellar Unlocked)
Deadline: **12:00 Monday 2026-10-26, no late submissions.** Team: 2 devs, no Rust/Soroban experience; Claude writes most code, including all Rust.

## 1. Intent

Paid AI endpoints are appearing, and x402 lets anyone sell them with no accounts or API keys. Buyers — increasingly autonomous agents — can't tell whether a provider serves what it advertises (e.g. advertises a big model, serves a tiny one, pockets the difference). Catalogs list services; nobody verifies them.

Middlemate is a **marketplace** for pay-per-request LLM endpoints on Stellar where **providers stake to list, an auditor secretly probes them, and liars are slashed on-chain and delisted**. The marketplace is the product; the auditor is why buyers trust it.

Closing line for the pitch: *"Agents can pay for compute, and compute has to prove it's honest."*

### What judges see
Judging is async: **demo video, pitch deck, GitHub repo, README** (README "does most of the work"). Finalists pitch live 2026-10-28. Weights: Track Alignment 20%, User Value & Problem 20%, Technical Execution 15%, Innovation 15%, Hackathon Progress 10%, Market & Ecosystem Potential 10%, Product Design & UX 10%. Success = one reliable, visible catch on camera plus a credible, honest README.

## 2. Goals, non-goals, anti-goals

**Must have (on camera):** catalog with ≥1 honest listing and the cheater; x402 paid requests on testnet; an audit that fails the cheater; a real Soroban `slash`; the listing turning red and disappearing; the agent rerouting to an honest provider.

**Should have:** human "Try it" chat paying per message via Freighter; "List your endpoint" form with stake from the browser; agent overspend rejection (see §6 for how it's enforced).

**Stretch (time-boxed ~2h, after must-haves):** agent pays from an OpenZeppelin smart account with an on-chain spending-limit policy via a self-hosted, patched facilitator.

**Later / README-only:** second category of plain (non-LLM) APIs verified against a declared response schema.

**Non-goals:** governance, token economics, real reputation system, confidential balances, mainnet, passkey onboarding flow on camera.

**Anti-goals (failure even if it "works"):** a demo that depends on a live flaky step we can't retry; overclaiming in the README (audit certainty, smart-account cap if not actually on-chain); the marketplace reading as a backdrop to an auditor tool.

## 3. Demo video (~2.5 min)

1. Problem (20s): "Agents buy compute blind."
2. A provider lists and stakes (30s); the card appears in the catalog.
3. A human tries a listing (25s): pays per message, testnet tx link shown.
4. Agent shops (25s): task "Summarize this article", $0.50 budget; picks the cheapest listing claiming MiniMax (the cheater), pays, gets an answer.
5. The catch (30s): "Run audit now" → probes → cheater's score drops → `slash` tx on-chain → card turns red ("Actually matched: qwen2.5:0.5b"), then delisted → agent's next request goes to an honest provider.
6. Overspend blocked (15s).
7. Closing line.

The agent's account is **set up and funded before recording**; no setup on camera. If time is short, step 2 may be done by script (the provider form is the first UI to downgrade).

## 4. Listings (all ours, stated as such in README)

| Listing | Claims | Actually serves | Price (my call) |
|---|---|---|---|
| Provider A | MiniMax (model id per MiniMax API) | MiniMax API (user's paid key) | ~$0.02 / req |
| Provider B | `llama3.2:3b` | Ollama `llama3.2:3b` | ~$0.004 / req |
| CheapMax (cheater) | MiniMax | Ollama `qwen2.5:0.5b` | ~$0.012 / req (cheapest MiniMax) |

Prices are tuned so the agent's "cheapest MiniMax" rule picks CheapMax first and the $0.50 budget covers the demo. Ollama runs locally on Apple Silicon.

## 5. Architecture

Buyers pay providers **directly** over x402 (my call): Middlemate is catalog + on-chain registry + auditor, not a payment middleman. "Routing" = the agent checks `is_active` and moves to the next listing.

```
web (Next.js) ──reads──▶ registry module ──▶ Soroban registry (testnet)  [or off-chain JSON fallback]
   │ Try it (Freighter via Wallets Kit, x402)                ▲ slash/pause (auditor role)
   ▼                                                         │
providers (Express, x402 paywall) ◀──x402 probes── auditor ──┘
   ▲                                   │ references: MiniMax API, Ollama llama3.2:3b, qwen2.5:0.5b
   └──────x402──────── agent (Node, $0.50 budget)
x402 settlement: OpenZeppelin facilitator (testnet) — USDC, fees sponsored
```

### Repo layout (pnpm workspace, TypeScript + one Rust crate)
- `contracts/registry` — Soroban contract.
- `packages/registry-client` — the single module everyone uses to read/write the registry; two implementations (on-chain, off-chain JSON) behind an env switch (`REGISTRY_MODE=onchain|offchain`). Built from day one.
- `apps/providers` — one Express server exposing the three paywalled endpoints.
- `apps/auditor` — probe runner + scorer; timer + HTTP trigger for "Run audit now"; writes an audit log the web app reads.
- `apps/agent` — Node script for the agent task.
- `apps/web` — Next.js marketplace.

## 6. Components

### 6.1 Registry contract (Soroban)
- Versions: OpenZeppelin Stellar Contracts **0.8.0** (`stellar-access`, `stellar-contract-utils`, `stellar-macros`), **soroban-sdk 28.0.0** (pinned to match OZ), stellar-cli 28.1.0.
- Functions: `register(provider, endpoint_url, claimed_model, price)` · `stake(provider, amount)` (SAC USDC `transfer` from provider into the contract, provider `require_auth`) · `slash(caller, provider, amount)` and `pause_listing(caller, provider)` gated by `#[only_role(caller, "auditor")]` · `is_active(provider)` · `list()` / `get(provider)`.
- Per-listing `active` flag for delisting (OZ Pausable is contract-wide; used only as an emergency stop for the whole registry).
- Slashed funds go to a treasury address set at construction (my call; could be the buyer pool later).
- Stake asset: testnet USDC SAC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`. User already holds testnet USDC.
- Rust unit tests for register/stake/slash/pause/auth failures.
- **Fallback:** if the contract isn't working by ~hour 12, set `REGISTRY_MODE=offchain`. x402 payments stay on-chain regardless.

### 6.2 Payments (x402)
- Packages: `@x402/express`, `@x402/stellar`, `@x402/fetch`, `@x402/core` (2.28.0). Scheme `exact`, network `stellar:testnet`, price in USDC.
- Payer signs a Soroban auth entry for a USDC transfer; facilitator submits and sponsors fees.
- Facilitator: OpenZeppelin testnet `https://channels.openzeppelin.com/x402/testnet` (API-key requirement unclear — verify in hour 0).
- Browser signing: Stellar Wallets Kit (`@creit.tech/stellar-wallets-kit` 2.7.1), Freighter, `signAuthEntry`. Reference: `stellar/x402-stellar` `examples/simple-paywall` and ElliotFriend's `stellar-browser-wallet-example`.

### 6.3 Agent
- Node script; plain testnet `G...` wallet funded with exactly $0.50 USDC (the balance itself is the hard worst-case loss).
- Loop: fetch catalog → filter `is_active` and claimed model → pick cheapest → pay via x402 → print answer and tx → on delist, pick next.
- **Overspend rejection (default):** budget enforced in agent code, refusing payments beyond the cap. README states plainly this is off-chain.
- **Stretch:** OZ smart account (`stellar-accounts` 0.8.0, `smart-account-kit` 0.8.0) with spending-limit policy (deployed testnet policy `CABXBYJ…P5G`, ed25519 verifier `CAAVTMC…HKN4`), created with an ed25519 key (no passkey). Requires self-hosting `stellar/x402-stellar` `examples/facilitator` patched with x402 PR #3399 (policy-event validation, issue #3352) and a higher `maxTransactionFeeStroops` (~2,000,000; issue #3515). If it lands, the overspend rejection comes from the chain. Abandon after ~2h.

### 6.4 Auditor
- A paying customer: own x402 wallet, indistinguishable from normal traffic; also holds the auditor role key.
- **Checkable probes:** known-answer prompts easy for a large model, hard for 0.5B (short multi-step word problems, strict format instructions like "exactly 7 lowercase words", fact extraction from a paragraph). Scored right/wrong.
- **Fingerprint probes:** open-ended prompts sent to the provider and to all references (MiniMax API, Ollama `llama3.2:3b`, `qwen2.5:0.5b`); compare via embeddings from a local Ollama embedding model; a listing that claims model X but lands closest to a different reference loses points.
- Temperature 0 where supported. Probes randomized/paraphrased from a pool.
- Round of ~5–8 probes → trust score 0–100 → below threshold: `slash` + `pause_listing`, log "Actually matched: <model> (<confidence>)".
- Runs on a timer and via "Run audit now" (HTTP trigger) for the video. Audit log persisted (JSON) and shown in the web app.
- Exact probe pool, weights and threshold: builder tunes so honest providers pass reliably and the cheater fails reliably across repeated runs.

### 6.5 Web (Next.js)
- **Catalog: card grid** (chosen). Each card: name, claimed model, price/request, stake badge, trust score, last audit time, "Try it". Slashed state: red card, "SLASHED · DELISTED", "Actually matched: …", stake 100 → 0, link to slash tx; then removed from the active list.
- Nav: Catalog · List an endpoint · Audit log · Connect wallet.
- "Try it" chat: each message pays over x402 from Freighter, shows tx link.
- "List your endpoint": URL, claimed model, price, stake amount → register + stake signed in Freighter.
- Audit log page: probe results, scores, slash tx links.
- Live updates (polling is fine) so the card flips during the video without a reload.

## 7. Timeline (now → 12:00 Mon)

1. Hours 0–3: testnet wallets, USDC, facilitator test call, first paid x402 request end to end (Node client → Express paywall).
2. Hours 3–8: registry deployed; providers + auditor catch and slash the cheater from the CLI. **Must-have done early.**
3. Hours 8–14: web catalog, Try-it payments, provider form, agent script.
4. Hours 14–17: smart-account stretch (≤2h), polish.
5. Final 3–4h, protected: README, deck, video.

Split: dev 1 drives contracts/auditor/agent with Claude; dev 2 drives web app and deck.

## 8. README honesty (required)
- Audit is statistical: false positives and negatives are possible; MiniMax outputs vary.
- A smart cheater could detect probes or forward some to the real model; randomized/paraphrased probes reduce but don't remove this.
- Only models we can query as a reference can be verified.
- All seed providers are ours.
- Everything runs on testnet.
- Agent spending cap: state whether it is on-chain (smart account) or off-chain (agent code) — whichever shipped.
- Experimental dependencies (OZ Stellar contracts are labelled experimental).

## 9. Known risks
- Smart-account x402 payments blocked by upstream bugs (#3352, #3515) — mitigated by plain-wallet default.
- OZ facilitator API-key requirement unconfirmed; fallback: self-host the `x402-stellar` example facilitator.
- Wallets Kit v2 exact method names and Freighter `signAuthEntry` on testnet unverified — verify in hours 0–3 via the browser example.
- Version skew (soroban-sdk 28 vs 29; testnet redeploys) — pin versions, re-verify deployed addresses.
- MiniMax nondeterminism could make honest Provider A score poorly — the fingerprint is compared against a fresh reference call per probe, and checkable probes carry weight.

## 10. Decisions made by Claude (check these)
- **Runs locally only.** Everything runs on one Mac; judges get the video + README run instructions, no hosted deployment.
- **One shared Ollama instance** for providers and auditor references. Acceptable for the demo; README notes that in reality the reference is hosted independently of providers.
- **Keys:** Claude generates all testnet keys with `stellar keys generate` (deployer/admin, auditor, treasury, providers A/B/CheapMax, agent, human demo wallet = user's Freighter). Friendbot funds XLM; user sends USDC from their wallet. Keys live in a gitignored `.env`.
- **Stake and slash amounts:** stake is configurable, default **10 USDC per provider** (UI shows the real amount, not "100"); `slash` takes the **full stake** and sends it to the treasury.
- **MiniMax:** model id and rate limits are verified with the user's key in hours 0–3; fresh reference calls are cached per probe within an audit round to limit cost.
- **Audit log:** auditor exposes it over HTTP (`GET /audits`, `POST /audit/run`); the web app polls it.
- **Payment gate:** go/no-go at hour 3 on a real paid x402 request (see §11).

## 11. Payment-path fallback
OZ facilitator → (if blocked) self-hosted `x402-stellar` example facilitator → (if both fail by hour 3) simulate the payment step for the video and state it clearly in the README (user decision). Real x402 remains the target.

## 12. Left to the builder
Exact probe pool and scoring weights/threshold; storage layout of the contract; UI styling details; poll intervals; ports/env layout; whether provider endpoints are chat-completions-shaped (recommended: OpenAI-compatible `POST /v1/chat/completions` behind the paywall so any client works).
