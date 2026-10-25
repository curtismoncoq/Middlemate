// Usage: tsx scripts/pay-once.ts [url] [json-body]
import { loadConfig } from '@tb/config';
import { createPayingFetch } from '@tb/x402-client';

const cfg = loadConfig();
const url = process.argv[2] ?? `http://localhost:${cfg.providersPort}/echo`;
const body = process.argv[3] ?? JSON.stringify({ hello: 'x402' });
const pay = createPayingFetch(cfg.keys.agent.secret);
const t0 = Date.now();
const res = await pay(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
console.log(`status ${res.status} in ${Date.now() - t0}ms`);
console.log((await res.text()).slice(0, 800));
console.log('payment', res.payment ?? '(none)');
if (res.payment && res.payment.txHash !== 'simulated') console.log(`https://stellar.expert/explorer/testnet/tx/${res.payment.txHash}`);
