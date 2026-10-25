import { describe, it, expect } from 'vitest';
import { catalogSummary } from '../lib/catalog.ts';
import type { ApiListing } from '../lib/types.ts';

const at = '2026-10-25T15:00:00Z';
const mk = (o: Partial<ApiListing>): ApiListing => ({
  provider: o.name ?? 'G', name: 'x', endpoint: 'http://x', claimedModel: 'MiniMax-M2.7', priceAtomic: '200000', stakeAtomic: '50000000', active: true, verifiable: true, ...o,
});

describe('catalogSummary', () => {
  it('counts live listings, total stake, passed, under review and slashed from the rows', () => {
    const s = catalogSummary([
      mk({ name: 'A', lastAudit: { at, score: 100, matchedModel: 'MiniMax-M2.7', confidence: 1, pass: true } }),
      mk({ name: 'Llama', claimedModel: 'llama3.2:3b' }), // no audit yet → under review
      mk({ name: 'Weather', claimedModel: 'api:weather@1', verifiable: false, stakeAtomic: '10000000' }),
      mk({ name: 'CheapMax', active: false, stakeAtomic: '0', lastAudit: { at, score: 0, matchedModel: 'qwen2.5:0.5b', confidence: 1, pass: false, slashTx: 't' } }),
    ]);
    expect(s).toEqual({ live: 3, stakedUsdc: 11, passed: 1, underReview: 1, slashed: 1 });
  });

  it('is all zeros for an empty registry', () => {
    expect(catalogSummary([])).toEqual({ live: 0, stakedUsdc: 0, passed: 0, underReview: 0, slashed: 0 });
  });
});
