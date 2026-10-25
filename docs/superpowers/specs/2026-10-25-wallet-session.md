# Wallet session restoration

Remember a successful Freighter connection across page reloads. Persist only the wallet choice in browser localStorage. On mount, focus, and while the visible page is open, obtain the current authorized address from the installed Freighter module with `skipRequestAccess: true`; never open the authorization modal or request a signature automatically.

No remembered choice means no automatic wallet probe. An unavailable or unauthorized extension yields a disconnected view without reusing a cached address. Explicit disconnect removes the remembered choice, including when the SDK disconnect operation fails. Ignore stale restoration/connection results after newer user actions. Refresh account-specific dashboard data when the extension's account changes, and ignore older wallet requests.

Wallet transaction confirmations remain explicit. Browser storage restrictions may prevent persistence. This change does not alter either Testnet contract address.
