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

/** Reads the RPC's retained USDC event window. Events are fetched from chain on each dashboard refresh. */
export async function fetchRecentUsdcTransfers(rpcUrl: string, usdcContract: string, marketplaceProviders: string[]): Promise<UsdcTransfer[]> {
  if (marketplaceProviders.length === 0) return [];
  const server = new rpc.Server(rpcUrl);
  const health = await server.getHealth();
  const transferTopic = xdr.ScVal.scvSymbol('transfer').toXDR('base64');
  const recipientTopics = marketplaceProviders.map((provider) => [transferTopic, '*', new Address(provider).toScVal().toXDR('base64')]);
  const filters = [{ type: 'contract' as const, contractIds: [usdcContract], topics: recipientTopics }];
  let response = await server.getEvents({ startLedger: health.oldestLedger, endLedger: health.latestLedger, filters, limit: 100 });
  const events = [...response.events];
  // Cursor pagination handles busy ledgers while the cap bounds RPC work for the dashboard request.
  for (let page = 1; response.events.length === 100 && page < 50; page += 1) {
    const cursor = response.cursor;
    response = await server.getEvents({ cursor, filters, limit: 100 });
    if (!response.events.length) break;
    events.push(...response.events);
  }
  return decodeUsdcTransfers(events);
}
