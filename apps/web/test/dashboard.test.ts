import { describe, it, expect } from 'vitest';
import { buildDashboardSnapshot, marketplacePaymentEvents, type DashboardEvent } from '../lib/dashboard.ts';
import type { ApiListing } from '../lib/types.ts';

const owner = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const buyer = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB4Z';
const listing: ApiListing = { provider: owner, name: 'Weather', endpoint: 'http://localhost:4003/weather/v1/forecast', claimedModel: 'api:weather@1', priceAtomic: '100000', stakeAtomic: '50000000', active: true };
const event: DashboardEvent = { id: 'e1', at: new Date().toISOString(), provider: owner, payer: buyer, listingName: 'Weather', claimedModel: 'api:weather@1', amountAtomic: '100000', txHash: 'tx1' };

describe('dashboard snapshot', () => {
  it('shows historical demo payments to buyers without claiming they reached the listing owner', () => {
    const fixtureTransfer = { ...event, provider: 'GDEMOHOST', amountAtomic: '50000' };
    const events = marketplacePaymentEvents([fixtureTransfer], [listing], [], [{ provider: 'GDEMOHOST', name: 'Weather demo host (legacy payout)', claimedModel: 'api:weather@1' }]);
    expect(buildDashboardSnapshot(buyer, [listing], events, []).buyer.spentAtomic).toBe('50000');
    expect(buildDashboardSnapshot(owner, [listing], events, []).provider.earningsAtomic).toBe('0');
    expect(events[0]).toMatchObject({ provider: 'GDEMOHOST', listingName: 'Weather demo host (legacy payout)' });
  });
  it('excludes stake refunds and avoids attributing wallet earnings to an arbitrary endpoint', () => {
    const events = marketplacePaymentEvents([event, { ...event, id: 'refund', payer: 'REGISTRY', amountAtomic: '50000000' }], [{ ...listing, id: 'a' }, { ...listing, id: 'b' }], ['REGISTRY']);
    expect(events).toHaveLength(1);
    expect(events[0].listingName).toBe('Provider wallet');
    expect(buildDashboardSnapshot(owner, [listing], events, []).provider.earningsAtomic).toBe('100000');
  });
  it('shows all listings owned by one wallet with independent stakes and audits', () => {
    const a = { ...listing, id: 'a' }, b = { ...listing, id: 'b', name: 'Rain', stakeAtomic: '20000000' };
    const snapshot = buildDashboardSnapshot(owner, [a, b], [], [{ provider: owner, listingId: 'a', name: a.name, at: new Date().toISOString(), verdict: { score: 100, pass: true, inconclusive: false } }]);
    expect(snapshot.listings).toHaveLength(2);
    expect(snapshot.provider.stakeAtomic).toBe('70000000');
    expect(snapshot.audits).toHaveLength(1);
  });
  it('keeps weather warnings and field evidence for the provider dashboard', () => {
    const snapshot = buildDashboardSnapshot(owner, [{ ...listing, id: 'weather-1' }], [], [{
      provider: owner, listingId: 'weather-1', name: listing.name, at: new Date().toISOString(),
      verdict: { score: 42, pass: false, inconclusive: false }, warning: { level: 1, threshold: 3 },
      weather: { source: 'MET Norway', referenceUrl: 'https://api.met.no/', extraFields: ['pollenRisk'], probes: [{ id: 'w1', request: { latitude: 38.7, longitude: -9.1, forecastHours: 1 }, status: 'ok', fields: [{ id: 'forecast.temperatureC', providerValue: 40, referenceValue: 18, tolerance: 2, pass: false }] }] },
    }]);
    expect(snapshot.audits[0]).toMatchObject({ listingId: 'weather-1', warning: { level: 1, threshold: 3 }, weather: { source: 'MET Norway' } });
  });
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
