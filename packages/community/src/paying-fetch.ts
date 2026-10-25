import { createPayingFetch, type PayingFetch } from '@tb/x402-client';
import { createRegistryClient } from '@tb/registry-client';
import { loadConfig, type Config } from '@tb/config';
import { createCommunityStore } from './index.ts';
import { recordVerifiedCall } from './receipts.ts';

/** Receipt storage failures never retry a settled payment. */
export function createRecordedPayingFetch(secret: string, source: 'agent'|'audit', cfg: Config = loadConfig(), warn: (message:string)=>void = console.warn): PayingFetch {
  const pay = createPayingFetch(secret);
  const db = createCommunityStore(cfg);
  if (!db) return pay;
  const registry = createRegistryClient(cfg);
  return async (url,init,opts) => {
    const response = await pay(url,init,opts);
    if (response.payment?.txHash && response.payment.txHash !== 'simulated') {
      try {
        const id = new Headers(init?.headers).get('x-tb-listing-id');
        if (!id) throw new Error('Missing listing identity for receipt.');
        const listing = /^[0-9a-f]{64}$/i.test(id) ? await registry.getEndpoint(id) : await registry.get(id);
        if (!listing || listing.endpoint !== String(url)) throw new Error('Receipt endpoint does not match the listing.');
        await recordVerifiedCall(db,cfg,{listing,txHash:response.payment.txHash,source,status:response.status,requestText:String(init?.body??''),responseText:await response.clone().text()});
      } catch { warn('[community] A settled payment receipt could not be saved. The request will not be paid again.'); }
    }
    return response;
  };
}
