import { describe, it, expect, vi, afterEach } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('createBrowserPayingFetch', () => {
  it('never swaps a real payment for a simulated header, even on weather demo ports', async () => {
    vi.stubEnv('NEXT_PUBLIC_WEATHER_DEMO', '1');
    const seen: Headers[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(input instanceof Request ? input.headers : init?.headers));
      return new Response('{}', { status: 200 });
    }));
    const { createBrowserPayingFetch } = await import('../lib/x402-browser.ts');
    await createBrowserPayingFetch(Keypair.random().publicKey())('http://localhost:4004/weather/v1/forecast', { method: 'POST' });
    expect(seen.length).toBeGreaterThan(0);
    for (const h of seen) expect(h.get('x-simulated-payment')).toBeNull();
  });
});
