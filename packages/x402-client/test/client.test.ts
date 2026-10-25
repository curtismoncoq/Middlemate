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
