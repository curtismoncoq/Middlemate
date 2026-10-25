import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Keypair } from '@stellar/stellar-sdk';
import { createOffchainRegistry } from '../src/offchain.ts';
import type { RegistryClient, NewListing } from '../src/types.ts';

const TEN = 10_0000000n;
const auditor = Keypair.random();
const listing = (name: string): NewListing => ({ name, endpoint: 'http://x', claimedModel: 'MiniMax-M2.7', priceAtomic: 120000n });

let reg: RegistryClient;
beforeEach(() => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'tb-')), 'registry.json');
  reg = createOffchainRegistry(file, { auditor: auditor.publicKey() });
});

describe('offchain registry', () => {
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
});
