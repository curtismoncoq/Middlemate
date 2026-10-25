import { x402Facilitator } from '@x402/core/facilitator';
import type { FacilitatorClient } from '@x402/core/server';
import { createEd25519Signer } from '@x402/stellar';
import { ExactStellarScheme } from '@x402/stellar/exact/facilitator';

/**
 * In-process x402 facilitator: verifies and settles Stellar `exact` payments itself,
 * paying fees from `secret`. Used when FACILITATOR_URL=local.
 */
export function createLocalFacilitator(secret: string, opts: { maxTransactionFeeStroops?: number } = {}): FacilitatorClient {
  const signer = createEd25519Signer(secret, 'stellar:testnet');
  const facilitator = new x402Facilitator().register(
    'stellar:testnet',
    new ExactStellarScheme([signer], { maxTransactionFeeStroops: opts.maxTransactionFeeStroops ?? 2_000_000 }),
  );
  return {
    verify: (payload, reqs) => facilitator.verify(payload, reqs),
    settle: (payload, reqs) => facilitator.settle(payload, reqs),
    getSupported: async () => facilitator.getSupported() as Awaited<ReturnType<FacilitatorClient['getSupported']>>,
  };
}
