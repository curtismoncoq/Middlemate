# Demo runbook (≈2.5 min video)

## Before recording

1. `pnpm demo:reset`. This gives CheapMax a fresh staked identity if it was slashed, resets the agent's $0.50 budget and clears the audit log.
2. `pnpm dev`. This starts the web app (:3000), providers (:4001) and auditor (:4002). Restart it after every reset so the providers use the new CheapMax key.
3. Pre-warm Ollama so the first answer isn't slow: `pnpm agent --budget 0` (it refuses to pay, but it loads the catalog), plus one Try-it message to Provider B.
4. Screen layout: browser on the catalog (left two-thirds) and a terminal (right third) with large font.
5. Freighter on **Testnet**, holding a little USDC. Have the agent wallet funded (`pnpm tsx scripts/check-env.ts` shows ≥ 0.10 USDC).

Allow about 10 s per paid request: settlement waits for a ledger.

## Beats

| # | Time | Screen | Action / line |
|---|------|--------|---------------|
| 1 | 0:00 | Catalog | "Agents are starting to buy compute on their own. Nobody checks what they get." |
| 2 | 0:20 | `/list` | Fill in the form (name, endpoint, model, price, stake 1 USDC), approve the two Freighter prompts, and the new card appears. *"To list, you stake."* (Fallback if time is short: show the cards and say they're staked; point at the stake badge.) |
| 3 | 0:50 | Catalog → Try it on Provider B | Send a question and approve in Freighter. The answer comes back with a **paid · tx** link; click it to show stellar.expert. *"Humans pay per message over x402. No account, no API key."* |
| 4 | 1:15 | Terminal | `pnpm agent`. It prints the $0.50 budget, **picks CheapMax $0.012 (cheapest MiniMax)**, pays (tx hash) and prints the summary. *"The agent picks the cheapest model claiming MiniMax."* |
| 5 | 1:40 | Catalog | Click **Run audit now**. The terminal running `pnpm dev` streams probe lines (`closest qwen2.5:0.5b (1.000)`). The CheapMax card **turns red: SLASHED · DELISTED, Actually matched: qwen2.5:0.5b**, then disappears after 20 s. Click the slash tx link. *"It claimed MiniMax and served a 0.5B model. It lost its stake on-chain."* |
| 6 | 2:05 | Terminal | `pnpm agent` again. It now picks **Provider A** (CheapMax is no longer listed). Then `pnpm agent --try-overspend`, which prints **REJECTED: payment $2.00 exceeds remaining budget**. |
| 7 | 2:20 | Catalog | *"Agents can pay for compute, and compute has to prove it's honest."* |

"Run audit now" audits every active listing, which costs about $0.25 of the auditor's USDC. To audit only CheapMax:
`curl -X POST localhost:4002/audit/run -H 'content-type: application/json' -d "{\"provider\":\"$(grep TB_CHEAPMAX_PUBLIC .env | cut -d= -f2)\"}"`

## If something breaks on camera

- Payment hangs for more than 30 s: the testnet RPC is slow. Cut and retake; nothing was charged unless a tx hash printed.
- An honest provider scores low: re-run the audit. The README explains why the test is statistical.
- Out of USDC: get more from faucet.circle.com (Stellar testnet), or set `PAYMENTS_MODE=simulated` in `.env`. Simulated payments must be stated in the video and the README.
