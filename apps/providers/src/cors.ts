import type { RequestHandler } from 'express';

/**
 * CORS for browser buyers paying over x402: they send `payment-signature` (and, on the paid retry,
 * `access-control-expose-headers`) and must read `payment-response`. Every paywalled server uses this.
 */
export const buyerCors: RequestHandler = (req, res, next) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, payment-signature, x-payment, x-simulated-payment, access-control-expose-headers, x-tb-listing-id');
  res.setHeader('access-control-expose-headers', 'payment-required, payment-response, x-payment-response');
  if (req.method === 'OPTIONS') {
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.status(204).end();
    return;
  }
  next();
};
