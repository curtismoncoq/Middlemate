import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Keypair } from '@stellar/stellar-sdk';
import type { Listing, RegistryClient } from './types.ts';

type Stored = Omit<Listing, 'priceAtomic' | 'stakeAtomic'> & { priceAtomic: string; stakeAtomic: string };
type Db = { seq: number; listings: Stored[] };

/** JSON-file registry with the same rules as the Soroban contract (REGISTRY_MODE=offchain). */
export function createOffchainRegistry(file: string, roles: { auditor: string }): RegistryClient {
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

  return {
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
    async pauseListing(auditorSecret, provider) {
      asAuditor(auditorSecret);
      const db = read();
      find(db, provider).active = false;
      const r = tx(db);
      write(db);
      return r;
    },
  };
}
