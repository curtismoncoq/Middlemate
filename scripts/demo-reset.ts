// Resets the marketplace to the start of the demo:
//  1. the admin unregisters every listing (remaining stakes are refunded to their providers)
//  2. Provider A (honest MiniMax) is registered and staked, topped up from the agent wallet if short
//  3. the auditor audits Provider A once, so the video opens with a green, scored listing
//  4. the agent's spent budget and the audit log are cleared
// The good and malicious listings are then added live from the web form.
// Run with the auditor up (pnpm dev); pass --no-audit to skip step 3.
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { loadConfig, REPO_ROOT, seedListings, endpointFor } from '@tb/config';
import { createRegistryClient, toAtomic } from '@tb/registry-client';

const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
const cfg = loadConfig();
const horizon = new Horizon.Server(cfg.horizonUrl);
const reg = createRegistryClient(cfg);

async function usdcBalance(address: string) {
  const acct = await horizon.loadAccount(address);
  const b = acct.balances.find((x) => 'asset_code' in x && x.asset_code === 'USDC' && x.asset_issuer === USDC.issuer);
  return b ? Number(b.balance) : 0;
}

async function pay(from: Keypair, to: string, amount: number) {
  const acct = await horizon.loadAccount(from.publicKey());
  const tx = new TransactionBuilder(acct, { fee: '1000', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: to, asset: USDC, amount: amount.toFixed(7) }))
    .setTimeout(60)
    .build();
  tx.sign(from);
  return (await horizon.submitTransaction(tx)).hash;
}

// 1. clear the registry
for (const l of await reg.list()) {
  const r = await reg.unregister(cfg.keys.admin.secret, l.provider);
  console.log(`unregistered ${l.name.padEnd(12)} refunded ${Number(r.refundedAtomic) / 1e7} USDC  ${r.hash}`);
}

// 2. seed Provider A
const a = seedListings(cfg.minimaxModel).find((s) => s.slug === 'minimax-a')!;
const key = cfg.keys[a.role];
const short = cfg.stakeUsdc + 0.5 - (await usdcBalance(key.public));
if (short > 0) {
  const hash = await pay(Keypair.fromSecret(cfg.keys.agent.secret), key.public, short);
  console.log(`agent → ${a.name} ${short.toFixed(2)} USDC (stake top-up)  ${hash}`);
}
await reg.register(key.secret, { name: a.name, endpoint: endpointFor(cfg.providersPort, a.slug), claimedModel: a.claimedModel, priceAtomic: toAtomic(a.priceUsd) });
const staked = await reg.stake(key.secret, toAtomic(cfg.stakeUsdc));
console.log(`registered + staked ${a.name} (${cfg.stakeUsdc} USDC)  ${staked.hash}`);

// 4. clear local demo state (before the audit, so A's audit is the first record)
for (const f of ['data/agent-spend.json', 'data/audits.json']) {
  const p = path.join(REPO_ROOT, f);
  if (existsSync(p)) rmSync(p);
}
await fetch(`http://localhost:${cfg.auditorPort}/audits`, { method: 'DELETE' }).catch(() => {}); // running auditor keeps the log in memory
console.log('agent budget reset to $0.50, audit log cleared');

// 3. audit Provider A
if (!process.argv.includes('--no-audit')) {
  const url = `http://localhost:${cfg.auditorPort}/audit/run?wait=1`;
  console.log(`auditing ${a.name} (about a minute)…`);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: key.public }) });
    const [rec] = (await r.json()) as { verdict: { score: number; pass: boolean } }[];
    console.log(rec ? `${a.name}: trust ${rec.verdict.score} ${rec.verdict.pass ? 'PASS' : 'FAIL'}` : 'no audit record returned');
  } catch {
    console.log('auditor not reachable — restart `pnpm dev` (the audit log was cleared), then run `pnpm demo:reset` again or audit from the UI');
  }
}
