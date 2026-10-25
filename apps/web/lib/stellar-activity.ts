import { Address, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';

export type UsdcTransfer = {
  id: string;
  at: string;
  txHash: string;
  payer: string;
  provider: string;
  amountAtomic: string;
};

type RpcEvent = {
  id: string;
  type: 'contract' | 'system';
  ledger: number;
  ledgerClosedAt: string;
  transactionIndex: number;
  operationIndex: number;
  inSuccessfulContractCall: boolean;
  txHash: string;
  topic: xdr.ScVal[];
  value: xdr.ScVal;
};

export function decodeUsdcTransfers(events: RpcEvent[]): UsdcTransfer[] {
  const transfers: UsdcTransfer[] = [];
  for (const event of events) {
    if (event.type !== 'contract' || !event.inSuccessfulContractCall || event.topic.length !== 3) continue;
    try {
      if (event.topic[0]!.sym().toString() !== 'transfer') continue;
      const payer = Address.fromScVal(event.topic[1]!).toString();
      const provider = Address.fromScVal(event.topic[2]!).toString();
      const amount = scValToNative(event.value);
      if (typeof amount !== 'bigint' || amount <= 0n) continue;
      transfers.push({ id: event.id, at: event.ledgerClosedAt, txHash: event.txHash, payer, provider, amountAtomic: String(amount) });
    } catch {
      // Ignore malformed or unrelated contract events returned by an RPC provider.
    }
  }
  return transfers;
}

export function buildUsdcRecipientFilters(usdcContract: string, marketplaceProviders: string[]) {
  const transferTopic = xdr.ScVal.scvSymbol('transfer').toXDR('base64');
  const topics = [...new Set(marketplaceProviders)].map((provider) => [transferTopic, '*', new Address(provider).toScVal().toXDR('base64')]);
  const filters: { type: 'contract'; contractIds: string[]; topics: string[][] }[] = [];
  for (let index = 0; index < topics.length; index += 5) {
    filters.push({ type: 'contract', contractIds: [usdcContract], topics: topics.slice(index, index + 5) });
  }
  return filters;
}

/** Reads the RPC's retained USDC event window. Events are fetched from chain on each dashboard refresh. */
export async function fetchRecentUsdcTransfers(rpcUrl: string, usdcContract: string, marketplaceProviders: string[]): Promise<UsdcTransfer[]> {
  if (marketplaceProviders.length === 0) return [];
  const server = new rpc.Server(rpcUrl);
  const health = await server.getHealth();
  const events: RpcEvent[] = [];
  // RPC permits at most five topic patterns per filter. Query each group separately
  // so large catalogs also stay within the request's filter-count limit.
  for (const filter of buildUsdcRecipientFilters(usdcContract, marketplaceProviders)) {
    const filters = [filter];
    let response = await server.getEvents({ startLedger: health.oldestLedger, endLedger: health.latestLedger, filters, limit: 100 });
    events.push(...response.events);
    for (let page = 1; response.events.length === 100; page += 1) {
      if (page >= 50) throw new Error('Payment history exceeds the dashboard query limit. An indexer is needed to show complete totals.');
      response = await server.getEvents({ cursor: response.cursor, filters, limit: 100 });
      events.push(...response.events);
    }
  }
  return decodeUsdcTransfers(events);
}
