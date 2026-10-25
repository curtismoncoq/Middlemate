# Plan — Wallet session restoration

Branch: `feat/provider-listing-lifecycle`

- [x] Inspect installed SDK's Freighter restore API and avoid access prompts.
- [x] Write restoration/reload, permission failure, and explicit-disconnect regression tests.
- [x] Restore only remembered connections and synchronize account changes.
- [x] Protect against stale responses after disconnect or account switching.
- [x] Show reconnecting state in navigation, dashboard and listing form.
- [x] Finish focused regression and TypeScript checks; keep the dev server available.

Contract configuration: primary `REGISTRY_CONTRACT_ID` remains `CCW4UFJ7MSNSWOQWZWG3XOF2IVVWVRINK3YCEROH6PDO4LW5ZPA6ELUA`; additional `LISTING_REGISTRY_CONTRACT_ID` is `CCRBI5SWFCRIFPTJPEEWRO3I6U7DYULTXZXLZFYKOZCWZAGFTPDWEUXT`.

Verification: 13 focused wallet/form/dashboard tests pass; root and web TypeScript checks pass. The running dashboard responds HTTP 200. No contract redeployment was needed for session restoration.
