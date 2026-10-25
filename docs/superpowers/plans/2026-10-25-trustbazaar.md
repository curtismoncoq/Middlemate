# TrustBazaar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Stellar-testnet marketplace for pay-per-request LLM endpoints where providers stake in a Soroban registry, an auditor probes them over x402, and a cheater is slashed and delisted on camera.

**Architecture:** pnpm TypeScript monorepo plus one Soroban Rust crate. Buyers pay providers directly over x402 (facilitator settles USDC). Every app reads/writes the registry only through `packages/registry-client`, which has on-chain and off-chain implementations behind `REGISTRY_MODE`. Auditor is a paying x402 client that scores providers against reference models and calls `slash` + `pause_listing`.

**Tech Stack:** Rust / soroban-sdk 28.0.0 / OpenZeppelin Stellar Contracts 0.8.0; stellar-cli 28.1.0; Node 25, TypeScript, pnpm, vitest; Express + `@x402/express` `@x402/stellar` `@x402/fetch` `@x402/core` 2.28.0; `@stellar/stellar-sdk`; Ollama; MiniMax API; Next.js + `@creit.tech/stellar-wallets-kit` 2.7.1.

**Spec:** `docs/superpowers/specs/2026-10-25-trustbazaar-design.md`

## Global Constraints

- Deadline 12:00 2026-10-26. Hours 0–3 end with an x402 go/no-go; must-haves (Tasks 1–6) before any web work.
- Testnet only. Network id `stellar:testnet`. USDC SAC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`, 7 decimals.
- Facilitator default `https://channels.openzeppelin.com/x402/testnet`; overridable by `FACILITATOR_URL`.
- Pin soroban-sdk `=28.0.0` and OZ crates `=0.8.0` (`stellar-access`, `stellar-contract-utils`, `stellar-macros`).
- Listings: Provider A claims MiniMax → MiniMax API; Provider B claims `llama3.2:3b` → Ollama `llama3.2:3b`; CheapMax claims MiniMax → Ollama `qwen2.5:0.5b`. Prices A $0.02, B $0.004, CheapMax $0.012.
- Stake default 10 USDC per provider (`STAKE_USDC`); `slash` takes full stake to treasury.
- Agent wallet funded with exactly 0.50 USDC; budget cap 0.50 USDC enforced in agent code.
- All secrets in gitignored `.env`; `.env.example` committed with every key name.
- Provider endpoints are OpenAI-compatible: `POST /<slug>/v1/chat/completions`, body `{messages, temperature?}`, response `{choices:[{message:{content}}], model}`.
- Seed providers are ours; README must carry every honesty item in spec §8.
- If no facilitator settles a real payment by hour 3: `PAYMENTS_MODE=simulated` path (Task 2) and README states it (user decision).

## Review Focus

1. Honest Provider A returns an error/timeout or a noisy MiniMax answer on one probe → must not be slashed; errors are retried once and excluded from the score, and a verdict needs ≥5 scored probes. (Test in Task 6.)
2. Auditor runs again after CheapMax is already slashed/paused → no second `slash` call, no crash; inactive listings are skipped. (Tests in Tasks 3 and 6.)
3. Agent finds no active listing for the model, or the next request would exceed the remaining budget → prints a clear message, makes no payment, exits 0. (Test in Task 7.)
4. Buyer takes longer than the auth-entry expiry in Freighter, or the facilitator rejects settlement → Try-it shows the error and the message can be resent; no answer is shown without a settled payment. (Test in Task 9.)
5. Registry RPC fails or returns zero listings → catalog shows an empty/error state instead of crashing. (Test in Task 8.)

---

### Task 1: Workspace, keys and funding

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example`, `scripts/setup-keys.sh`, `scripts/check-env.ts`, `packages/config/src/index.ts`, `packages/config/package.json`

**Interfaces:**
- Produces: `loadConfig(): Config` from `@tb/config` with fields `network:'stellar:testnet'`, `rpcUrl`, `horizonUrl`, `facilitatorUrl`, `usdcContract`, `registryMode:'onchain'|'offchain'`, `paymentsMode:'real'|'simulated'`, `registryContractId?`, `keys: Record<'admin'|'auditor'|'treasury'|'providerA'|'providerB'|'cheapmax'|'agent', {public:string; secret:string}>`, `minimaxApiKey`, `minimaxModel`, `ollamaUrl`, `stakeUsdc:number`, ports `providersPort=4001`, `auditorPort=4002`, `webPort=3000`.

- [ ] **Step 1:** Write `scripts/setup-keys.sh`: for each role run `stellar keys generate tb-<role> --network testnet --fund` (idempotent: skip if exists), then write `TB_<ROLE>_PUBLIC`/`TB_<ROLE>_SECRET` lines to `.env` and add a USDC trustline for every role except admin (via `stellar tx new change-trust` or a small stellar-sdk script).
- [ ] **Step 2:** Run it. Expected: 7 funded accounts, `.env` populated.
- [ ] **Step 3:** Ask the user to send USDC from their wallet: 10 to each provider, 1 to auditor, 0.50 to agent. Print the addresses.
- [ ] **Step 4:** Write `scripts/check-env.ts` printing XLM + USDC balance per role and pinging `ollama` (`GET /api/tags` lists `llama3.2:3b`, `qwen2.5:0.5b`, `nomic-embed-text`) and MiniMax (one 5-token completion). Run: `pnpm tsx scripts/check-env.ts`. Expected: all balances > 0 where funded, all three models present, MiniMax returns text; record the working MiniMax model id in `.env` as `MINIMAX_MODEL`.
- [ ] **Step 5:** Commit (`chore: workspace, config and testnet key setup`).

### Task 2: x402 paid request end to end (GO/NO-GO, hour 3)

**Files:**
- Create: `apps/providers/src/paywall.ts`, `apps/providers/src/server.ts`, `apps/providers/package.json`, `packages/x402-client/src/index.ts`, `packages/x402-client/package.json`, `scripts/pay-once.ts`

**Interfaces:**
- Consumes: `loadConfig()`.
- Produces:
  - `paywall(route: string, priceUsd: string, payTo: string): RequestHandler` in `apps/providers/src/paywall.ts` — real `@x402/express` middleware when `paymentsMode==='real'`; in `simulated` mode requires header `X-Simulated-Payment: <payer>` and sets `res.locals.payment={payer, txHash:'simulated'}`.
  - `createPayingFetch(secret: string): (url, init) => Promise<Response & {payment?: {txHash:string; amount:string}}>` in `@tb/x402-client` — wraps `@x402/fetch` with `createEd25519Signer(secret,'stellar:testnet')` + `ExactStellarScheme`; reads the settlement tx hash from the `X-PAYMENT-RESPONSE` header. Simulated mode adds the header instead.

- [ ] **Step 1:** Implement a temporary echo route `POST /echo` behind `paywall('/echo','$0.001', providerA.public)`.
- [ ] **Step 2:** Write `scripts/pay-once.ts` that calls `/echo` with the agent key via `createPayingFetch` and prints status, body and tx hash.
- [ ] **Step 3:** Run with OZ facilitator. Expected: HTTP 200, tx hash visible on stellar.expert testnet, agent USDC −0.001. If 401/unsupported → try without/with API key from `channels.openzeppelin.com/gen`.
- [ ] **Step 4 (only if Step 3 fails):** Clone `stellar/x402-stellar` `examples/facilitator` into `vendor/facilitator`, run on `:4010`, set `FACILITATOR_URL=http://localhost:4010`, rerun Step 3.
- [ ] **Step 5 (only if Step 4 fails by hour 3):** Set `PAYMENTS_MODE=simulated`, rerun; expected 200 with `txHash:'simulated'`. Tell the user.
- [ ] **Step 6:** Commit (`feat: x402 paywall and paying client`).

### Task 3: Registry contract

**Files:**
- Create: `contracts/registry/Cargo.toml`, `contracts/registry/src/lib.rs`, `contracts/registry/src/test.rs`, `Cargo.toml` (workspace)

**Interfaces:**
- Produces (contract `Registry`):
  - `__constructor(admin: Address, auditor: Address, token: Address, treasury: Address)` — sets OZ admin, grants role `"auditor"` to `auditor`.
  - `register(provider: Address, name: String, endpoint: String, claimed_model: String, price: i128)` — `provider.require_auth()`; error `AlreadyRegistered=1`.
  - `stake(provider: Address, amount: i128)` — `amount>0` else `NonPositiveAmount=3`; SAC `transfer(provider → contract)`; adds to stake; error `NotRegistered=2`.
  - `slash(caller: Address, provider: Address) -> i128` — `#[only_role(caller,"auditor")]`; transfers full stake to treasury, sets stake 0, returns amount; if stake already 0 returns 0 without transfer.
  - `pause_listing(caller: Address, provider: Address)` — auditor only; `active=false`.
  - `is_active(provider: Address) -> bool` — registered && active && stake>0.
  - `get(provider: Address) -> Option<Listing>`; `list() -> Vec<Listing>`.
  - `#[contracttype] struct Listing { provider: Address, name: String, endpoint: String, claimed_model: String, price: i128, stake: i128, active: bool }`.
  - Events: `("slashed", provider) → amount`, `("paused", provider)`.
  - Contract-wide OZ `Pausable` (admin-gated) blocks `register`/`stake` when paused.

- [ ] **Step 1: Write failing tests** in `test.rs` using `env.register_stellar_asset_contract_v2` and `mock_all_auths`:
  - `register_then_stake_is_active`: stake 10_0000000 → `is_active == true`, contract token balance 10_0000000.
  - `register_twice_fails`: `try_register` → `Err(AlreadyRegistered)`.
  - `stake_zero_fails`: `Err(NonPositiveAmount)`.
  - `slash_moves_full_stake_to_treasury`: returns 10_0000000, treasury balance 10_0000000, listing stake 0, `is_active == false`.
  - `slash_twice_returns_zero`: second call returns 0, treasury unchanged.
  - `non_auditor_cannot_slash`: caller = random address → error (panic/Err).
  - `pause_listing_hides_but_list_keeps`: `is_active false`, `list().len()==1`, `active==false`.
  - `list_returns_all_in_register_order`.
- [ ] **Step 2:** `cargo test -p registry` → FAIL (not implemented).
- [ ] **Step 3:** Implement per Interfaces; storage: persistent `Listing` per provider, instance `Vec<Address>` of providers.
- [ ] **Step 4:** `cargo test -p registry` → all PASS; `stellar contract build` → `target/wasm32v1-none/release/registry.wasm`.
- [ ] **Step 5:** Commit (`feat(contract): registry with stake, slash, pause`).

### Task 4: Deploy + registry client (on-chain and off-chain)

**Files:**
- Create: `scripts/deploy-registry.sh`, `packages/registry-client/src/{index,types,onchain,offchain}.ts`, `packages/registry-client/test/offchain.test.ts`, `data/registry.offchain.json` (gitignored), `scripts/seed-listings.ts`

**Interfaces:**
- Consumes: `loadConfig()`, contract from Task 3.
- Produces (`@tb/registry-client`):
  - `type Listing = { provider: string; name: string; endpoint: string; claimedModel: string; priceAtomic: bigint; stakeAtomic: bigint; active: boolean }`
  - `type TxResult = { hash: string }`
  - `interface RegistryClient { list(): Promise<Listing[]>; get(p: string): Promise<Listing|null>; isActive(p: string): Promise<boolean>; register(secret: string, l: Omit<Listing,'provider'|'stakeAtomic'|'active'>): Promise<TxResult>; stake(secret: string, amountAtomic: bigint): Promise<TxResult>; slash(auditorSecret: string, p: string): Promise<TxResult & {amountAtomic: bigint}>; pauseListing(auditorSecret: string, p: string): Promise<TxResult> }`
  - `createRegistryClient(cfg = loadConfig()): RegistryClient` — chooses by `registryMode`.
  - Browser helpers for the web app: `buildRegisterTx(publicKey, l)` and `buildStakeTx(publicKey, amount): Promise<string /*XDR*/>` and `submitSignedTx(xdr): Promise<TxResult>`.
  - Off-chain impl mirrors contract semantics exactly (same error names as thrown `Error` messages: `AlreadyRegistered`, `NotRegistered`, `NonPositiveAmount`), hashes `offchain-<n>`.

- [ ] **Step 1:** Write `offchain.test.ts` with the same eight behaviours as Task 3's tests against the off-chain impl (temp JSON file).
- [ ] **Step 2:** `pnpm vitest run packages/registry-client` → FAIL.
- [ ] **Step 3:** Implement offchain → PASS. Implement onchain with `@stellar/stellar-sdk` `contract.Client` / `rpc.Server` (simulate, sign with secret, send, poll).
- [ ] **Step 4:** `deploy-registry.sh`: build, deploy with constructor args (admin, auditor, USDC SAC, treasury), write `REGISTRY_CONTRACT_ID` to `.env`.
- [ ] **Step 5:** `seed-listings.ts`: register + stake `STAKE_USDC` for A, B, CheapMax (endpoints `http://localhost:4001/<slug>/v1/chat/completions`, slugs `minimax-a`, `llama-b`, `cheapmax`). Run in both modes. Expected: `list()` shows 3 active listings, each stake 10 USDC; on-chain tx hashes visible on stellar.expert.
- [ ] **Step 6:** Commit (`feat: registry client, deploy and seed`).

### Task 5: Providers serve real models

**Files:**
- Create: `apps/providers/src/backends.ts`, `apps/providers/src/providers.ts`, `apps/providers/test/providers.test.ts`
- Modify: `apps/providers/src/server.ts` (remove `/echo`, mount providers)

**Interfaces:**
- Consumes: `paywall()`, `loadConfig()`.
- Produces:
  - `type Backend = (messages: ChatMessage[], opts:{temperature?:number}) => Promise<string>`
  - `minimaxBackend(apiKey, model): Backend`, `ollamaBackend(url, model): Backend`
  - `PROVIDERS: {slug:'minimax-a'|'llama-b'|'cheapmax'; name:string; claimedModel:string; priceUsd:string; payToRole:'providerA'|'providerB'|'cheapmax'; backend: Backend}[]`
  - Response `model` field always echoes the **claimed** model (the cheater lies here too).

- [ ] **Step 1:** Write test with injected fake backends: `POST /cheapmax/v1/chat/completions` (simulated payment header) returns `model` = MiniMax claimed id and content from the qwen backend; missing payment → 402.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement → PASS.
- [ ] **Step 4:** Manual: start server, `pay-once.ts` against each slug with a real prompt. Expected: three answers, three tx hashes.
- [ ] **Step 5:** Commit (`feat(providers): MiniMax, llama and cheater endpoints`).

### Task 6: Auditor (catch + slash from CLI) — must-have complete

**Files:**
- Create: `apps/auditor/src/{probes,scoring,references,runner,server}.ts`, `apps/auditor/test/scoring.test.ts`, `apps/auditor/test/runner.test.ts`, `data/audits.json` (gitignored)

**Interfaces:**
- Consumes: `createRegistryClient`, `createPayingFetch(auditor secret)`, backends from Task 5 (as references), Ollama embeddings `POST /api/embeddings` model `nomic-embed-text`.
- Produces:
  - `type Probe = {id:string; kind:'checkable'; prompt:string; check:(answer:string)=>boolean} | {id:string; kind:'fingerprint'; prompt:string}`
  - `pickProbes(n: number, seed?: number): Probe[]` — pool ≥12 checkable + ≥8 fingerprint, returns mixed set, n default 6.
  - `cosine(a:number[], b:number[]): number`
  - `closestReference(answerEmb:number[], refs:Record<string,number[]>): {model:string; similarity:number; margins:Record<string,number>}`
  - `computeVerdict(claimedModel:string, results: ProbeResult[]): {score:number /*0-100*/; matchedModel:string; confidence:number; scored:number; pass:boolean}` — `pass = scored>=5 && score>=TRUST_THRESHOLD` (default 60); `scored<5` → `pass=true` with `inconclusive` note (never slash on too little data).
  - `type AuditRecord = {id; at:string; provider; name; claimedModel; verdict; probes: ProbeResult[]; slashTx?:string; pauseTx?:string}`
  - `runAudit(provider?: string): Promise<AuditRecord[]>` — skips inactive listings; on `!pass`: `slash` then `pauseListing`, records tx hashes.
  - HTTP on `auditorPort`: `POST /audit/run` (body `{provider?}`) → records; `GET /audits` → all records newest first; timer every `AUDIT_INTERVAL_MS` (default 120000, `0` disables).

- [ ] **Step 1: Write failing scoring tests:**
  - `cosine([1,0],[1,0])===1`, `cosine([1,0],[0,1])===0`.
  - `closestReference` picks the reference with highest similarity.
  - `computeVerdict('MiniMax', six results all matching qwen + 4 checkables failed)` → `pass false`, `matchedModel 'qwen2.5:0.5b'`, `score < 60`.
  - `computeVerdict('MiniMax', six results matching MiniMax, 1 checkable failed)` → `pass true`, `score >= 60`.
  - Review Focus 1: results with 2 `error` entries + 4 good → `scored 4`, `pass true` (inconclusive), no slash.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `probes`, `scoring` → PASS.
- [ ] **Step 4: Runner tests** with fake registry + fake fetch: cheater fails → `slash` and `pauseListing` each called once; Review Focus 2: second `runAudit()` after pause → no `slash` call (listing skipped). Provider error → retried once, then recorded as `error`.
- [ ] **Step 5:** Implement `references` (cache reference answers + embeddings per probe per round), `runner`, `server` → PASS.
- [ ] **Step 6: Calibration (real models):** run `POST /audit/run` 3 times against all three providers. Expected every run: A and B `pass`, CheapMax `fail` with `matchedModel qwen2.5:0.5b`. Tune probe pool/weights/threshold until true; record final threshold in `.env.example`. Then reseed and run once more on-chain: CheapMax slash tx visible, treasury +10 USDC, `is_active false`.
- [ ] **Step 7:** Commit (`feat(auditor): probes, scoring, slash and delist`). **Tell the user the must-have is done.**

### Task 7: Agent

**Files:**
- Create: `apps/agent/src/{budget,choose,main}.ts`, `apps/agent/test/agent.test.ts`, `apps/agent/article.txt`

**Interfaces:**
- Consumes: `createRegistryClient`, `createPayingFetch(agent secret)`.
- Produces:
  - `class BudgetGuard { constructor(capAtomic: bigint); remaining(): bigint; canSpend(a: bigint): boolean; record(a: bigint): void }` — `record` throws `BudgetExceededError` if over cap.
  - `chooseListing(listings: Listing[], model: string, exclude: Set<string>): Listing|null` — active, `claimedModel===model`, not excluded, cheapest.
  - CLI: `pnpm agent --model <claimed> --task summarize --article apps/agent/article.txt [--repeat N] [--try-overspend]` — logs each step in demo-readable lines (`[agent] budget $0.50`, `picked CheapMax $0.012`, `paid tx …`, `answer: …`, `CheapMax delisted → rerouting to Provider A`, `REJECTED: payment $X exceeds remaining budget $Y`).
  - Before every payment re-checks `isActive(provider)`; if false, excludes and re-chooses.

- [ ] **Step 1: Failing tests:** `chooseListing` picks CheapMax ($0.012) over A ($0.02) for MiniMax; with CheapMax excluded picks A; Review Focus 3: none active → `null` and CLI exits 0 with `no active provider for <model>`; `BudgetGuard(5000000n)` `canSpend(5000001n) === false`; overspend path makes no fetch call.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement → PASS.
- [ ] **Step 4:** Manual: run agent → picks CheapMax, pays, prints summary; run auditor; run agent again → reroutes to A; `--try-overspend` → `REJECTED`.
- [ ] **Step 5:** Commit (`feat(agent): budgeted shopping agent with rerouting`).

### Task 8: Web catalog (cards) + audit log

**Files:**
- Create: `apps/web` (Next.js app router), `apps/web/app/page.tsx`, `apps/web/app/audits/page.tsx`, `apps/web/app/api/listings/route.ts`, `apps/web/app/api/audits/route.ts`, `apps/web/components/{ListingCard,Nav}.tsx`, `apps/web/test/ListingCard.test.tsx`

**Interfaces:**
- Consumes: `createRegistryClient` (server side only), auditor `GET /audits`, `POST /audit/run`.
- Produces: `GET /api/listings` → `{listings: (Listing & {lastAudit?: AuditRecord})[]}` (bigints as strings); `POST /api/audit/run` proxy; `<ListingCard listing lastAudit />` states: active (green, stake badge "🔒 Staked 10 USDC", trust score, "audited Xm ago", Try it) and slashed (red, "SLASHED · DELISTED", "Actually matched: <model> (<confidence>%)", stake "10 → 0 USDC", slash tx link to `https://stellar.expert/explorer/testnet/tx/<hash>`). Slashed cards stay visible 20 s after the slash, then hide from catalog (still in audit log). Catalog polls every 3 s. Nav: Catalog · List an endpoint · Audit log · Connect wallet. "Run audit now" button on catalog.

- [ ] **Step 1: Failing tests:** card renders active state with price `$0.012 / request`; slashed state shows `SLASHED` and matched model and tx link; Review Focus 5: catalog with `/api/listings` error renders "Registry unavailable — retrying", with `[]` renders "No listings yet".
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement → PASS.
- [ ] **Step 4:** Manual: `pnpm dev`, run audit from button, watch CheapMax card flip red then disappear without reload.
- [ ] **Step 5:** Commit (`feat(web): card catalog and audit log`).

### Task 9: Web wallet connect + Try it (human x402 payments)

**Files:**
- Create: `apps/web/lib/wallet.ts`, `apps/web/lib/x402-browser.ts`, `apps/web/components/{ConnectWallet,TryItPanel}.tsx`, `apps/web/test/TryItPanel.test.tsx`

**Interfaces:**
- Produces:
  - `connect(): Promise<{address:string}>`, `signAuthEntry(xdr:string): Promise<string>`, `signTransaction(xdr:string): Promise<string>` via Stellar Wallets Kit (Freighter module, testnet).
  - `createBrowserPayingFetch(address, signAuthEntry)` — `@x402/fetch` + `ExactStellarScheme` with a SEP-43-style signer; reference ElliotFriend `stellar-browser-wallet-example`.
  - `<TryItPanel listing />` — chat; each send = one paid request; shows answer + tx link; on failure shows error text and keeps the draft for resend.

- [ ] **Step 1: Failing test** (mock paying fetch): success shows answer and tx link; Review Focus 4: rejected/expired payment shows `Payment failed: <reason>`, no answer bubble, draft preserved.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement → PASS.
- [ ] **Step 4:** Manual with Freighter on testnet: connect, send a message to Provider B, approve; expected answer + real tx hash, USDC −0.004.
- [ ] **Step 5:** Commit (`feat(web): wallet connect and pay-per-message Try it`).

### Task 10: Web "List your endpoint"

**Files:**
- Create: `apps/web/app/list/page.tsx`, `apps/web/components/ListForm.tsx`, `apps/web/app/api/tx/route.ts`

**Interfaces:**
- Consumes: `buildRegisterTx`, `buildStakeTx`, `submitSignedTx`, `signTransaction`.
- Produces: form (name, endpoint URL, claimed model, price USD, stake USDC default 10) → two Freighter signatures (register, stake) → redirect to catalog with the new card. Validation: price > 0, stake ≥ 1, endpoint is http(s) URL.

- [ ] **Step 1:** Implement; manual test registers a 4th listing from Freighter (endpoint can reuse `llama-b`). Expected: card appears with stake badge, two tx links.
- [ ] **Step 2:** Commit (`feat(web): provider listing and staking form`).

### Task 11 (stretch, ≤2h, only after Tasks 1–9 pass): On-chain spending cap

**Files:**
- Create: `scripts/create-smart-account.ts`, `vendor/facilitator` patch notes in `docs/smart-account.md`
- Modify: `packages/x402-client/src/index.ts` (signer for `C...` payer), `apps/agent/src/main.ts` (`--smart-account`)

- [ ] **Step 1:** Run patched self-hosted facilitator (x402 PR #3399 applied, `maxTransactionFeeStroops=2000000`).
- [ ] **Step 2:** `create-smart-account.ts` via `smart-account-kit` with ed25519 signer (verifier `CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4`) and spending-limit policy `CABXBYJNZ7IUW4G3D6BND5YCAQF3ASSDMDAOKQ63UYFSO7WUU2TIP5G` (limit 0.50 USDC); fund with 0.50 USDC.
- [ ] **Step 3:** Agent pays from it; `--try-overspend` without the code guard → expected on-chain rejection.
- [ ] **Step 4:** If any step blocks past the 2h box: revert to plain wallet, note in README. Commit either way.

### Task 12: README, demo runbook, submission

**Files:**
- Create: `README.md`, `docs/demo-runbook.md`, `scripts/demo-reset.sh`

- [ ] **Step 1:** `demo-reset.sh`: redeploy registry, reseed 3 listings, refund agent to 0.50 USDC, clear `data/audits.json`. Run twice; expected identical clean state.
- [ ] **Step 2:** `demo-runbook.md`: exact terminal/browser layout and command per video beat (spec §3).
- [ ] **Step 3:** README: problem, how it works (diagram), run instructions from a clean clone, contract id + example tx links, every honesty item from spec §8 (state payments real vs simulated, cap on-chain vs off-chain as shipped), sponsor tooling per layer, future (plain-API category with schema checks).
- [ ] **Step 4:** Commit (`docs: README and demo runbook`). Remaining time: deck + video (humans).
