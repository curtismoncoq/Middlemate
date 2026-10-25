'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { connect, disconnect, restoreConnection, WALLET_SESSION_KEY } from '../lib/wallet.ts';
import { createBrowserPayingFetch } from '../lib/x402-browser.ts';
import type { BrowserPay } from './TryItPanel.tsx';

type Wallet = { address: string | null; pay: BrowserPay | null; connect: () => Promise<void>; disconnect: () => Promise<void>; error: string | null; restoring: boolean };
const Ctx = createContext<Wallet | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const revision = useRef(0);
  const lastIntent = useRef<'connect' | 'disconnect' | null>(null);
  const shouldRemainDisconnected = () => lastIntent.current === 'disconnect';
  useEffect(() => {
    let cancelled = false;
    let pending = false;
    const refresh = async (initial = false) => {
      if (pending) return;
      pending = true;
      const started = revision.current;
      try {
        const restored = await restoreConnection();
        if (!cancelled && started === revision.current) setAddress(restored?.address ?? null);
      } finally {
        pending = false;
        if (!cancelled && initial) setRestoring(false);
      }
    };
    const wake = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    const storage = (event: StorageEvent) => {
      if (event.key !== WALLET_SESSION_KEY && event.key !== null) return;
      if (!event.newValue) { revision.current += 1; setAddress(null); }
      else wake();
    };
    void refresh(true);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('storage', storage);
    const timer = window.setInterval(wake, 5000);
    return () => {
      cancelled = true; window.clearInterval(timer);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('storage', storage);
    };
  }, []);
  const value = useMemo<Wallet>(
    () => ({
      address,
      error,
      restoring,
      pay: address ? createBrowserPayingFetch(address) : null,
      connect: async () => {
        const started = ++revision.current;
        lastIntent.current = 'connect';
        try {
          setError(null);
          const connected = await connect();
          if (started === revision.current) setAddress(connected.address);
          else if (shouldRemainDisconnected()) await disconnect().catch(() => {});
        } catch (e) {
          if (started === revision.current) setError((e as Error).message ?? 'wallet connection failed');
        }
      },
      disconnect: async () => {
        revision.current += 1;
        lastIntent.current = 'disconnect';
        setAddress(null);
        setError(null);
        await disconnect().catch(() => {});
      },
    }),
    [address, error, restoring],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): Wallet {
  const w = useContext(Ctx);
  if (!w) throw new Error('useWallet outside WalletProvider');
  return w;
}
