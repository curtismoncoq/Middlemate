import { describe, it, expect, vi, afterEach } from 'vitest';
import { runWeatherRequest } from '../src/weather.ts';
import { BudgetGuard } from '../src/budget.ts';
import type { Listing } from '@tb/registry-client';
import type { PaidResponse } from '@tb/x402-client';

afterEach(() => vi.unstubAllGlobals());

describe('runWeatherRequest payment', () => {
  it('pays capped at the registered price with a timeout', async () => {
    const fields = ['location.latitude', 'forecast.validAt', 'forecast.temperatureC'];
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      String(url).includes('/api/schemas/')
        ? new Response(JSON.stringify({ openapi: '3.1.0', info: { version: '1' }, paths: { '/weather/v1/forecast': {} } }))
        : new Response(JSON.stringify({ schema: 'api:weather@1', availableFields: fields }))));
    const listing: Listing = { provider: 'GW', name: 'Weather', endpoint: 'http://w/weather/v1/forecast', claimedModel: 'api:weather@1', priceAtomic: 100000n, stakeAtomic: 50000000n, active: true };
    const pay = vi.fn(async () => {
      const r = new Response(JSON.stringify({ schema: 'api:weather@1', availableFields: fields, location: {}, forecast: {} })) as PaidResponse;
      r.payment = { txHash: 'tx', payer: 'GA' };
      return r;
    });
    await runWeatherRequest(
      { registry: { list: async () => [listing], isActive: async () => true }, pay, log: () => {}, guard: new BudgetGuard(5000000n), schemaUrl: 'http://m/api/schemas/weather/v1' },
      { latitude: 38.7, longitude: -9.1 },
    );
    const [, init, opts] = pay.mock.calls[0] as unknown as [string, RequestInit, { maxAmountAtomic: bigint }];
    expect(opts?.maxAmountAtomic).toBe(100000n);
    expect(init.signal).toBeDefined();
    expect(new Headers(init.headers).get('x-tb-listing-id')).toBe('GW');
  });
});
