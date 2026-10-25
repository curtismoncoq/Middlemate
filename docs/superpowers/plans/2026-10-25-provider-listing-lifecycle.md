# Plan — Multiple listings and provider exits

Branch: `feat/provider-listing-lifecycle`

- [x] Add isolated per-listing contract storage, atomic register/stake, owner checks, configurable 10-second exit, and audit methods; preserve legacy ABI.
- [x] Extend registry clients and offchain fallback; aggregate legacy and new registries.
- [x] Switch the listing form to atomic wallet-signed registration and adapt catalog/auditor/agent identity.
- [x] Add per-listing dashboard top-up, rename and exit/refund wallet flows, including legacy unregister.
- [x] Verify contract, clients, UI types, existing inference tests, and deployment build.
- [x] Deploy the additional Testnet instance, set the local public contract ID, restart and verify reads; preserve legacy stakes.

Regression also fixed: RPC recipient topics are grouped within the five-pattern limit; payment-history errors do not hide registry stake or mislabel an unknown connection as offchain.

Deployment: `CCRBI5SWFCRIFPTJPEEWRO3I6U7DYULTXZXLZFYKOZCWZAGFTPDWEUXT` (Testnet), alongside the unchanged legacy registry. Verified cooldown=10 and simulated two registrations from the same wallet through the actual web API without submitting them. Catalog/dashboard return 200 and legacy listings/stakes remain present.

Final integration: based on `build` at `7d2aa10`, preserving real weather x402 payments and shared buyer CORS. `pnpm test` passes 119 tests; `cargo test -p registry` passes 21 tests; root and web TypeScript checks pass.
