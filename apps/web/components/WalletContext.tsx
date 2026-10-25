'use client';
import { createContext, useContext, useMemo, useState } from 'react';
import { connect, disconnect } from '../lib/wallet.ts';
import { createBrowserPayingFetch } from '../lib/x402-browser.ts';
import type { BrowserPay } from './TryItPanel.tsx';

type Wallet = { address: string | null; pay: BrowserPay | null; connect: () => Promise<void>; disconnect: () => Promise<void>; error: string | null };
const Ctx = createContext<Wallet | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = useMemo<Wallet>(
    () => ({
      address,
      error,
      pay: address ? createBrowserPayingFetch(address) : null,
      connect: async () => {
        try {
          setError(null);
          setAddress((await connect()).address);
        } catch (e) {
          setError((e as Error).message ?? 'wallet connection failed');
        }
      },
      disconnect: async () => {
        await disconnect().catch(() => {});
        setAddress(null);
      },
    }),
    [address, error],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): Wallet {
  const w = useContext(Ctx);
  if (!w) throw new Error('useWallet outside WalletProvider');
  return w;
}
