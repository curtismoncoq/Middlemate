import { x402Client } from '@x402/core/client';
import { decodePaymentResponseHeader, wrapFetchWithPayment } from '@x402/fetch';
import { createEd25519Signer } from '@x402/stellar';
import { ExactStellarScheme } from '@x402/stellar/exact/client';
import { Keypair } from '@stellar/stellar-sdk';
import { loadConfig, type Config } from '@tb/config';

export type Payment = { txHash: string; payer: string };
export type PaidResponse = Response & { payment?: Payment };
export type PayOpts = {
  /** refuse to pay a 402 challenge asking for more than this (token atomic units) — e.g. the listing's registered price */
  maxAmountAtomic?: bigint;
};
export type PayingFetch = (url: string | URL, init?: RequestInit, opts?: PayOpts) => Promise<PaidResponse>;

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
  const scheme = new ExactStellarScheme(signer);
  const uncapped = wrapFetchWithPayment(base, new x402Client().register('stellar:*', scheme));
  return async (url, init, payOpts = {}) => {
    const cap = payOpts.maxAmountAtomic;
    const paid =
      cap === undefined
        ? uncapped
        : wrapFetchWithPayment(base, new x402Client().register('stellar:*', scheme).registerPolicy(capPolicy(cap)));
    const res = (await paid(url, init)) as PaidResponse;
    const header = res.headers.get('PAYMENT-RESPONSE') ?? res.headers.get('X-PAYMENT-RESPONSE');
    if (header) {
      const settled = decodePaymentResponseHeader(header) as { transaction?: string };
      if (settled.transaction) res.payment = { txHash: settled.transaction, payer };
    }
    return res;
  };
}

/** x402 policy: keep only payment options at or under `cap`; throw if the provider asks for more. */
export function capPolicy(cap: bigint) {
  return (_v: number, reqs: { amount: string }[]) => {
    const ok = reqs.filter((r) => BigInt(r.amount) <= cap);
    if (ok.length === 0) {
      const asked = reqs.map((r) => BigInt(r.amount)).reduce((a, b) => (a < b ? a : b));
      throw new Error(`provider asks for ${asked} > cap ${cap} (atomic units) — refusing to pay`);
    }
    return ok as never;
  };
}
