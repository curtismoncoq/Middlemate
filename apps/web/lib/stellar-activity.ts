import { Address, FeeBumpTransaction, rpc, scValToNative, TransactionBuilder, xdr } from '@stellar/stellar-sdk';

export type UsdcTransfer = {
  id: string;
  at: string;
  txHash: string;
  payer: string;
  provider: string;
  amountAtomic: string;
};

/** x402 settles a direct SAC transfer. Ordinary wallet funding and registry calls are excluded. */
export function isDirectUsdcTransfer(envelope: xdr.TransactionEnvelope | string, networkPassphrase: string, usdcContract: string, transfer: UsdcTransfer): boolean {
  try {
    const parsed = TransactionBuilder.fromXDR(envelope, networkPassphrase);
    const transaction = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed;
    if (transaction.operations.length !== 1) return false;
    const operation = transaction.operations[0];
    if (operation.type !== 'invokeHostFunction' || operation.func.switch().name !== 'hostFunctionTypeInvokeContract') return false;
    const call = operation.func.invokeContract();
    const args = call.args();
    return Address.fromScAddress(call.contractAddress()).toString() === usdcContract && call.functionName().toString() === 'transfer' && args.length === 3
      && Address.fromScVal(args[0]).toString() === transfer.payer && Address.fromScVal(args[1]).toString() === transfer.provider
      && String(scValToNative(args[2])) === transfer.amountAtomic;
  } catch { return false; }
}

const directTransfers = new Map<string, Promise<boolean>>();

export async function filterDirectUsdcTransfers(rpcUrl: string, networkPassphrase: string, usdcContract: string, transfers: UsdcTransfer[]): Promise<UsdcTransfer[]> {
  const server = new rpc.Server(rpcUrl);
  const result: UsdcTransfer[] = [];
  for (let offset = 0; offset < transfers.length; offset += 10) {
    const batch = await Promise.all(transfers.slice(offset, offset + 10).map(async (transfer) => {
      const key = `${rpcUrl}|${usdcContract}|${transfer.txHash}|${transfer.id}`;
      let pending = directTransfers.get(key);
      if (!pending) {
        pending = (async () => {
          const transaction = await server.getTransaction(transfer.txHash);
          if (transaction.status !== 'SUCCESS') throw new Error('A payment transaction is outside the RPC history window.');
          return isDirectUsdcTransfer(transaction.envelopeXdr, networkPassphrase, usdcContract, transfer);
        })();
        directTransfers.set(key, pending);
        pending.catch(() => directTransfers.delete(key));
      }
      return await pending ? transfer : null;
    }));
    result.push(...batch.filter((transfer): transfer is UsdcTransfer => transfer !== null));
  }
  return result;
}

type RpcEvent = {
  id: string;
  type: 'contract' | 'system';
  ledger: number;
  ledgerClosedAt: string;
  transactionIndex: number;
  operationIndex: number;
  inSuccessfulContractCall?: boolean;
  txHash: string;
  topic: xdr.ScVal[];
  value: xdr.ScVal;
};

export function decodeUsdcTransfers(events: RpcEvent[]): UsdcTransfer[] {
  const transfers: UsdcTransfer[] = [];
  for (const event of events) {
    if (event.type !== 'contract' || event.inSuccessfulContractCall === false || ![3, 4].includes(event.topic.length)) continue;
    try {
      if (event.topic[0]!.sym().toString() !== 'transfer') continue;
      const payer = Address.fromScVal(event.topic[1]!).toString();
      const provider = Address.fromScVal(event.topic[2]!).toString();
      const data = scValToNative(event.value);
      const amount = typeof data === 'bigint' ? data : data instanceof Map ? data.get('amount') : data?.amount;
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
  const topics = [...new Set(marketplaceProviders)].flatMap((provider) => {
    const address = new Address(provider).toScVal().toXDR('base64');
    return [[transferTopic, '*', address], [transferTopic, '*', address, '*']];
  });
  const filters: { type: 'contract'; contractIds: string[]; topics: string[][] }[] = [];
  for (let index = 0; index < topics.length; index += 5) {
    filters.push({ type: 'contract', contractIds: [usdcContract], topics: topics.slice(index, index + 5) });
  }
  return filters;
}

type EventFilter = ReturnType<typeof buildUsdcRecipientFilters>[number];

async function scanTransfers(server: rpc.Server, filters: EventFilter[], startLedger: number, endLedger: number) {
  const events: RpcEvent[] = [];
  for (const filter of filters) {
    let cursor: string | undefined;
    let rangeRetries = 0;
    for (let page = 0; ; page += 1) {
      if (page >= 200) throw new Error('Payment history exceeds the dashboard query limit.');
      let response: Awaited<ReturnType<rpc.Server['getEvents']>>;
      try {
        response = await server.getEvents({ ...(cursor ? { cursor } : { startLedger, endLedger }), filters: [filter], limit: 100 });
      } catch (error) {
        // Retention advances between getHealth and getEvents, sometimes by a ledger.
        if (!cursor && /ledger range/i.test(String(error)) && rangeRetries++ < 3) {
          const health = await server.getHealth();
          startLedger = Math.max(startLedger, health.oldestLedger + 1);
          continue;
        }
        throw error;
      }
      events.push(...response.events);
      const next = response.cursor;
      if (!next || !/^\d+-\d+$/.test(next)) throw new Error('Stellar RPC returned no usable history cursor.');
      // RPC caps each scanned ledger range even when it finds zero matching events.
      // A short/empty page is not the end of the retained history.
      if (Number(BigInt(next.split('-')[0]) >> 32n) >= endLedger - 1) break;
      if (next === cursor) throw new Error('Stellar RPC payment history cursor stopped advancing.');
      cursor = next;
    }
  }
  return decodeUsdcTransfers(events);
}

/** Reads incoming payments for existing callers; supports both SAC event shapes. */
export async function fetchRecentUsdcTransfers(rpcUrl: string, usdcContract: string, marketplaceProviders: string[]): Promise<UsdcTransfer[]> {
  if (marketplaceProviders.length === 0) return [];
  const server = new rpc.Server(rpcUrl);
  const health = await server.getHealth();
  return scanTransfers(server, buildUsdcRecipientFilters(usdcContract, marketplaceProviders), health.oldestLedger, health.latestLedger);
}

const walletHistory = new Map<string, { through: number; events: Map<string, UsdcTransfer>; pending?: Promise<UsdcTransfer[]> }>();

/** Index both sides of this wallet, then fetch only new ledgers on later refreshes. */
export async function fetchWalletUsdcTransfers(rpcUrl: string, usdcContract: string, wallet: string): Promise<UsdcTransfer[]> {
  const key = `${rpcUrl}|${usdcContract}|${wallet}`;
  let history = walletHistory.get(key);
  if (!history) {
    history = { through: 0, events: new Map() };
    walletHistory.set(key, history);
  }
  if (history.pending) return history.pending;
  const entry = history;
  entry.pending = (async () => {
    const server = new rpc.Server(rpcUrl);
    const health = await server.getHealth();
    if (entry.through < health.latestLedger - 1) {
      const transfer = xdr.ScVal.scvSymbol('transfer').toXDR('base64');
      const address = new Address(wallet).toScVal().toXDR('base64');
      const filters: EventFilter[] = [{ type: 'contract', contractIds: [usdcContract], topics: [
        [transfer, address, '*'], [transfer, address, '*', '*'],
        [transfer, '*', address], [transfer, '*', address, '*'],
      ] }];
      const transfers = await scanTransfers(server, filters, Math.max(health.oldestLedger, entry.through), health.latestLedger);
      for (const transfer of transfers) entry.events.set(transfer.id, transfer);
      entry.through = health.latestLedger - 1;
    }
    const oldest = Date.now() - 7 * 86_400_000;
    for (const [id, event] of entry.events) if (Date.parse(event.at) < oldest) entry.events.delete(id);
    return [...entry.events.values()];
  })();
  try { return await entry.pending; } finally { entry.pending = undefined; }
}
