import { Account, Address, Asset, Contract, Keypair, nativeToScVal, Networks, Operation, rpc, StrKey, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildUsdcRecipientFilters, decodeUsdcTransfers, fetchWalletUsdcTransfers, isDirectUsdcTransfer } from '../lib/stellar-activity.ts';

afterEach(() => vi.restoreAllMocks());

const sender = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const recipient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();

it('counts direct SAC payments but excludes ordinary wallet funding', () => {
  const token = StrKey.encodeContract(Buffer.alloc(32, 3));
  const transfer = { id: 'receipt', at: '2026-10-25T21:00:00Z', txHash: 'tx', payer: sender, provider: recipient, amountAtomic: '50000' };
  const build = (operation: ReturnType<typeof Operation.payment>) => new TransactionBuilder(new Account(sender, '1'), { fee: '100', networkPassphrase: Networks.TESTNET }).addOperation(operation).setTimeout(30).build();
  const payment = build(new Contract(token).call('transfer', new Address(sender).toScVal(), new Address(recipient).toScVal(), nativeToScVal(50000n, { type: 'i128' })));
  const funding = build(Operation.payment({ destination: recipient, asset: Asset.native(), amount: '10' }));
  expect(isDirectUsdcTransfer(payment.toXDR(), Networks.TESTNET, token, transfer)).toBe(true);
  expect(isDirectUsdcTransfer(funding.toXDR(), Networks.TESTNET, token, transfer)).toBe(false);
  expect(isDirectUsdcTransfer(payment.toXDR(), Networks.TESTNET, token, { ...transfer, amountAtomic: '60000' })).toBe(false);
});

describe('USDC RPC event filters', () => {
  it('keeps no more than five recipient topics in each filter', () => {
    const providers = Array.from({ length: 12 }, (_, index) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, index + 10)).publicKey());
    const filters = buildUsdcRecipientFilters('USDC', providers);
    expect(filters).toHaveLength(5);
    expect(filters.every((filter) => filter.topics.length <= 5)).toBe(true);
    expect(filters.flatMap((filter) => filter.topics)).toHaveLength(providers.length * 2);
  });

  it('returns no filters for an empty provider set', () => {
    expect(buildUsdcRecipientFilters('USDC', [])).toEqual([]);
  });
});

describe('decodeUsdcTransfers', () => {
  it('decodes successful SAC transfer events with exact atomic amounts', () => {
    const event = {
      id: 'evt-1', type: 'contract' as const, ledger: 123, ledgerClosedAt: '2026-10-25T10:00:00Z',
      transactionIndex: 0, operationIndex: 1, inSuccessfulContractCall: true, txHash: 'hash-1',
      topic: [xdr.ScVal.scvSymbol('transfer'), new Address(sender).toScVal(), new Address(recipient).toScVal()],
      value: nativeToScVal(1_250_000n, { type: 'i128' }),
    };
    expect(decodeUsdcTransfers([event])).toEqual([{
      id: 'evt-1', at: '2026-10-25T10:00:00Z', txHash: 'hash-1', payer: sender, provider: recipient, amountAtomic: '1250000',
    }]);
  });

  it('ignores failed calls and non-transfer events', () => {
    const base = {
      id: 'evt-2', type: 'contract' as const, ledger: 123, ledgerClosedAt: '2026-10-25T10:00:00Z',
      transactionIndex: 0, operationIndex: 1, inSuccessfulContractCall: true, txHash: 'hash-2',
      topic: [xdr.ScVal.scvSymbol('transfer'), new Address(sender).toScVal(), new Address(recipient).toScVal()],
      value: nativeToScVal(1n, { type: 'i128' }),
    };
    expect(decodeUsdcTransfers([{ ...base, inSuccessfulContractCall: false }, { ...base, id: 'evt-3', topic: [xdr.ScVal.scvSymbol('mint')] }])).toEqual([]);
  });

  it('reads current SAC events with an asset topic, omitted success flag and map amounts', () => {
    const event = {
      id: 'current', type: 'contract' as const, ledger: 123, ledgerClosedAt: '2026-10-25T10:00:00Z',
      transactionIndex: 0, operationIndex: 1, txHash: 'current-tx',
      topic: [xdr.ScVal.scvSymbol('transfer'), new Address(sender).toScVal(), new Address(recipient).toScVal(), xdr.ScVal.scvString('USDC:ISSUER')],
      value: xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('amount'), val: nativeToScVal(50_000n, { type: 'i128' }) })]),
    };
    expect(decodeUsdcTransfers([event])).toEqual([expect.objectContaining({ payer: sender, provider: recipient, amountAtomic: '50000' })]);
  });
});

it('continues over empty RPC scan pages and queries both spending and earnings', async () => {
  vi.spyOn(rpc.Server.prototype, 'getHealth').mockResolvedValue({ status: 'healthy', oldestLedger: 10, latestLedger: 30 } as never);
  const cursor = (ledger: number) => `${BigInt(ledger) << 32n}-4294967295`;
  const getEvents = vi.spyOn(rpc.Server.prototype, 'getEvents')
    .mockResolvedValueOnce({ events: [], cursor: cursor(19) } as never)
    .mockResolvedValueOnce({ events: [{
      id: 'found-after-empty-page', type: 'contract', ledger: 25, ledgerClosedAt: new Date().toISOString(), txHash: 'tx',
      topic: [xdr.ScVal.scvSymbol('transfer'), new Address(sender).toScVal(), new Address(recipient).toScVal(), xdr.ScVal.scvString('USDC:ISSUER')],
      value: nativeToScVal(50_000n, { type: 'i128' }),
    }], cursor: cursor(29) } as never);
  const transfers = await fetchWalletUsdcTransfers('https://scan-test.example', 'USDC', sender);
  expect(transfers).toHaveLength(1);
  expect(getEvents).toHaveBeenCalledTimes(2);
  expect(getEvents.mock.calls[1][0]).not.toHaveProperty('endLedger');
  const filters = getEvents.mock.calls[0][0].filters!;
  const address = new Address(sender).toScVal().toXDR('base64');
  expect(filters[0].topics).toEqual(expect.arrayContaining([
    [expect.any(String), address, '*', '*'], [expect.any(String), '*', address, '*'],
  ]));
  // A second refresh at the same ledger uses the indexed chain history without scanning it again.
  await fetchWalletUsdcTransfers('https://scan-test.example', 'USDC', sender);
  expect(getEvents).toHaveBeenCalledTimes(2);
});

it('retries when the oldest retained ledger advances during a history request', async () => {
  vi.spyOn(rpc.Server.prototype, 'getHealth')
    .mockResolvedValueOnce({ status: 'healthy', oldestLedger: 10, latestLedger: 30 } as never)
    .mockResolvedValueOnce({ status: 'healthy', oldestLedger: 11, latestLedger: 30 } as never);
  const getEvents = vi.spyOn(rpc.Server.prototype, 'getEvents')
    .mockRejectedValueOnce(new Error('startLedger must be within the ledger range: 11 - 30'))
    .mockResolvedValueOnce({ events: [], cursor: `${29n << 32n}-4294967295` } as never);
  await expect(fetchWalletUsdcTransfers('https://retention-test.example', 'USDC', sender)).resolves.toEqual([]);
  expect(getEvents.mock.calls[1][0]).toHaveProperty('startLedger', 12);
});
