'use client';
// Freighter-only Stellar Wallets Kit wrapper for the testnet demo. Keep unrelated wallet
// adapters out of the module list so they cannot probe/connect in the background.
const TESTNET = 'Test SDF Network ; September 2015';
export const WALLET_SESSION_KEY = 'trustbazaar.wallet.v1';

function rememberWallet(connected: boolean) {
  try {
    if (connected) window.localStorage.setItem(WALLET_SESSION_KEY, 'freighter');
    else window.localStorage.removeItem(WALLET_SESSION_KEY);
  } catch { /* Browser storage may be disabled; explicit connection still works. */ }
}

let ready: Promise<typeof import('@creit.tech/stellar-wallets-kit/sdk').StellarWalletsKit> | null = null;

function kit() {
  ready ??= (async () => {
    const [{ StellarWalletsKit }, { FreighterModule }, { Networks }] = await Promise.all([
      import('@creit.tech/stellar-wallets-kit/sdk'),
      import('@creit.tech/stellar-wallets-kit/modules/freighter'),
      import('@creit.tech/stellar-wallets-kit/types'),
    ]);
    StellarWalletsKit.init({ modules: [new FreighterModule()], network: Networks.TESTNET });
    return StellarWalletsKit;
  })();
  return ready;
}

export async function connect(): Promise<{ address: string }> {
  const result = await (await kit()).authModal();
  if (!result.address) throw new Error('The wallet did not return an address.');
  rememberWallet(true);
  return result;
}

export async function disconnect() {
  rememberWallet(false);
  await (await kit()).disconnect();
}

/** Restore only a prior user connection. This never requests access or a signature. */
export async function restoreConnection(): Promise<{ address: string } | null> {
  try {
    if (window.localStorage.getItem(WALLET_SESSION_KEY) !== 'freighter') return null;
    const walletKit = await kit();
    walletKit.setWallet('freighter');
    const result = await walletKit.selectedModule.getAddress({ skipRequestAccess: true });
    return result.address ? result : null;
  } catch { return null; }
}

export async function signAuthEntry(authEntry: string, opts?: { networkPassphrase?: string; address?: string }) {
  return (await kit()).signAuthEntry(authEntry, { networkPassphrase: opts?.networkPassphrase ?? TESTNET, address: opts?.address });
}

export async function signTransaction(xdr: string, address: string): Promise<string> {
  const { signedTxXdr } = await (await kit()).signTransaction(xdr, { networkPassphrase: TESTNET, address });
  return signedTxXdr;
}

/** SEP-53 ownership proof; this never submits a transaction. */
export async function signMessage(message: string, address: string): Promise<string> {
  const signed = await (await kit()).signMessage(message, { address, networkPassphrase: TESTNET });
  if (signed.signerAddress && signed.signerAddress !== address) throw new Error('Wallet changed while signing. Reconnect and try again.');
  return signed.signedMessage;
}
