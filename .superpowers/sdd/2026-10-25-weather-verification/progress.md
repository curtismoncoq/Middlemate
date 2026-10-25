# Weather verification ledger

- 2026-10-25 — Ruling: MET Norway Locationforecast 2.0 is the marketplace reference for every `api:weather@1` listing; providers do not choose the reference.
- 2026-10-25 — Ruling: extra provider fields are declared and displayed but cannot contribute to warnings or slashing.
- 2026-10-25 — Ruling: weather grades now reflect numeric error magnitude: `max(0, 100 - 20 × error / tolerance)`, averaged over comparable fields and rounded down. Invalid provider ranges score 0. Grade 80 still passes; existing minimum probes and three-failure enforcement rules remain. Old binary-tolerance grades are labeled rather than rewritten. NearCast clamps humidity to 0–100%.
- 2026-10-25 — Ruling: five valid probes minimum; two warnings; slash and pause on the third consecutive failed weather audit; inconclusive rounds do not count.
- 2026-10-25 — Ruling: field evidence and warning history are durable auditor data; stake and sanctions remain on Stellar.
- 2026-10-25 — Ruling: `WEATHER_TRUST_THRESHOLD` (default `80`) configures the pass score; `WEATHER_WARNING_THRESHOLD` (default `3`) configures consecutive failed rounds before slash and pause.
- 2026-10-25 — Ruling: shared weather fixtures pay the registered owner at the registered price, selected by a registry-verified listing ID. Historical fixture payments remain attributed to their actual recipient.
- 2026-10-25 — Payment investigation: fixed four-topic SAC event decoding, empty scan-page pagination, and wallet outgoing/incoming indexing. Direct SAC transfer envelopes distinguish settled API payments from classic wallet funding. Verified buyer `GCRG…ZQH5` has one 0.005 USDC legacy weather payment; verified new fixture challenge names owner `GD3A…OCN5` as recipient without making a payment.
- 2026-10-25 — Validation: `pnpm test` passed (154 tests), `pnpm typecheck` passed, and `cargo test -p registry` passed (21 contract tests). Manual browser/Testnet walkthrough remains for the user.
