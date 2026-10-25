import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROLES = ['admin', 'auditor', 'treasury', 'providerA', 'providerB', 'cheapmax', 'agent', 'weatherAtlas', 'weatherThermo', 'weatherRainwind'] as const;
export type Role = (typeof ROLES)[number];
export type KeyPair = { public: string; secret: string };

export type Config = {
  network: 'stellar:testnet';
  networkPassphrase: string;
  rpcUrl: string;
  horizonUrl: string;
  facilitatorUrl: string;
  usdcContract: string;
  registryMode: 'onchain' | 'offchain';
  paymentsMode: 'real' | 'simulated';
  registryContractId?: string;
  listingRegistryContractId?: string;
  keys: Record<Role, KeyPair>;
  minimaxApiKey?: string;
  minimaxBaseUrl: string;
  minimaxModel: string;
  ollamaUrl: string;
  stakeUsdc: number;
  providersPort: number;
  auditorPort: number;
  webPort: number;
  supabaseUrl?: string;
  supabaseSecretKey?: string;
  communityNamespace: string;
  moderatorWallets: string[];
  moderationResponseSeconds: number;
};

// TB_REPO_ROOT lets bundlers (Next.js) that relocate this file still find the repo.
export const REPO_ROOT = process.env.TB_REPO_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const envName = (role: Role) => role.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase();

function oneOf<T extends string>(name: string, value: string | undefined, allowed: readonly T[], dflt: T): T {
  const v = (value ?? dflt) as T;
  if (!allowed.includes(v)) throw new Error(`${name} must be one of ${allowed.join(', ')} (got "${value}")`);
  return v;
}

function keysFrom(env: Record<string, string | undefined>): Record<Role, KeyPair> {
  const keys = {} as Record<Role, KeyPair>;
  for (const role of ROLES) {
    const prefix = `TB_${envName(role)}`;
    keys[role] = {
      get public() {
        const v = env[`${prefix}_PUBLIC`];
        if (!v) throw new Error(`${prefix}_PUBLIC is not set — run scripts/setup-keys.sh`);
        return v;
      },
      get secret() {
        const v = env[`${prefix}_SECRET`];
        if (!v) throw new Error(`${prefix}_SECRET is not set — run scripts/setup-keys.sh`);
        return v;
      },
    };
  }
  return keys;
}

export function loadConfig(env: Record<string, string | undefined> = defaultEnv()): Config {
  return {
    network: 'stellar:testnet',
    networkPassphrase: 'Test SDF Network ; September 2015',
    rpcUrl: env.RPC_URL ?? 'https://soroban-testnet.stellar.org',
    horizonUrl: env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org',
    facilitatorUrl: env.FACILITATOR_URL ?? 'https://channels.openzeppelin.com/x402/testnet',
    usdcContract: env.USDC_CONTRACT ?? 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
    registryMode: oneOf('REGISTRY_MODE', env.REGISTRY_MODE, ['onchain', 'offchain'] as const, 'onchain'),
    paymentsMode: oneOf('PAYMENTS_MODE', env.PAYMENTS_MODE, ['real', 'simulated'] as const, 'real'),
    registryContractId: env.REGISTRY_CONTRACT_ID || undefined,
    listingRegistryContractId: env.LISTING_REGISTRY_CONTRACT_ID || undefined,
    keys: keysFrom(env),
    minimaxApiKey: env.MINIMAX_API_KEY || undefined,
    minimaxBaseUrl: env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1',
    minimaxModel: env.MINIMAX_MODEL ?? 'MiniMax-M2.7',
    ollamaUrl: env.OLLAMA_URL ?? 'http://localhost:11434',
    stakeUsdc: Number(env.STAKE_USDC ?? 5),
    providersPort: Number(env.PROVIDERS_PORT ?? 4001),
    auditorPort: Number(env.AUDITOR_PORT ?? 4002),
    webPort: Number(env.WEB_PORT ?? 3000),
    supabaseUrl: env.SUPABASE_URL || undefined,
    supabaseSecretKey: env.SUPABASE_SECRET_KEY || undefined,
    communityNamespace: env.COMMUNITY_NAMESPACE ?? `stellar-testnet:${env.LISTING_REGISTRY_CONTRACT_ID ?? env.REGISTRY_CONTRACT_ID ?? 'development'}`,
    moderatorWallets: (env.MODERATOR_WALLETS || [env.TB_ADMIN_PUBLIC, env.TB_AUDITOR_PUBLIC].filter(Boolean).join(',')).split(',').map((wallet) => wallet.trim()).filter(Boolean),
    moderationResponseSeconds: Number(env.MODERATION_RESPONSE_SECONDS ?? 86400),
  };
}

let loaded = false;
function defaultEnv() {
  if (!loaded) {
    loadDotenv({ path: path.join(REPO_ROOT, '.env'), quiet: true });
    loaded = true;
  }
  return process.env;
}

export * from './listings.ts';
export * from './models.ts';
