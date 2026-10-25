import type { RequestHandler } from 'express';
import { paymentMiddlewareFromConfig } from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactStellarScheme } from '@x402/stellar/exact/server';
import { loadConfig, type Config } from '@tb/config';
import { createLocalFacilitator } from './facilitator.ts';

export const SIMULATED_HEADER = 'x-simulated-payment';

type PaywallOpts = Partial<Pick<Config, 'paymentsMode' | 'facilitatorUrl' | 'network'>>;

/**
 * x402 paywall for one route. `route` is the Express path the handler is mounted on
 * (POST is assumed). In simulated mode a request must carry `X-Simulated-Payment: <payer>`.
 */
export function paywall(route: string, priceUsd: string, payTo: string, opts: PaywallOpts = {}): RequestHandler {
  const cfg = { ...pickDefaults(opts), ...opts } as Required<PaywallOpts>;

  if (cfg.paymentsMode === 'simulated') {
    return (req, res, next) => {
      const payer = req.header(SIMULATED_HEADER);
      if (!payer) {
        res.status(402).json({
          x402Version: 2,
          error: 'payment required (simulated mode)',
          accepts: [{ scheme: 'exact', price: priceUsd, payTo, network: cfg.network }],
        });
        return;
      }
      res.locals.payment = { payer, txHash: 'simulated' };
      next();
    };
  }

  return paymentMiddlewareFromConfig(
    { [`POST ${route}`]: { accepts: { scheme: 'exact', price: priceUsd, network: cfg.network, payTo } } },
    facilitatorFor(cfg.facilitatorUrl),
    [{ network: cfg.network, server: new ExactStellarScheme() }],
  ) as RequestHandler;
}

function pickDefaults(opts: PaywallOpts): PaywallOpts {
  if (opts.paymentsMode && opts.facilitatorUrl && opts.network) return {};
  const c = loadConfig();
  return { paymentsMode: c.paymentsMode, facilitatorUrl: c.facilitatorUrl, network: c.network };
}

let local: ReturnType<typeof createLocalFacilitator> | undefined;
function facilitatorFor(url: string) {
  if (url !== 'local') return new HTTPFacilitatorClient({ url });
  return (local ??= createLocalFacilitator(loadConfig().keys.admin.secret));
}
