import { Address, Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { buildUsdcRecipientFilters, decodeUsdcTransfers } from '../lib/stellar-activity.ts';

const sender = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const recipient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();

describe('USDC RPC event filters', () => {
  it('keeps no more than five recipient topics in each filter', () => {
    const providers = Array.from({ length: 12 }, (_, index) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, index + 10)).publicKey());
    const filters = buildUsdcRecipientFilters('USDC', providers);
    expect(filters).toHaveLength(3);
    expect(filters.every((filter) => filter.topics.length <= 5)).toBe(true);
    expect(filters.flatMap((filter) => filter.topics)).toHaveLength(providers.length);
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
});
