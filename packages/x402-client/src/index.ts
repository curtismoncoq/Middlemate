import { x402Client } from '@x402/core/client';
import { decodePaymentResponseHeader, wrapFetchWithPayment } from '@x402/fetch';
import { createEd25519Signer } from '@x402/stellar';
import { ExactStellarScheme } from '@x402/stellar/exact/client';
import { Keypair } from '@stellar/stellar-sdk';
import { loadConfig, type Config } from '@tb/config';

export type Payment = { txHash: string; payer: string };
export type PaidResponse = Response & { payment?: Payment };
export type PayingFetch = (url: string | URL, init?: RequestInit) => Promise<PaidResponse>;

type Opts = { paymentsMode?: Config['paymentsMode']; fetchImpl?: typeof fetch };

/** fetch() that pays x402 challenges from the given Stellar secret and exposes the settlement tx. */
export function createPayingFetch(secret: string, opts: Opts = {}): PayingFetch {
  const mode = opts.paymentsMode ?? loadConfig().paymentsMode;
  const base = opts.fetchImpl ?? fetch;
  const payer = Keypair.fromSecret(secret).publicKey();

  if (mode === 'simulated') {
    return async (url, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set('x-simulated-payment', payer);
      const res = (await base(url, { ...init, headers })) as PaidResponse;
      if (res.ok) res.payment = { txHash: 'simulated', payer };
      return res;
    };
  }

  const signer = createEd25519Signer(secret, 'stellar:testnet');
  const client = new x402Client().register('stellar:*', new ExactStellarScheme(signer));
  const paid = wrapFetchWithPayment(base, client);
  return async (url, init) => {
    const res = (await paid(url, init)) as PaidResponse;
    const header = res.headers.get('PAYMENT-RESPONSE') ?? res.headers.get('X-PAYMENT-RESPONSE');
    if (header) {
      const settled = decodePaymentResponseHeader(header) as { transaction?: string };
      if (settled.transaction) res.payment = { txHash: settled.transaction, payer };
    }
    return res;
  };
}
