// Registers and stakes the three seed listings (idempotent: skips registered, tops stake up to STAKE_USDC).
import { loadConfig, seedListings, endpointFor } from '@tb/config';
import { createRegistryClient, toAtomic } from '@tb/registry-client';

const cfg = loadConfig();
const reg = createRegistryClient(cfg);
const target = toAtomic(cfg.stakeUsdc);
console.log(`registry mode: ${cfg.registryMode} ${cfg.registryContractId ?? ''}`);

for (const s of seedListings(cfg.minimaxModel)) {
  const key = cfg.keys[s.role];
  const existing = await reg.get(key.public);
  if (!existing) {
    const r = await reg.register(key.secret, {
      name: s.name, endpoint: endpointFor(cfg.providersPort, s.slug), claimedModel: s.claimedModel, priceAtomic: toAtomic(s.priceUsd),
    });
    console.log(`${s.name}: registered ${r.hash}`);
  }
  const have = existing?.stakeAtomic ?? 0n;
  if (have < target) {
    const r = await reg.stake(key.secret, target - have);
    console.log(`${s.name}: staked ${Number(target - have) / 1e7} USDC ${r.hash}`);
  }
}
for (const l of await reg.list()) {
  console.log(`${l.name.padEnd(11)} ${l.claimedModel.padEnd(13)} $${Number(l.priceAtomic) / 1e7}  stake ${Number(l.stakeAtomic) / 1e7}  active=${l.active}`);
}
