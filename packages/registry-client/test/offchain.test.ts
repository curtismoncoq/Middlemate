import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Keypair } from '@stellar/stellar-sdk';
import { createOffchainRegistry } from '../src/offchain.ts';
import type { NewListing, MarketplaceRegistryClient } from '../src/types.ts';

const TEN = 10_0000000n;
const auditor = Keypair.random();
const admin = Keypair.random();
const listing = (name: string): NewListing => ({ name, endpoint: 'http://x', claimedModel: 'MiniMax-M2.7', priceAtomic: 120000n });

let reg: MarketplaceRegistryClient;
beforeEach(() => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'tb-')), 'registry.json');
  reg = createOffchainRegistry(file, { auditor: auditor.publicKey(), admin: admin.publicKey() });
});

describe('offchain registry', () => {
  it('supports multiple independently owned listings and cooldown refunds', async () => {
    const p = Keypair.random(), stranger = Keypair.random();
    const a = '01'.repeat(32), b = '02'.repeat(32);
    await reg.registerEndpoint(p.secret(), a, listing('Mat temperature'), TEN);
    await reg.registerEndpoint(p.secret(), b, listing('Mat rain'), TEN * 2n);
    expect((await reg.list()).map((l) => l.name)).toEqual(['Mat temperature', 'Mat rain']);
    await expect(reg.requestExit(stranger.secret(), a)).rejects.toThrow('Unauthorized');
    vi.useFakeTimers();
    try {
      await reg.requestExit(p.secret(), a);
      await expect(reg.withdrawEndpoint(p.secret(), a)).rejects.toThrow('CooldownPending');
      await reg.slashEndpoint(auditor.secret(), a);
      vi.advanceTimersByTime(10_000);
      expect(await reg.isEndpointActive(a)).toBe(false);
      expect((await reg.withdrawEndpoint(p.secret(), a)).refundedAtomic).toBe(0n);
      expect((await reg.getEndpoint(b))?.stakeAtomic).toBe(TEN * 2n);
      await expect(reg.withdrawEndpoint(p.secret(), a)).rejects.toThrow('Retired');
    } finally { vi.useRealTimers(); }
  });
  it('register then stake is active', async () => {
    const p = Keypair.random();
    await reg.register(p.secret(), listing('A'));
    expect(await reg.isActive(p.publicKey())).toBe(false);
    await reg.stake(p.secret(), TEN);
    expect(await reg.isActive(p.publicKey())).toBe(true);
    expect((await reg.get(p.publicKey()))?.stakeAtomic).toBe(TEN);
  });

  it('register twice fails', async () => {
    const p = Keypair.random();
    await reg.register(p.secret(), listing('A'));
    await expect(reg.register(p.secret(), listing('A'))).rejects.toThrow('AlreadyRegistered');
  });

  it('stake zero fails', async () => {
    const p = Keypair.random();
    await reg.register(p.secret(), listing('A'));
    await expect(reg.stake(p.secret(), 0n)).rejects.toThrow('NonPositiveAmount');
  });

  it('stake unregistered fails', async () => {
    await expect(reg.stake(Keypair.random().secret(), TEN)).rejects.toThrow('NotRegistered');
  });

  it('slash takes full stake and returns the amount', async () => {
    const p = Keypair.random();
    await reg.register(p.secret(), listing('CheapMax'));
    await reg.stake(p.secret(), TEN);
    const r = await reg.slash(auditor.secret(), p.publicKey());
    expect(r.amountAtomic).toBe(TEN);
    expect(r.hash).toMatch(/^offchain-/);
    expect((await reg.get(p.publicKey()))?.stakeAtomic).toBe(0n);
    expect(await reg.isActive(p.publicKey())).toBe(false);
  });

  it('slash twice returns zero', async () => {
    const p = Keypair.random();
    await reg.register(p.secret(), listing('CheapMax'));
    await reg.stake(p.secret(), TEN);
    await reg.slash(auditor.secret(), p.publicKey());
    expect((await reg.slash(auditor.secret(), p.publicKey())).amountAtomic).toBe(0n);
  });

  it('non-auditor cannot slash', async () => {
    const p = Keypair.random();
    await reg.register(p.secret(), listing('CheapMax'));
    await reg.stake(p.secret(), TEN);
    await expect(reg.slash(Keypair.random().secret(), p.publicKey())).rejects.toThrow(/auditor/);
  });

  it('pause listing hides it but list keeps it', async () => {
    const p = Keypair.random();
    await reg.register(p.secret(), listing('A'));
    await reg.stake(p.secret(), TEN);
    await reg.pauseListing(auditor.secret(), p.publicKey());
    expect(await reg.isActive(p.publicKey())).toBe(false);
    const all = await reg.list();
    expect(all).toHaveLength(1);
    expect(all[0].active).toBe(false);
  });

  it('list returns all in register order', async () => {
    const a = Keypair.random(), b = Keypair.random();
    await reg.register(a.secret(), listing('A'));
    await reg.register(b.secret(), listing('B'));
    expect((await reg.list()).map((l) => l.name)).toEqual(['A', 'B']);
  });

  it('provider can unregister: listing removed and remaining stake refunded', async () => {
    const p = Keypair.random();
    await reg.register(p.secret(), listing('A'));
    await reg.stake(p.secret(), TEN);
    const r = await reg.unregister(p.secret(), p.publicKey());
    expect(r.refundedAtomic).toBe(TEN);
    expect(await reg.get(p.publicKey())).toBeNull();
    expect(await reg.list()).toHaveLength(0);
  });

  it('admin can unregister any listing; strangers cannot', async () => {
    const p = Keypair.random();
    await reg.register(p.secret(), listing('A'));
    await expect(reg.unregister(Keypair.random().secret(), p.publicKey())).rejects.toThrow('Unauthorized');
    await reg.unregister(admin.secret(), p.publicKey());
    expect(await reg.list()).toHaveLength(0);
  });

  it('unregister after a slash refunds nothing', async () => {
    const p = Keypair.random();
    await reg.register(p.secret(), listing('CheapMax'));
    await reg.stake(p.secret(), TEN);
    await reg.slash(auditor.secret(), p.publicKey());
    expect((await reg.unregister(p.secret(), p.publicKey())).refundedAtomic).toBe(0n);
  });
});
