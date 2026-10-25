import { describe, it, expect, vi } from 'vitest';
import { BudgetGuard, BudgetExceededError, usd } from '../src/budget.ts';
import { chooseListing } from '../src/choose.ts';
import { runAgent } from '../src/main.ts';
import type { Listing } from '@tb/registry-client';

const L = (name: string, provider: string, claimedModel: string, price: bigint, active = true): Listing => ({
  provider, name, endpoint: `http://p/${provider}`, claimedModel, priceAtomic: price, stakeAtomic: 50000000n, active,
});
const A = L('Provider A', 'GA', 'MiniMax-M2.7', 200000n);
const B = L('Provider B', 'GB', 'llama3.2:3b', 40000n);
const C = L('CheapMax', 'GC', 'MiniMax-M2.7', 120000n);

describe('chooseListing', () => {
  it('can retry another listing from the same wallet', () => {
    const first = { ...A, id: 'first' }, second = { ...A, id: 'second' };
    expect(chooseListing([first, second], A.claimedModel, new Set(['first']))?.id).toBe('second');
  });
  it('picks the cheapest active listing for the model', () => {
    expect(chooseListing([A, B, C], 'MiniMax-M2.7', new Set())?.name).toBe('CheapMax');
  });
  it('skips excluded providers', () => {
    expect(chooseListing([A, B, C], 'MiniMax-M2.7', new Set(['GC']))?.name).toBe('Provider A');
  });
  it('returns null when no active listing serves the model', () => {
    expect(chooseListing([B, { ...A, active: false }], 'MiniMax-M2.7', new Set())).toBeNull();
  });
});

describe('usd', () => {
  it('keeps sub-cent precision and two decimals otherwise', () => {
    expect([usd(120000n), usd(200000n), usd(5000000n), usd(40000n)]).toEqual(['$0.012', '$0.02', '$0.50', '$0.004']);
  });
});

describe('chooseListing verifiable filter', () => {
  it('skips listings whose model is not in the verifiable set', () => {
    const fake = L('FakeMax', 'GF', 'MiniMax-M2.7-Pro', 1000n);
    expect(chooseListing([fake, A], 'MiniMax-M2.7-Pro', new Set(), new Set(['MiniMax-M2.7']))).toBeNull();
    expect(chooseListing([fake, A], 'MiniMax-M2.7', new Set(), new Set(['MiniMax-M2.7']))?.name).toBe('Provider A');
  });
});

describe('BudgetGuard', () => {
  it('refuses spending over the cap', () => {
    const g = new BudgetGuard(5000000n);
    expect(g.canSpend(5000001n)).toBe(false);
    g.record(4900000n);
    expect(g.remaining()).toBe(100000n);
    expect(() => g.record(200000n)).toThrow(BudgetExceededError);
  });
});

function deps(listings: Listing[], isActive: (p: string) => boolean = () => true) {
  const pay = vi.fn(async () => {
    const r = new Response(JSON.stringify({ choices: [{ message: { content: 'a summary' } }] })) as import('@tb/x402-client').PaidResponse;
    r.payment = { txHash: 'tx1', payer: 'GAGENT' };
    return r;
  });
  const lines: string[] = [];
  return { registry: { list: async () => listings, isActive: async (p: string) => isActive(p) }, pay, log: (l: string) => lines.push(l), lines };
}

describe('runAgent', () => {
  it('reroutes when the chosen listing was delisted before paying', async () => {
    const d = deps([A, C], (p) => p !== 'GC');
    const r = await runAgent({ ...d, model: 'MiniMax-M2.7', article: 'text', budgetAtomic: 5000000n });
    expect(r.paidTo).toBe('Provider A');
    expect(d.lines.join('\n')).toMatch(/CheapMax.*delisted.*Provider A/s);
  });

  it('exits cleanly without paying when no provider is active', async () => {
    const d = deps([B]);
    const r = await runAgent({ ...d, model: 'MiniMax-M2.7', article: 'text', budgetAtomic: 5000000n });
    expect(r.paidTo).toBeNull();
    expect(d.pay).not.toHaveBeenCalled();
    expect(d.lines.join('\n')).toMatch(/no active provider for MiniMax-M2.7/);
  });

  it('rejects a payment over the remaining budget without calling the provider', async () => {
    const d = deps([A]);
    const r = await runAgent({ ...d, model: 'MiniMax-M2.7', article: 'text', budgetAtomic: 100000n });
    expect(r.paidTo).toBeNull();
    expect(d.pay).not.toHaveBeenCalled();
    expect(d.lines.join('\n')).toMatch(/REJECTED: payment \$0\.02 exceeds remaining budget \$0\.01/);
  });

  it('treats a connection error as a failed provider and tries the next one', async () => {
    const d = deps([A, C]);
    d.pay.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const r = await runAgent({ ...d, model: 'MiniMax-M2.7', article: 'text', budgetAtomic: 5000000n });
    expect(r.paidTo).toBe('Provider A');
    expect(d.lines.join('\n')).toMatch(/CheapMax failed \(ECONNREFUSED\)/);
  });

  it('pays capped at the listing price with a timeout', async () => {
    const d = deps([A]);
    await runAgent({ ...d, model: 'MiniMax-M2.7', article: 'text', budgetAtomic: 5000000n });
    const [, init, opts] = d.pay.mock.calls[0] as unknown as [string, RequestInit, { maxAmountAtomic: bigint }];
    expect(opts.maxAmountAtomic).toBe(200000n);
    expect(init.signal).toBeDefined();
  });

  it('only buys from listings that passed an audit when a trust check is given', async () => {
    const d = deps([A, C]);
    const r = await runAgent({ ...d, model: 'MiniMax-M2.7', article: 'text', budgetAtomic: 5000000n, isTrusted: (p) => p === 'GA' });
    expect(r.paidTo).toBe('Provider A');
    expect(d.lines.join('\n')).toMatch(/CheapMax.*not audited yet/s);
  });
});
