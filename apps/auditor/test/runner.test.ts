import { describe, it, expect, vi } from 'vitest';
import { createRunner, memoryStore } from '../src/runner.ts';
import type { Probe } from '../src/probes.ts';
import type { Listing } from '@tb/registry-client';

const probes: Probe[] = [
  ...[1, 2, 3, 4].map((i) => ({ id: `f${i}`, kind: 'fingerprint' as const, prompt: `open ${i}` })),
  { id: 'c1', kind: 'checkable', prompt: 'what is 6*7?', check: (a: string) => a.includes('42') },
  { id: 'c2', kind: 'checkable', prompt: 'capital of France?', check: (a: string) => /paris/i.test(a) },
];

const listing = (over: Partial<Listing>): Listing => ({
  provider: 'GCHEAT', name: 'CheapMax', endpoint: 'http://p/cheapmax', claimedModel: 'MiniMax-M2.7',
  priceAtomic: 120000n, stakeAtomic: 50000000n, active: true, ...over,
});

// Answers are tagged with the model that "wrote" them; embeddings map a tag to a fixed axis.
const AXIS: Record<string, number[]> = { mm: [1, 0, 0], ll: [0, 1, 0], qq: [0, 0, 1] };
const embed = async (texts: string[]) => texts.map((t) => AXIS[t.slice(0, 2)] ?? [0.3, 0.3, 0.3]);
const references = async () => ({ 'MiniMax-M2.7': 'mm ref', 'llama3.2:3b': 'll ref', 'qwen2.5:0.5b': 'qq ref' });

function setup(listings: Listing[], answer: (url: string) => string | Error) {
  const registry = {
    list: vi.fn(async () => listings),
    slash: vi.fn(async () => ({ hash: 'slashtx', amountAtomic: 50000000n })),
    pauseListing: vi.fn(async (_s: string, p: string) => {
      const l = listings.find((x) => x.provider === p);
      if (l) l.active = false;
      return { hash: 'pausetx' };
    }),
  };
  const pay = vi.fn(async (url: string | URL) => {
    const a = answer(String(url));
    if (a instanceof Error) throw a;
    const r = new Response(JSON.stringify({ choices: [{ message: { content: a } }] }), { status: 200 }) as import('@tb/x402-client').PaidResponse;
    r.payment = { txHash: 'paytx', payer: 'GAUD' };
    return r;
  });
  const store = memoryStore();
  const runner = createRunner({ registry, auditorSecret: 'SAUD', pay, references, embed, store, pickProbes: () => probes });
  return { runner, registry, pay, store };
}

describe('runAudit', () => {
  it('slashes and pauses a cheater whose answers match qwen', async () => {
    const { runner, registry } = setup([listing({})], () => 'qq answer');
    const [rec] = await runner.runAudit();
    expect(rec.verdict.pass).toBe(false);
    expect(rec.verdict.matchedModel).toBe('qwen2.5:0.5b');
    expect(registry.slash).toHaveBeenCalledTimes(1);
    expect(registry.pauseListing).toHaveBeenCalledTimes(1);
    expect(rec.slashTx).toBe('slashtx');
    expect(rec.pauseTx).toBe('pausetx');
  });

  it('passes an honest provider without slashing', async () => {
    const { runner, registry } = setup([listing({ provider: 'GA', name: 'Provider A' })], (u) => (u ? 'mm 42 paris' : ''));
    const [rec] = await runner.runAudit();
    expect(rec.verdict.pass).toBe(true);
    expect(registry.slash).not.toHaveBeenCalled();
  });

  it('skips listings that are already inactive (no second slash)', async () => {
    const ls = [listing({})];
    const { runner, registry } = setup(ls, () => 'qq answer');
    await runner.runAudit();
    const second = await runner.runAudit();
    expect(second).toHaveLength(0);
    expect(registry.slash).toHaveBeenCalledTimes(1);
  });

  it('retries a failing probe once, then records it as an error and does not slash on too little data', async () => {
    const { runner, registry, pay } = setup([listing({ provider: 'GA', name: 'Provider A' })], () => new Error('timeout'));
    const [rec] = await runner.runAudit();
    expect(pay).toHaveBeenCalledTimes(probes.length * 2);
    expect(rec.probes.every((p) => p.status === 'error')).toBe(true);
    expect(rec.verdict.inconclusive).toBe(true);
    expect(registry.slash).not.toHaveBeenCalled();
  });

  it('audits only the requested provider and stores records newest first', async () => {
    const ls = [listing({ provider: 'GA', name: 'Provider A', endpoint: 'http://p/a' }), listing({})];
    const { runner, store } = setup(ls, (u) => (u.includes('cheapmax') ? 'qq' : 'mm 42 paris'));
    await runner.runAudit('GA');
    await runner.runAudit('GCHEAT');
    expect(store.all().map((r) => r.provider)).toEqual(['GCHEAT', 'GA']);
  });
});
