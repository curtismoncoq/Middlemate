'use client';
import { x402Client } from '@x402/core/client';
import { decodePaymentResponseHeader, wrapFetchWithPayment } from '@x402/fetch';
import { ExactStellarScheme } from '@x402/stellar/exact/client';
import type { BrowserPay } from '../components/TryItPanel.tsx';
import { signAuthEntry } from './wallet.ts';

/** fetch() that pays x402 challenges by asking the connected wallet to sign the USDC transfer auth entry. */
export function createBrowserPayingFetch(address: string): BrowserPay {
  const signer = { address, signAuthEntry: (entry: string, opts?: { networkPassphrase?: string; address?: string }) => signAuthEntry(entry, { ...opts, address }) };
  const client = new x402Client().register('stellar:*', new ExactStellarScheme(signer));
  const paid = wrapFetchWithPayment(fetch, client);
  return async (url, init) => {
    if (process.env.NEXT_PUBLIC_WEATHER_DEMO === '1' && /^400[3-5]$/.test(new URL(url).port)) {
      return fetch(url, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), 'X-Simulated-Payment': address } });
    }
    const res = (await paid(url, init)) as Response & { payment?: { txHash: string } };
    const header = res.headers.get('PAYMENT-RESPONSE') ?? res.headers.get('X-PAYMENT-RESPONSE');
    if (header) {
      const s = decodePaymentResponseHeader(header) as { transaction?: string };
      if (s.transaction) res.payment = { txHash: s.transaction };
    }
    return res;
  };
}
