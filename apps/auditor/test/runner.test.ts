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

function setup(listings: Listing[], answer: (url: string) => string | Error, referenceModels?: string[]) {
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
  const runner = createRunner({ registry, auditorSecret: 'SAUD', pay, references, embed, store, pickProbes: () => probes, referenceModels });
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

  it('skips listings claiming a model with no reference: no paid probes, no slash', async () => {
    const { runner, registry, pay } = setup([listing({ provider: 'GU', name: 'my_endpoint', claimedModel: 'Claude Opus 5.5' })], () => 'll answer', ['MiniMax-M2.7', 'llama3.2:3b', 'qwen2.5:0.5b']);
    const recs = await runner.runAudit();
    expect(recs).toHaveLength(0);
    expect(pay).not.toHaveBeenCalled();
    expect(registry.slash).not.toHaveBeenCalled();
    expect(runner.status().feed.at(-1)?.line).toMatch(/skipped — no reference for Claude Opus 5.5/);
  });

  it('timestamps the record after the delist lands', async () => {
    const { runner, registry } = setup([listing({})], () => 'qq answer');
    let pausedAt = 0;
    registry.pauseListing.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30));
      pausedAt = Date.now();
      return { hash: 'pausetx' };
    });
    const [rec] = await runner.runAudit();
    expect(Date.parse(rec.at)).toBeGreaterThanOrEqual(pausedAt);
  });

  it('audits underpriced claims first (cheapest relative to same-model peers)', async () => {
    const ls = [
      listing({ provider: 'GA', name: 'Provider A', endpoint: 'http://p/a', priceAtomic: 200000n }),
      listing({ provider: 'GB', name: 'Provider B', endpoint: 'http://p/b', claimedModel: 'llama3.2:3b', priceAtomic: 40000n }),
      listing({}),
    ];
    const { runner, pay } = setup(ls, (u) => (u.includes('cheapmax') ? 'qq' : u.endsWith('/b') ? 'll 42 paris' : 'mm 42 paris'));
    await runner.runAudit();
    expect(String(pay.mock.calls[0][0])).toContain('cheapmax');
  });

  it('records the slash and keeps auditing others when pauseListing fails', async () => {
    const ls = [listing({}), listing({ provider: 'GA', name: 'Provider A', endpoint: 'http://p/a', priceAtomic: 200000n })];
    const { runner, registry, store } = setup(ls, (u) => (u.includes('cheapmax') ? 'qq' : 'mm 42 paris'));
    registry.pauseListing.mockRejectedValueOnce(new Error('rpc down'));
    const recs = await runner.runAudit();
    expect(recs.map((r) => r.name).sort()).toEqual(['CheapMax', 'Provider A']);
    const cheat = store.all().find((r) => r.name === 'CheapMax')!;
    expect(cheat.slashTx).toBe('slashtx');
    expect(cheat.error).toMatch(/rpc down/);
  });

  it('pays each probe capped at the listing price with a timeout', async () => {
    const { runner, pay } = setup([listing({})], () => 'qq');
    await runner.runAudit();
    const [, init, opts] = pay.mock.calls[0] as unknown as [string, RequestInit, { maxAmountAtomic: bigint }];
    expect(opts.maxAmountAtomic).toBe(120000n);
    expect(init.signal).toBeDefined();
  });

  it('reports live status: which listing, probe progress and a feed of probe lines', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { runner, pay } = setup([listing({})], () => 'qq answer');
    const inner = pay.getMockImplementation()!;
    let n = 0;
    pay.mockImplementation(async (...a: Parameters<typeof inner>) => {
      if (++n === 3) await gate; // pause on the third probe
      return inner(...a);
    });
    expect(runner.status().running).toBe(false);
    const done = runner.runAudit();
    await vi.waitFor(() => expect(runner.status().current?.probe).toBe(2));
    const s = runner.status();
    expect(s.running).toBe(true);
    expect(s.current).toMatchObject({ provider: 'GCHEAT', name: 'CheapMax', total: 6 });
    expect(s.feed.at(-1)?.line).toMatch(/closest qwen2.5:0.5b|wrong|correct/);
    release();
    await done;
    expect(runner.status()).toMatchObject({ running: false, current: null });
    expect(runner.status().feed.some((f) => /FAIL/.test(f.line))).toBe(true);
  });

  it('records what the audit spent on paid probes', async () => {
    const { runner } = setup([listing({})], () => 'qq answer');
    const [rec] = await runner.runAudit();
    expect(rec.spentAtomic).toBe(String(6n * 120000n));
  });

  it('memoryStore.clear empties the log', () => {
    const st = memoryStore();
    st.add({ id: '1' } as never);
    st.clear();
    expect(st.all()).toEqual([]);
  });
});
