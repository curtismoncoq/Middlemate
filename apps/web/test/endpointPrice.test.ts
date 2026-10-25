import { describe, it, expect } from 'vitest';
import { readEndpointPrice } from '../lib/endpointPrice.ts';

const USDC = 'CUSDC';
const expectPay = { network: 'stellar:testnet', asset: USDC };
const header = (accepts: object[]) => btoa(JSON.stringify({ x402Version: 2, accepts }));
const reply = (status: number, accepts?: object[]) => (async () =>
  new Response('{}', { status, headers: accepts ? { 'payment-required': header(accepts) } : {} })) as unknown as typeof fetch;

describe('readEndpointPrice', () => {
  it('reads the per-request price and payee from the endpoint’s unpaid 402', async () => {
    const f = reply(402, [{ network: 'stellar:testnet', asset: USDC, amount: '120000', payTo: 'GPAYEE' }]);
    expect(await readEndpointPrice('http://p/v1/chat/completions', expectPay, f)).toEqual({ amountAtomic: '120000', payTo: 'GPAYEE' });
  });
  it('picks the USDC-on-testnet offer when the endpoint accepts several', async () => {
    const f = reply(402, [{ network: 'eip155:8453', asset: '0xusdc', amount: '9', payTo: '0xabc' }, { network: 'stellar:testnet', asset: USDC, amount: '40000', payTo: 'GB' }]);
    expect((await readEndpointPrice('http://p', expectPay, f)).amountAtomic).toBe('40000');
  });
  it('explains an endpoint that is free, unreachable, or paid in something else', async () => {
    await expect(readEndpointPrice('http://p', expectPay, reply(200))).rejects.toThrow(/didn.t ask for payment/);
    await expect(readEndpointPrice('http://p', expectPay, (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch)).rejects.toThrow(/Could not reach/);
    await expect(readEndpointPrice('http://p', expectPay, reply(402))).rejects.toThrow(/payment terms/);
    await expect(readEndpointPrice('http://p', expectPay, reply(402, [{ network: 'stellar:pubnet', asset: USDC, amount: '1', payTo: 'G' }]))).rejects.toThrow(/USDC on Stellar testnet/);
  });
});
