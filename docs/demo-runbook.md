# Demo runbook (≈3 min video)

The story is that an honest provider and a cheater both list live, and the audit on entry passes the first one and slashes the second. Footage is recorded as separate clips (R1–R10), motion-design pieces (M1–M6) are made apart, and both are cut to a voiceover recorded separately.

## Before recording

1. `pnpm demo:weather` (the same as `pnpm dev`, plus four weather fixtures on :4003–4006). It starts the web app (:3000), providers (:4001), auditor (:4002) and live MET Norway-backed demos.
2. `pnpm demo:reset` in a second terminal. It warms every Ollama model (kept loaded 30 min, so nothing cold-starts on camera), unregisters legacy listings (stakes refunded), seeds Provider A, audits it once (about a minute), and resets the agent's $0.50 budget and the audit log. The catalog opens on one green, audited card. Listings made from `/list` (Honest Llama, weather listings) can only be withdrawn by their owner, so reset has the auditor pause them: they leave the catalog, their stake stays locked to the owner, who can withdraw it from Dashboard at any time. A paused listing can't be resumed; list it again instead.
3. If you record more than 30 min after the reset, warm Ollama again: `ollama run llama3.2:3b "hi"` and `ollama run qwen2.5:0.5b "hi"`.
4. Freighter on **Testnet** with two accounts, each holding USDC (stake plus a little for Try it):
   - **wallet 1 (honest)** lists `llama3.2:3b`;
   - **wallet 2 (cheater)** lists CheapClaude.
5. `pnpm check-env`: the agent and the auditor each hold USDC (one entry audit costs the auditor a few cents).
6. Capture setup: 1440p or higher, browser at 125% zoom with the bookmarks bar hidden, terminal font around 20 pt. Keep Freighter popups in frame; they show the payments are real. Screen Studio gives cursor zoom for free.

Allow about 10 s per paid request (settlement waits for a ledger) and 1–2 min per entry audit.

## Clips to record, in this order

The slash can't be undone without a reset, so record in this order.

| # | Clip | Steps | Raw length |
|---|------|-------|-----------|
| R1 | Catalog after reset | Provider A green and audited; slow scroll | 15 s |
| R2 | Honest listing (wallet 1) | `/list`, name `Honest Llama`, endpoint `http://localhost:4001/llama-b/v1/chat/completions` (the price, $0.004, is read from the endpoint and appears under it), model `llama3.2:3b` from the dropdown, stake 5. Approve the atomic register-and-stake transaction in Freighter. The card shows **Being audited** and the live feed, then **PASS** | 2–3 min |
| R3 | Human pays | Try it on Honest Llama, sign in Freighter, the answer comes back with **paid · tx**; click through to stellar.expert | 40 s |
| R4 | Cheater listing (switch Freighter to wallet 2) | `/list`, name `CheapClaude`, endpoint `http://localhost:4001/cheapmax/v1/chat/completions` (secretly qwen2.5:0.5b; its price, $0.012, is read from the endpoint), model `Claude Opus 5.5`, stake 5. Audit runs; the card turns red: **SLASHED · matched qwen2.5:0.5b** (red for 60 s) | 2–3 min |
| R5 | Slash proof | Click the slash tx link and show the registry contract on stellar.expert | 15 s |
| R6 | Agent terminal | `pnpm agent`: $0.50 budget, picks **Provider A** (the MiniMax listing), prints the tx. Then `pnpm agent --try-overspend`: **REJECTED: payment … exceeds remaining budget** | 40 s |
| R7 | Weather API | Follow the MET Norway verification walkthrough below; show an exact pass, a warning, and extras marked unverified | 1–2 min |
| R8 | Dashboard | `/dashboard`: earnings and spend | 10 s |
| R9 | B-roll: auditor logs | The `pnpm demo:weather` terminal streaming probe lines during R4 (`closest qwen2.5:0.5b (1.000)`). Record it at the same time as R4 | — |
| R10 | B-roll: code | `slash` with `#[only_role(caller, "auditor")]` in `contracts/registry/src/lib.rs`, and `computeVerdict` in `apps/auditor/src/scoring.ts` | 15 s |

## Motion design

Built in HyperFrames in `video/` (see `video/README.md`); `sh video/render.sh` renders every piece into `video/out/`.

- **M1 Hook:** an agent icon pays a "Claude Opus" label with the Claude logo, which peels off to reveal "0.5B model".
- **M2 How it works:** four animated steps:
  - **Stake** (Soroban registry)
  - **Pay per request** (x402 · USDC)
  - **Hidden audit** (the auditor buys probes like any customer)
  - **Slash** (stake to the treasury, listing delisted)
- **M3 Fingerprint:** the cheater's answers land as dots near qwen2.5:0.5b instead of Claude; the trust score counts down to 0.
- **M4 Stake counter:** 5.00 → 0.00 USDC with a red flash, synced to the card turning red.
- **M5 Callouts:** zoom and highlight on each tx hash, trust score and the REJECTED line.
- **M6 End card:** "Built on Stellar" (x402, Soroban, OpenZeppelin Stellar Contracts, USDC, Freighter), the repo URL and the team.

## Timeline

| Time | Beat | Footage | Voiceover |
|------|------|---------|-----------|
| 0:00–0:15 | Hook | M1 | "AI agents now pay for compute on their own. Nobody checks what they actually get." |
| 0:15–0:35 | Concept | M2 → R1 | "Middlemate: providers stake to list, everyone pays per request over x402, and an auditor checks them in secret." |
| 0:35–1:00 | Honest provider lists | R2 at 4–8×, M5 on the stake prompt | "To list, you stake. The moment you list, the auditor starts testing you with hidden probes, paid like any customer." |
| 1:00–1:20 | A human pays | R3, M5 on the tx | "Pay per message from your wallet. No account, no API key." |
| 1:20–1:55 | **The cheater** | R4 with a speed ramp (on-screen "≈90 s later"), R9 overlay, M3, M4, R5 | "This one claims Claude Opus at a bargain price. Its answers fingerprint as a 0.5B model. It's slashed and delisted on-chain." |
| 1:55–2:25 | The agent | R6, M5 on REJECTED | "Agents only buy from audited listings. The wallet holds $20, but the policy caps it at $0.50." |
| 2:25–2:40 | Beyond LLMs | R7, R8 | "The same trust layer works for any paid API, like this weather API." |
| 2:40–3:00 | Close | R10 flash → M6 | "Agents can pay for compute. Now the compute has to prove it's honest." |

## Retakes

- **R4 burns the cheater's stake.** It goes to the treasury, and every audit spends some of the auditor's USDC. To redo R4: run `pnpm demo:reset` (it pauses Honest Llama; withdraw its stake from Dashboard with wallet 1 if wallet 1 runs low), top up wallet 2 if needed, and record R2 onwards again.
- **R2 or R3 only:** use Dashboard → Remove & unstake, wait for the grace to expire, then confirm Withdraw before relisting. Legacy entries refund immediately through their unregister action.
- **A payment hangs for more than 30 s:** the testnet RPC is slow. Cut and retake; nothing was charged unless a tx hash appeared.
- **An honest provider scores low:** re-run its audit with **Run audit now**. The README explains why the test is statistical.
- **Out of USDC:** get more at faucet.circle.com (Stellar testnet), or set `PAYMENTS_MODE=simulated` in `.env`. Simulated payments must then be stated in the video and the README.

## Multiple endpoints with one wallet

Set `LISTING_REGISTRY_CONTRACT_ID` to the deployed public address in `.env.example`, then restart `pnpm demo:weather`. Register two weather endpoints using the same wallet; each gets its own ID, name and stake. Dashboard → Rename changes the selected listing only. Remove & unstake starts the 10-second onchain grace; after expiry confirm Withdraw to recover remaining stake. Legacy entries keep their immediate unregister refund. Both registry instances are read together; existing stakes are preserved.

## MET Norway weather verification walkthrough

Run `pnpm demo:weather` in a terminal. Keep it running while testing. This starts four local, unlisted demo endpoints; none appears in Catalog until a person submits it from `/list`. Shared community data is configured through [the Supabase guide](supabase-setup.md). Use a dedicated namespace for demos; `pnpm demo:reset` still changes legacy onchain listings and cannot clear shared audits.

In the browser open `http://localhost:3000/list`, connect a funded Stellar Testnet wallet, select **Weather API**, and register these endpoints. Each registration requires a separate wallet confirmation and stakes the configured amount (default 5 USDC per listing). The auditor also needs testnet USDC for its paid probes.

| Endpoint | Suggested listing name | Select these response fields | Expected audit |
|---|---|---|---|
| `http://localhost:4003/weather/v1/forecast` | `MET Exact Demo` | Resolved latitude, Resolved longitude, Forecast time, Source update time, Air temperature, Apparent temperature, Relative humidity, Wind speed, Wind direction, Total cloud cover, Sea-level pressure | Pass |
| `http://localhost:4004/weather/v1/forecast` | `NearCast Demo` | Resolved latitude, Resolved longitude, Forecast time, Air temperature, Apparent temperature, Relative humidity, Wind speed | Pass within tolerance |
| `http://localhost:4005/weather/v1/forecast` | `False Front Demo` | Resolved latitude, Resolved longitude, Forecast time, Air temperature, Relative humidity, Precipitation next hour, Wind speed, Total cloud cover, Sea-level pressure | Low concordance; review case when Supabase is configured |
| `http://localhost:4006/weather/v1/forecast` | `MET Plus Demo` | Same 11 fields as `MET Exact Demo`; add `pollenRisk` and `outdoorRecommendation` under extra fields | Pass; extras remain unverified |

The `4003` endpoint relays MET Norway values. `4004` shifts several values by amounts inside the documented tolerances. `4005` changes values well beyond tolerance. `4006` relays the same values as `4003` and supplies two extra fields. The tests use five fixed places/horizons. Only the provider's declared canonical fields are compared; the free-form extras never affect the score. In `/dashboard`, open **Trust & audits** and **View MET Norway evidence** to see each provider/reference value, delta and tolerance, with MET Norway linked as the reference.

With the current grading, exact matches score 100, NearCast passes with a lower grade (typically around 94), and False Front scores below the passing grade of 80. Each field loses points according to the size of its error, even inside tolerance. Impossible values such as humidity above 100% score 0 for that field. NearCast clamps its deliberately increased humidity to 100%, while the dishonest fixture remains intentionally incorrect. Old audit results retain their previous grade and are identified as historical grading; rerun the selected listing after restarting the demo to get a new grade.

The newly listed endpoint is audited automatically. Leave the listing price at `0.005 USDC` per request: a five-probe audit costs about `0.025 USDC` from the auditor wallet, plus normal Stellar testnet transaction fees. The shared demo host looks up the listing ID sent by the browser/agent/auditor and charges that listing's price to its registered owner. Without a listing ID, a single active registration for that endpoint is selected; several registrations require the header. MET Norway is fetched before each paid request, so an upstream failure does not charge a probe. If a probe fails or cannot be compared, it is excluded; fewer than five valid probes makes the round inconclusive, without warning or slashing.

After restarting `pnpm demo:weather` to load a payout-routing update, make one new paid browser request from a buyer wallet. The buyer dashboard should show `0.005 USDC` spent and the registered provider wallet should show `0.005 USDC` earned after ledger confirmation and the next dashboard refresh. Existing listings do not need to be recreated. Old calls paid to fixture wallets appear as **Weather demo host (legacy payout)** in the buyer history; they did not credit the listing owner's wallet. Ordinary wallet funding transfers are excluded from both totals.

To refresh a selected weather comparison, get its `listingId` from `http://localhost:4002/audits` and request a targeted round:

```sh
curl -X POST http://localhost:4002/audit/run \
  -H 'content-type: application/json' \
  -d '{"provider":"LISTING_ID"}'
```

The request returns immediately with `{"started":true}`. Weather disagreement and votes do not automatically slash. A failed comparable audit may open one shared review case; follow the provider response and independent moderator walkthrough in [the Supabase guide](supabase-setup.md) to test an explicit warning, pause or slash. The homepage **Run audit now** button audits every active listing and spends the auditor's USDC on each one.
