import { describe, it, expect } from 'vitest';
import { buildDashboardSnapshot, type DashboardEvent } from '../lib/dashboard.ts';
import type { ApiListing } from '../lib/types.ts';

const owner = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const buyer = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB4Z';
const listing: ApiListing = { provider: owner, name: 'Weather', endpoint: 'http://localhost:4003/weather/v1/forecast', claimedModel: 'api:weather@1', priceAtomic: '100000', stakeAtomic: '50000000', active: true };
const event: DashboardEvent = { id: 'e1', at: new Date().toISOString(), provider: owner, payer: buyer, listingName: 'Weather', claimedModel: 'api:weather@1', amountAtomic: '100000', txHash: 'tx1' };

describe('dashboard snapshot', () => {
  it('separates provider earnings and stake from buyer spending', () => {
    const provider = buildDashboardSnapshot(owner, [listing], [event], []);
    expect(provider.provider).toMatchObject({ earningsAtomic: '100000', stakeAtomic: '50000000', requests: 1 });
    expect(provider.buyer).toMatchObject({ spentAtomic: '0', requests: 0 });
    const customer = buildDashboardSnapshot(buyer, [listing], [event], []);
    expect(customer.buyer).toMatchObject({ spentAtomic: '100000', requests: 1 });
    expect(customer.provider).toMatchObject({ earningsAtomic: '0', stakeAtomic: '0', requests: 0 });
  });

  it('returns zero-valued daily series when there is no activity', () => {
    const snapshot = buildDashboardSnapshot(owner, [listing], [], [], Date.UTC(2026, 0, 30));
    expect(snapshot.provider.daily).toHaveLength(7);
    expect(snapshot.provider.daily.every((point) => point.amountAtomic === '0')).toBe(true);
  });
});
