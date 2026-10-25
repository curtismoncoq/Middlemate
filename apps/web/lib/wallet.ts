'use client';
// Stellar Wallets Kit wrapper (Freighter, xBull, Lobstr, Albedo…), testnet only. Loaded lazily: the kit needs `window`.
const TESTNET = 'Test SDF Network ; September 2015';

let ready: Promise<typeof import('@creit.tech/stellar-wallets-kit/sdk').StellarWalletsKit> | null = null;

function kit() {
  ready ??= (async () => {
    const [{ StellarWalletsKit }, { defaultModules }, { Networks }] = await Promise.all([
      import('@creit.tech/stellar-wallets-kit/sdk'),
      import('@creit.tech/stellar-wallets-kit/modules/utils'),
      import('@creit.tech/stellar-wallets-kit/types'),
    ]);
    StellarWalletsKit.init({ modules: defaultModules(), network: Networks.TESTNET });
    return StellarWalletsKit;
  })();
  return ready;
}

export async function connect(): Promise<{ address: string }> {
  return (await kit()).authModal();
}

export async function disconnect() {
  await (await kit()).disconnect();
}

export async function signAuthEntry(authEntry: string, opts?: { networkPassphrase?: string; address?: string }) {
  return (await kit()).signAuthEntry(authEntry, { networkPassphrase: opts?.networkPassphrase ?? TESTNET, address: opts?.address });
}

export async function signTransaction(xdr: string, address: string): Promise<string> {
  const { signedTxXdr } = await (await kit()).signTransaction(xdr, { networkPassphrase: TESTNET, address });
  return signedTxXdr;
}
