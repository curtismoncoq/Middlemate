import { describe, it, expect } from 'vitest';
import { awaitingReview } from '../src/review.ts';
import type { Listing } from '@tb/registry-client';

const L = (provider: string, claimedModel = 'llama3.2:3b', over: Partial<Listing> = {}): Listing => ({
  provider, name: provider, endpoint: 'http://x', claimedModel, priceAtomic: 40000n, stakeAtomic: 50000000n, active: true, ...over,
});
const REFS = ['MiniMax-M2.7', 'llama3.2:3b', 'qwen2.5:0.5b'];

describe('awaitingReview', () => {
  it('requires a separate audit for each listing owned by one wallet', () => {
    const got = awaitingReview([L('GOWNER', 'llama3.2:3b', { id: 'one' }), L('GOWNER', 'llama3.2:3b', { id: 'two' })], [{ provider: 'GOWNER', listingId: 'one' }], REFS);
    expect(got.map((l) => l.id)).toEqual(['two']);
  });
  it('returns active, staked, verifiable listings with no audit record yet', () => {
    const got = awaitingReview([L('GNEW'), L('GOLD')], [{ provider: 'GOLD' }], REFS);
    expect(got.map((l) => l.provider)).toEqual(['GNEW']);
  });
  it('ignores unstaked, delisted and unverifiable listings', () => {
    const got = awaitingReview([L('G0', 'llama3.2:3b', { stakeAtomic: 0n }), L('GP', 'llama3.2:3b', { active: false }), L('GU', 'Claude Opus 5.5')], [], REFS);
    expect(got).toEqual([]);
  });
});
