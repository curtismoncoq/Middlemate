import { contract, Keypair } from '@stellar/stellar-sdk';
import type { Config } from '@tb/config';
import type { EndpointRegistryMethods, Listing } from './types.ts';

export type EndpointChainConfig = Pick<Config, 'rpcUrl' | 'networkPassphrase' | 'listingRegistryContractId'>;
type RawEndpoint = { id: Uint8Array; provider: string; name: string; endpoint: string; claimed_model: string; price: bigint; stake: bigint; active: boolean; exit_at: bigint; retired: boolean };
type Tx<T = unknown> = contract.AssembledTransaction<T>;
type Methods = {
  list_endpoints(): Promise<Tx<RawEndpoint[]>>;
  get_endpoint(args: { id: Uint8Array }): Promise<Tx<RawEndpoint | undefined>>;
  is_endpoint_active(args: { id: Uint8Array }): Promise<Tx<boolean>>;
  register_endpoint(args: { provider: string; id: Uint8Array; name: string; endpoint: string; claimed_model: string; price: bigint; amount: bigint }): Promise<Tx>;
  stake_endpoint(args: { provider: string; id: Uint8Array; amount: bigint }): Promise<Tx>;
  rename_endpoint(args: { provider: string; id: Uint8Array; name: string }): Promise<Tx>;
  request_exit(args: { provider: string; id: Uint8Array }): Promise<Tx>;
  cancel_exit(args: { provider: string; id: Uint8Array }): Promise<Tx>;
  withdraw_endpoint(args: { provider: string; id: Uint8Array }): Promise<Tx>;
  slash_endpoint(args: { caller: string; id: Uint8Array }): Promise<Tx>;
  pause_endpoint(args: { caller: string; id: Uint8Array }): Promise<Tx>;
};

function unwrap<T>(value: unknown): T {
  const v = value as { isErr?: () => boolean; unwrap?: () => T; unwrapErr?: () => { message?: string } };
  if (v && typeof v.isErr === 'function') {
    if (v.isErr()) throw new Error(v.unwrapErr?.().message ?? 'Registry rejected the listing operation');
    return v.unwrap!();
  }
  return value as T;
}

function bytes(id: string) {
  if (!/^[a-f0-9]{64}$/i.test(id)) throw new Error('Invalid listing ID');
  return Buffer.from(id, 'hex');
}
const toListing = (l: RawEndpoint): Listing => ({ id: Buffer.from(l.id).toString('hex'), provider: l.provider, name: l.name, endpoint: l.endpoint, claimedModel: l.claimed_model, priceAtomic: BigInt(l.price), stakeAtomic: BigInt(l.stake), active: l.active, exitAt: Number(l.exit_at), retired: l.retired });

async function client(cfg: EndpointChainConfig, publicKey?: string, secret?: string) {
  if (!cfg.listingRegistryContractId) throw new Error('The multi-listing registry is not configured. Set LISTING_REGISTRY_CONTRACT_ID.');
  return contract.Client.from<Methods>({ contractId: cfg.listingRegistryContractId, rpcUrl: cfg.rpcUrl, networkPassphrase: cfg.networkPassphrase, ...(publicKey ? { publicKey } : {}), ...(secret ? contract.basicNodeSigner(Keypair.fromSecret(secret), cfg.networkPassphrase) : {}) });
}

export type EndpointWalletCall =
  | { method: 'registerEndpoint'; args: { id: string; name: string; endpoint: string; claimedModel: string; priceAtomic: bigint; amountAtomic: bigint } }
  | { method: 'stakeEndpoint'; args: { id: string; amountAtomic: bigint } }
  | { method: 'renameEndpoint'; args: { id: string; name: string } }
  | { method: 'requestExit' | 'cancelExit' | 'withdrawEndpoint'; args: { id: string } };

async function assemble(c: contract.Client & Methods, provider: string, call: EndpointWalletCall): Promise<Tx> {
  const id = bytes(call.args.id);
  switch (call.method) {
    case 'registerEndpoint': return c.register_endpoint({ provider, id, name: call.args.name, endpoint: call.args.endpoint, claimed_model: call.args.claimedModel, price: call.args.priceAtomic, amount: call.args.amountAtomic });
    case 'stakeEndpoint': return c.stake_endpoint({ provider, id, amount: call.args.amountAtomic });
    case 'renameEndpoint': return c.rename_endpoint({ provider, id, name: call.args.name });
    case 'requestExit': return c.request_exit({ provider, id });
    case 'cancelExit': return c.cancel_exit({ provider, id });
    case 'withdrawEndpoint': return c.withdraw_endpoint({ provider, id });
  }
}

export async function buildEndpointTx(cfg: EndpointChainConfig, publicKey: string, call: EndpointWalletCall) {
  const tx = await assemble(await client(cfg, publicKey), publicKey, call);
  unwrap(tx.result);
  return tx.toXDR();
}

export function createEndpointRegistry(cfg: EndpointChainConfig): EndpointRegistryMethods & { listEndpoints(): Promise<Listing[]> } {
  const clients = new Map<string, ReturnType<typeof client>>();
  const get = (secret?: string) => {
    const key = secret ?? 'read';
    if (!clients.has(key)) clients.set(key, client(cfg, secret ? Keypair.fromSecret(secret).publicKey() : undefined, secret));
    return clients.get(key)!;
  };
  async function send(tx: Tx) {
    unwrap(tx.result);
    const sent = await tx.signAndSend();
    return { hash: sent.sendTransactionResponse?.hash ?? '', value: unwrap<bigint>(sent.result) };
  }
  async function owned(secret: string, call: EndpointWalletCall) {
    return send(await assemble(await get(secret), Keypair.fromSecret(secret).publicKey(), call));
  }
  return {
    async listEndpoints() { return cfg.listingRegistryContractId ? ((await (await get()).list_endpoints()).result ?? []).map(toListing) : []; },
    async getEndpoint(id) { const l = (await (await get()).get_endpoint({ id: bytes(id) })).result; return l ? toListing(l) : null; },
    async isEndpointActive(id) { return (await (await get()).is_endpoint_active({ id: bytes(id) })).result; },
    async registerEndpoint(secret, id, l, amountAtomic) { return owned(secret, { method: 'registerEndpoint', args: { ...l, id, amountAtomic } }); },
    async stakeEndpoint(secret, id, amountAtomic) { return owned(secret, { method: 'stakeEndpoint', args: { id, amountAtomic } }); },
    async renameEndpoint(secret, id, name) { return owned(secret, { method: 'renameEndpoint', args: { id, name } }); },
    async requestExit(secret, id) { return owned(secret, { method: 'requestExit', args: { id } }); },
    async cancelExit(secret, id) { return owned(secret, { method: 'cancelExit', args: { id } }); },
    async withdrawEndpoint(secret, id) { const r = await owned(secret, { method: 'withdrawEndpoint', args: { id } }); return { hash: r.hash, refundedAtomic: BigInt(r.value) }; },
    async slashEndpoint(secret, id) { const r = await send(await (await get(secret)).slash_endpoint({ caller: Keypair.fromSecret(secret).publicKey(), id: bytes(id) })); return { hash: r.hash, amountAtomic: BigInt(r.value) }; },
    async pauseEndpoint(secret, id) { return send(await (await get(secret)).pause_endpoint({ caller: Keypair.fromSecret(secret).publicKey(), id: bytes(id) })); },
  };
}
