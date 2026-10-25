import { contract, Keypair } from '@stellar/stellar-sdk';
import type { Config } from '@tb/config';
import type { Listing, RegistryClient, TxResult } from './types.ts';

type RawListing = { provider: string; name: string; endpoint: string; claimed_model: string; price: bigint; stake: bigint; active: boolean };
type Assembled<T> = contract.AssembledTransaction<T>;
// Methods generated from the on-chain contract spec.
type RegistryMethods = {
  list(): Promise<Assembled<RawListing[]>>;
  get(a: { provider: string }): Promise<Assembled<RawListing | undefined>>;
  is_active(a: { provider: string }): Promise<Assembled<boolean>>;
  register(a: { provider: string; name: string; endpoint: string; claimed_model: string; price: bigint }): Promise<Assembled<unknown>>;
  stake(a: { provider: string; amount: bigint }): Promise<Assembled<unknown>>;
  slash(a: { caller: string; provider: string }): Promise<Assembled<unknown>>;
  pause_listing(a: { caller: string; provider: string }): Promise<Assembled<unknown>>;
};

const toListing = (r: RawListing): Listing => ({
  provider: r.provider,
  name: r.name,
  endpoint: r.endpoint,
  claimedModel: r.claimed_model,
  priceAtomic: BigInt(r.price),
  stakeAtomic: BigInt(r.stake),
  active: r.active,
});

/** Unwraps a contract Result<T, Error>, throwing the contract error name (e.g. "AlreadyRegistered"). */
function unwrap<T>(value: unknown): T {
  const v = value as { isErr?: () => boolean; unwrap?: () => T; unwrapErr?: () => { message: string } };
  if (v && typeof v.isErr === 'function') {
    if (v.isErr()) throw new Error(v.unwrapErr!().message);
    return v.unwrap!();
  }
  return value as T;
}

export function createOnchainRegistry(cfg: Pick<Config, 'rpcUrl' | 'networkPassphrase' | 'registryContractId'>): RegistryClient {
  if (!cfg.registryContractId) throw new Error('REGISTRY_CONTRACT_ID is not set — run scripts/deploy-registry.sh');
  const clients = new Map<string, Promise<contract.Client & RegistryMethods>>();

  const clientFor = (secret?: string) => {
    const key = secret ?? 'read';
    if (!clients.has(key)) {
      const kp = secret ? Keypair.fromSecret(secret) : undefined;
      clients.set(
        key,
        contract.Client.from<RegistryMethods>({
          contractId: cfg.registryContractId!,
          rpcUrl: cfg.rpcUrl,
          networkPassphrase: cfg.networkPassphrase,
          ...(kp ? { publicKey: kp.publicKey(), ...contract.basicNodeSigner(kp, cfg.networkPassphrase) } : {}),
        }),
      );
    }
    return clients.get(key)!;
  };

  async function send<T>(tx: Assembled<unknown>): Promise<TxResult & { value: T }> {
    unwrap(tx.result); // surface contract errors from simulation before signing
    const sent = await tx.signAndSend();
    const hash = sent.sendTransactionResponse?.hash ?? '';
    return { hash, value: unwrap<T>(sent.result) };
  }

  const addr = (secret: string) => Keypair.fromSecret(secret).publicKey();

  return {
    async list() {
      return ((await (await clientFor()).list()).result ?? []).map(toListing);
    },
    async get(provider) {
      const r = (await (await clientFor()).get({ provider })).result;
      return r ? toListing(r) : null;
    },
    async isActive(provider) {
      return (await (await clientFor()).is_active({ provider })).result;
    },
    async register(secret, l) {
      const c = await clientFor(secret);
      const tx = await c.register({ provider: addr(secret), name: l.name, endpoint: l.endpoint, claimed_model: l.claimedModel, price: l.priceAtomic });
      const { hash } = await send(tx);
      return { hash };
    },
    async stake(secret, amountAtomic) {
      if (amountAtomic <= 0n) throw new Error('NonPositiveAmount');
      const tx = await (await clientFor(secret)).stake({ provider: addr(secret), amount: amountAtomic });
      const { hash } = await send(tx);
      return { hash };
    },
    async slash(auditorSecret, provider) {
      const tx = await (await clientFor(auditorSecret)).slash({ caller: addr(auditorSecret), provider });
      const { hash, value } = await send<bigint>(tx);
      return { hash, amountAtomic: BigInt(value) };
    },
    async pauseListing(auditorSecret, provider) {
      const tx = await (await clientFor(auditorSecret)).pause_listing({ caller: addr(auditorSecret), provider });
      const { hash } = await send(tx);
      return { hash };
    },
  };
}
