// Puts the marketplace back in its pre-demo state without redeploying:
//  - if CheapMax is slashed, mint a fresh cheater identity, fund it with the stake from the treasury
//    (where the last slash sent it), register + stake it
//  - reset the agent's spent budget and clear the audit log
// Restart the providers and auditor afterwards so they pick up the new CheapMax key.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { loadConfig, REPO_ROOT, seedListings, endpointFor } from '@tb/config';
import { createRegistryClient, toAtomic } from '@tb/registry-client';

const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
const cfg = loadConfig();
const horizon = new Horizon.Server(cfg.horizonUrl);
const reg = createRegistryClient(cfg);

async function submit(source: Keypair, ops: ReturnType<typeof Operation.payment>[]) {
  const acct = await horizon.loadAccount(source.publicKey());
  const tx = new TransactionBuilder(acct, { fee: '1000', networkPassphrase: Networks.TESTNET }).setTimeout(60);
  ops.forEach((o) => tx.addOperation(o));
  const built = tx.build();
  built.sign(source);
  return (await horizon.submitTransaction(built)).hash;
}

function setEnv(key: string, value: string) {
  const file = path.join(REPO_ROOT, '.env');
  const lines = readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith(`${key}=`));
  writeFileSync(file, [...lines.filter(Boolean), `${key}=${value}`].join('\n') + '\n');
}

const cheap = seedListings(cfg.minimaxModel).find((s) => s.slug === 'cheapmax')!;
const current = await reg.get(cfg.keys.cheapmax.public);

if (current && current.active && current.stakeAtomic > 0n) {
  console.log(`CheapMax ${cfg.keys.cheapmax.public.slice(0, 6)}… is live and staked — nothing to do`);
} else {
  const kp = Keypair.random();
  console.log(`new CheapMax identity ${kp.publicKey()}`);
  execFileSync('curl', ['-s', `https://friendbot.stellar.org/?addr=${kp.publicKey()}`], { stdio: 'ignore' });
  await submit(kp, [Operation.changeTrust({ asset: USDC })]);
  const treasury = Keypair.fromSecret(cfg.keys.treasury.secret);
  const funded = await submit(treasury, [Operation.payment({ destination: kp.publicKey(), asset: USDC, amount: String(cfg.stakeUsdc) })]);
  console.log(`treasury → CheapMax ${cfg.stakeUsdc} USDC  ${funded}`);
  const r1 = await reg.register(kp.secret(), {
    name: cheap.name, endpoint: endpointFor(cfg.providersPort, cheap.slug), claimedModel: cheap.claimedModel, priceAtomic: toAtomic(cheap.priceUsd),
  });
  const r2 = await reg.stake(kp.secret(), toAtomic(cfg.stakeUsdc));
  console.log(`registered ${r1.hash}\nstaked     ${r2.hash}`);
  setEnv('TB_CHEAPMAX_PUBLIC', kp.publicKey());
  setEnv('TB_CHEAPMAX_SECRET', kp.secret());
}

for (const f of ['data/agent-spend.json', 'data/audits.json']) {
  const p = path.join(REPO_ROOT, f);
  if (existsSync(p)) rmSync(p);
}
console.log('agent budget reset to $0.50, audit log cleared');
console.log('→ restart providers and auditor so they use the current CheapMax key');
for (const l of (await reg.list()).filter((l) => l.active && l.stakeAtomic > 0n)) {
  console.log(`  ${l.name.padEnd(12)} ${l.claimedModel.padEnd(13)} $${Number(l.priceAtomic) / 1e7}`);
}
