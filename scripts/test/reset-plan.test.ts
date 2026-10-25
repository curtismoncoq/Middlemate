import { describe, it, expect } from 'vitest';
import type { Listing } from '@tb/registry-client';
import { resetPlan, blockingMessage } from '../reset-plan.ts';

const W1 = 'GAHONESTWALLET00000000000000000000000000000000000000WXYZ';
const base: Listing = { provider: 'GLEGACYPROVIDERA', name: 'Provider A', endpoint: 'http://x', claimedModel: 'MiniMax-M2.7', priceAtomic: 200000n, stakeAtomic: 50000000n, active: true };
const perId = (o: Partial<Listing>): Listing => ({ ...base, id: 'ab'.repeat(32), provider: W1, retired: false, exitAt: 0, ...o });
const now = 1_800_000_000;

describe('resetPlan', () => {
  it('unregisters legacy listings', () => {
    expect(resetPlan([base], now)).toEqual({ unregister: [base], blocking: [] });
  });
  it('ignores a per-ID listing the auditor slashed (stake 0, paused, not retired)', () => {
    expect(resetPlan([perId({ name: 'CheapMax', active: false, stakeAtomic: 0n })], now)).toEqual({ unregister: [], blocking: [] });
  });
  it('blocks on an active, staked per-ID listing', () => {
    const honest = perId({ name: 'Honest Llama' });
    expect(resetPlan([honest], now).blocking).toEqual([honest]);
  });
  it('ignores a per-ID listing whose exit grace has expired, even before withdrawal', () => {
    expect(resetPlan([perId({ active: false, exitAt: now - 5 })], now).blocking).toEqual([]);
  });
  it('blocks on a per-ID listing still inside its exit grace', () => {
    expect(resetPlan([perId({ active: true, exitAt: now + 5 })], now).blocking).toHaveLength(1);
  });
  it('ignores retired listings', () => {
    expect(resetPlan([perId({ retired: true, active: false, stakeAtomic: 0n })], now)).toEqual({ unregister: [], blocking: [] });
  });
  it('names each blocking listing and its owner wallet', () => {
    expect(blockingMessage([perId({ name: 'Honest Llama' })])).toMatch(/Honest Llama \(GAHO…WXYZ\)/);
  });
});
