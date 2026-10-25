import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { StrKey } from '@stellar/stellar-sdk';
import { loadConfig, REPO_ROOT } from '@tb/config';
import { createRegistryClient } from '@tb/registry-client';

const cfg = loadConfig();
if (cfg.listingRegistryContractId) {
  if (!process.argv.includes('--redeploy')) throw new Error('A multi-listing registry is already configured. Use --redeploy only after all stakes have been withdrawn.');
  if ((await createRegistryClient(cfg).list()).some((l) => l.id && l.stakeAtomic > 0n)) throw new Error('Withdraw every per-listing stake before redeploying.');
}
execFileSync('stellar', ['contract', 'build', '--package', 'registry', '-q'], { cwd: REPO_ROOT, stdio: 'inherit' });
// The CLI reads its signer from the child environment; no secret appears in argv or output.
const id = execFileSync('stellar', ['contract', 'deploy', '--network', 'testnet', '--wasm', path.join(REPO_ROOT, 'target/wasm32v1-none/release/registry.wasm'), '--', '--admin', cfg.keys.admin.public, '--auditor', cfg.keys.auditor.public, '--token', cfg.usdcContract, '--treasury', cfg.keys.treasury.public], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, STELLAR_ACCOUNT: cfg.keys.admin.secret } }).trim();
if (!StrKey.isValidContract(id)) throw new Error('Deployment did not return a contract address; local configuration was not changed.');
const envFile = path.join(REPO_ROOT, '.env');
const env = readFileSync(envFile, 'utf8');
writeFileSync(envFile, /^LISTING_REGISTRY_CONTRACT_ID=/m.test(env) ? env.replace(/^LISTING_REGISTRY_CONTRACT_ID=.*$/m, `LISTING_REGISTRY_CONTRACT_ID=${id}`) : `${env.trimEnd()}\nLISTING_REGISTRY_CONTRACT_ID=${id}\n`, { mode: 0o600 });
console.log(`Additional listing registry deployed: ${id}`);
console.log('The existing REGISTRY_CONTRACT_ID and its stakes were preserved. Restart pnpm demo:weather to load the additional registry.');
