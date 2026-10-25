import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { paywall } from '../src/paywall.ts';

function app() {
  const a = express();
  a.post('/echo', paywall('/echo', '$0.001', 'GPAYTO', { paymentsMode: 'simulated' }), (_req, res) => {
    res.json({ ok: true, payment: res.locals.payment });
  });
  return a;
}

describe('paywall (simulated mode)', () => {
  it('returns 402 without a payment header', async () => {
    const r = await request(app()).post('/echo');
    expect(r.status).toBe(402);
    expect(r.body.accepts[0]).toMatchObject({ price: '$0.001', payTo: 'GPAYTO', network: 'stellar:testnet' });
  });

  it('passes through and records the payer with X-Simulated-Payment', async () => {
    const r = await request(app()).post('/echo').set('X-Simulated-Payment', 'GPAYER');
    expect(r.status).toBe(200);
    expect(r.body.payment).toEqual({ payer: 'GPAYER', txHash: 'simulated' });
  });
});
