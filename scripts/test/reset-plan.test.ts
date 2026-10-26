import { describe, it, expect } from 'vitest';
import type { Listing } from '@tb/registry-client';
import { resetPlan, pausedLine, sharedHistoryBlock } from '../reset-plan.ts';

const W1 = 'GAHONESTWALLET00000000000000000000000000000000000000WXYZ';
const base: Listing = { provider: 'GLEGACYPROVIDERA', name: 'Provider A', endpoint: 'http://x', claimedModel: 'MiniMax-M2.7', priceAtomic: 200000n, stakeAtomic: 50000000n, active: true };
const perId = (o: Partial<Listing>): Listing => ({ ...base, id: 'ab'.repeat(32), provider: W1, retired: false, exitAt: 0, ...o });
const now = 1_800_000_000;

describe('resetPlan', () => {
  it('unregisters legacy listings', () => {
    expect(resetPlan([base], now)).toEqual({ unregister: [base], pause: [] });
  });
  it('ignores a per-ID listing the auditor slashed (stake 0, paused, not retired)', () => {
    expect(resetPlan([perId({ name: 'CheapMax', active: false, stakeAtomic: 0n })], now)).toEqual({ unregister: [], pause: [] });
  });
  it('pauses an active, staked per-ID listing instead of stopping', () => {
    const honest = perId({ name: 'Honest Llama' });
    expect(resetPlan([honest], now).pause).toEqual([honest]);
  });
  it('ignores a per-ID listing whose exit grace has expired, even before withdrawal', () => {
    expect(resetPlan([perId({ active: false, exitAt: now - 5 })], now).pause).toEqual([]);
  });
  it('pauses a per-ID listing still inside its exit grace', () => {
    expect(resetPlan([perId({ active: true, exitAt: now + 5 })], now).pause).toHaveLength(1);
  });
  it('ignores retired listings', () => {
    expect(resetPlan([perId({ retired: true, active: false, stakeAtomic: 0n })], now)).toEqual({ unregister: [], pause: [] });
  });
  it('names the paused listing, its owner, and that the stake is still theirs to withdraw', () => {
    const line = pausedLine(perId({ name: 'Honest Llama' }));
    expect(line).toMatch(/Honest Llama \(GAHO…WXYZ\)/);
    expect(line).toMatch(/5 USDC/);
    expect(line).toMatch(/withdraw/i);
  });
});

describe('sharedHistoryBlock', () => {
  it('lets reset run when audits live in the local file', () => {
    expect(sharedHistoryBlock(false, [])).toBeNull();
  });
  it('stops reset when the audit log is shared in Supabase, naming how to get a clean one', () => {
    const msg = sharedHistoryBlock(true, []);
    expect(msg).toMatch(/Supabase/);
    expect(msg).toMatch(/SUPABASE_URL/);
    expect(msg).toMatch(/COMMUNITY_NAMESPACE/);
  });
  it('runs anyway with --keep-shared-audits', () => {
    expect(sharedHistoryBlock(true, ['--keep-shared-audits'])).toBeNull();
  });
});
