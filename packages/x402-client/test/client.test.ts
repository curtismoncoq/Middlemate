import { describe, it, expect } from 'vitest';
import { createPayingFetch } from '../src/index.ts';

import { Keypair } from '@stellar/stellar-sdk';
const AGENT_SECRET = Keypair.random().secret();

describe('createPayingFetch (simulated)', () => {
  it('sends X-Simulated-Payment with the payer address and reports a simulated tx', async () => {
    let seen: string | null = null;
    const fakeFetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      seen = new Headers(init?.headers).get('x-simulated-payment');
      return new Response('{"ok":true}', { status: 200 });
    }) as typeof fetch;
    const pay = createPayingFetch(AGENT_SECRET, { paymentsMode: 'simulated', fetchImpl: fakeFetch });
    const res = await pay('http://x/echo', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(seen).toMatch(/^G[A-Z2-7]{55}$/);
    expect(res.payment).toEqual({ txHash: 'simulated', payer: seen });
  });
});

import { encodePaymentRequiredHeader } from '@x402/core/http';

describe('createPayingFetch (real) price cap', () => {
  const USDC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
  const challenge = (amount: string) =>
    new Response('{}', {
      status: 402,
      headers: {
        'PAYMENT-REQUIRED': encodePaymentRequiredHeader({
          x402Version: 2,
          resource: { url: 'http://p/x', description: '', mimeType: 'application/json' },
          accepts: [{ scheme: 'exact', network: 'stellar:testnet', asset: USDC, amount, payTo: Keypair.random().publicKey(), maxTimeoutSeconds: 60, extra: {} }],
        } as never),
      },
    });

  it('refuses to pay a 402 that asks for more than maxAmountAtomic, without a second request', async () => {
    let calls = 0;
    const fakeFetch = (async () => { calls++; return challenge('5000000'); }) as typeof fetch;
    const pay = createPayingFetch(Keypair.random().secret(), { paymentsMode: 'real', fetchImpl: fakeFetch });
    await expect(pay('http://p/x', { method: 'POST' }, { maxAmountAtomic: 120000n })).rejects.toThrow(/asks for 5000000 > cap 120000/);
    expect(calls).toBe(1);
  });
});
