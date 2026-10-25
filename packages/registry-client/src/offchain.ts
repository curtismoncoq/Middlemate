import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Keypair } from '@stellar/stellar-sdk';
import type { Listing, RegistryClient, MarketplaceRegistryClient } from './types.ts';

type Stored = Omit<Listing, 'priceAtomic' | 'stakeAtomic'> & { priceAtomic: string; stakeAtomic: string };
type Db = { seq: number; listings: Stored[]; endpoints?: Stored[] };

/** JSON-file registry with the same rules as the Soroban contract (REGISTRY_MODE=offchain). */
export function createOffchainRegistry(file: string, roles: { auditor: string; admin?: string }): MarketplaceRegistryClient {
  const read = (): Db => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { seq: 0, listings: [] });
  const write = (db: Db) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(db, null, 2));
  };
  const toListing = (s: Stored): Listing => ({ ...s, priceAtomic: BigInt(s.priceAtomic), stakeAtomic: BigInt(s.stakeAtomic) });
  const tx = (db: Db) => ({ hash: `offchain-${++db.seq}` });
  const find = (db: Db, provider: string) => {
    const l = db.listings.find((x) => x.provider === provider);
    if (!l) throw new Error('NotRegistered');
    return l;
  };
  const asAuditor = (secret: string) => {
    if (Keypair.fromSecret(secret).publicKey() !== roles.auditor) throw new Error('caller lacks the auditor role');
  };

  const legacy: RegistryClient = {
    async list() {
      return read().listings.map(toListing);
    },
    async get(provider) {
      const l = read().listings.find((x) => x.provider === provider);
      return l ? toListing(l) : null;
    },
    async isActive(provider) {
      const l = await this.get(provider);
      return !!l && l.active && l.stakeAtomic > 0n;
    },
    async register(secret, l) {
      const db = read();
      const provider = Keypair.fromSecret(secret).publicKey();
      if (db.listings.some((x) => x.provider === provider)) throw new Error('AlreadyRegistered');
      if (l.priceAtomic <= 0n) throw new Error('NonPositiveAmount');
      db.listings.push({ ...l, provider, priceAtomic: String(l.priceAtomic), stakeAtomic: '0', active: true });
      const r = tx(db);
      write(db);
      return r;
    },
    async stake(secret, amount) {
      if (amount <= 0n) throw new Error('NonPositiveAmount');
      const db = read();
      const l = find(db, Keypair.fromSecret(secret).publicKey());
      l.stakeAtomic = String(BigInt(l.stakeAtomic) + amount);
      const r = tx(db);
      write(db);
      return r;
    },
    async slash(auditorSecret, provider) {
      asAuditor(auditorSecret);
      const db = read();
      const l = find(db, provider);
      const amountAtomic = BigInt(l.stakeAtomic);
      l.stakeAtomic = '0';
      const r = tx(db);
      write(db);
      return { ...r, amountAtomic };
    },
    async unregister(secret, provider) {
      const caller = Keypair.fromSecret(secret).publicKey();
      const db = read();
      const l = find(db, provider);
      if (caller !== provider && caller !== roles.admin) throw new Error('Unauthorized');
      db.listings = db.listings.filter((x) => x.provider !== provider);
      const r = tx(db);
      write(db);
      return { ...r, refundedAtomic: BigInt(l.stakeAtomic) };
    },
    async pauseListing(auditorSecret, provider) {
      asAuditor(auditorSecret);
      const db = read();
      find(db, provider).active = false;
      const r = tx(db);
      write(db);
      return r;
    },
  };
  const endpoint = (db: Db, id: string) => {
    const l = db.endpoints?.find((item) => item.id === id);
    if (!l) throw new Error('NotRegistered');
    return l;
  };
  const owned = (db: Db, secret: string, id: string) => {
    const l = endpoint(db, id);
    if (l.provider !== Keypair.fromSecret(secret).publicKey()) throw new Error('Unauthorized');
    if (l.retired) throw new Error('Retired');
    return l;
  };
  const view = (l: Stored): Listing => ({ ...toListing(l), active: l.active && !l.retired && BigInt(l.stakeAtomic) > 0n && (!l.exitAt || Date.now() / 1000 < l.exitAt) });
  const mutate = (secret: string, id: string, edit: (l: Stored) => void) => {
    const db = read();
    edit(owned(db, secret, id));
    const result = tx(db); write(db); return result;
  };
  return {
    ...legacy,
    async list() { const db = read(); return [...db.listings.map(toListing), ...(db.endpoints ?? []).map(view)]; },
    async getEndpoint(id) { const l = read().endpoints?.find((item) => item.id === id); return l ? view(l) : null; },
    async isEndpointActive(id) { const l = await this.getEndpoint(id); return !!l?.active; },
    async registerEndpoint(secret, id, l, amount) {
      if (!/^[a-f0-9]{64}$/i.test(id)) throw new Error('Invalid listing ID');
      const db = read(); db.endpoints ??= [];
      if (db.endpoints.some((item) => item.id === id)) throw new Error('AlreadyRegistered');
      if (amount <= 0n || l.priceAtomic <= 0n) throw new Error('NonPositiveAmount');
      if (!l.name.trim() || !l.endpoint || !l.claimedModel) throw new Error('InvalidMetadata');
      db.endpoints.push({ ...l, id, provider: Keypair.fromSecret(secret).publicKey(), priceAtomic: String(l.priceAtomic), stakeAtomic: String(amount), active: true, exitAt: 0, retired: false });
      const result = tx(db); write(db); return result;
    },
    async stakeEndpoint(secret, id, amount) {
      return mutate(secret, id, (l) => {
        if (amount <= 0n) throw new Error('NonPositiveAmount');
        if (l.exitAt) throw new Error('ExitPending');
        l.stakeAtomic = String(BigInt(l.stakeAtomic) + amount);
      });
    },
    async renameEndpoint(secret, id, name) {
      if (!name.trim()) throw new Error('InvalidMetadata');
      return mutate(secret, id, (l) => { l.name = name.trim(); });
    },
    async requestExit(secret, id) {
      return mutate(secret, id, (l) => { if (l.exitAt) throw new Error('ExitPending'); l.exitAt = Math.floor(Date.now() / 1000) + 10; });
    },
    async cancelExit(secret, id) {
      return mutate(secret, id, (l) => {
        if (!l.exitAt) throw new Error('ExitNotRequested');
        if (Date.now() / 1000 >= l.exitAt) throw new Error('ExitExpired');
        l.exitAt = 0;
      });
    },
    async withdrawEndpoint(secret, id) {
      let refundedAtomic = 0n;
      const result = mutate(secret, id, (l) => {
        if (!l.exitAt) throw new Error('ExitNotRequested');
        if (Date.now() / 1000 < l.exitAt) throw new Error('CooldownPending');
        refundedAtomic = BigInt(l.stakeAtomic); l.stakeAtomic = '0'; l.active = false; l.retired = true;
      });
      return { ...result, refundedAtomic };
    },
    async slashEndpoint(secret, id) {
      asAuditor(secret); const db = read(); const l = endpoint(db, id);
      const amountAtomic = BigInt(l.stakeAtomic); l.stakeAtomic = '0';
      const result = tx(db); write(db); return { ...result, amountAtomic };
    },
    async pauseEndpoint(secret, id) {
      asAuditor(secret); const db = read(); endpoint(db, id).active = false;
      const result = tx(db); write(db); return result;
    },
  };
}
