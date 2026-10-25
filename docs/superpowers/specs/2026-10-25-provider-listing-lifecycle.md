# Multiple listings and provider exits

A wallet can own many listings. Each new listing has a random 32-byte ID, its own user-entered name, endpoint, price, stake, audit identity and exit state. Ownership remains the provider's Stellar account. Registration and initial stake are atomic and require the provider's signature.

Preserve the deployed legacy registry and its ABI. Deploy an additional registry instance for new listing methods, configured with `LISTING_REGISTRY_CONTRACT_ID`. Read both registries through `@tb/registry-client`; keep the legacy methods for seed providers and existing funds. New IDs are optional on the shared Listing type so legacy listings retain their existing identity.

The new registry exposes owner-authorized registration, stake top-up, rename, exit request, cancellation, and withdrawal. An exit request starts an onchain grace period, initially 10 seconds; the admin can change the stored cooldown for future requests. Listings remain callable during the grace period, become inactive at its expiry, and retain their history after withdrawal. Withdrawal returns remaining stake only to the owner, after a second wallet approval. Auditor slashing remains possible until withdrawal and targets one listing ID. Cancellation during the grace period never undoes an auditor pause.

Existing legacy listings can use the deployed `unregister` refund operation from the dashboard, with wallet confirmation; that legacy operation is immediate. No automatic migration, reset, refund, or reseeding of existing listings is performed.

Catalog keys, dashboard controls, agent exclusion/trust checks, and audit identity must use listing ID where present, and provider address for legacy entries. Provider dashboard ownership and chain payment recipients remain wallet addresses. Plain wallet transfers cannot distinguish earnings between several listings sharing one payout wallet, so show wallet-level earnings and do not invent per-listing attribution.
