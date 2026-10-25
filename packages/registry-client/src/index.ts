import path from 'node:path';
import { loadConfig, REPO_ROOT, type Config } from '@tb/config';
import { createOffchainRegistry } from './offchain.ts';
import { createOnchainRegistry } from './onchain.ts';
import type { RegistryClient } from './types.ts';

export * from './types.ts';
export { createOffchainRegistry, createOnchainRegistry };

export const OFFCHAIN_FILE = path.join(REPO_ROOT, 'data/registry.offchain.json');

/** The one way apps talk to the registry; REGISTRY_MODE picks on-chain or off-chain. */
export function createRegistryClient(cfg: Config = loadConfig()): RegistryClient {
  return cfg.registryMode === 'offchain'
    ? createOffchainRegistry(OFFCHAIN_FILE, { auditor: cfg.keys.auditor.public })
    : createOnchainRegistry(cfg);
}
