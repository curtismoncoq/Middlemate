import { decodePaymentResponseHeader } from '@x402/fetch';
import { createRegistryClient, isListingActive } from '@tb/registry-client';
import { recordVerifiedCall, receiptProof, ReceiptPersistenceError } from '@tb/community/receipts';
import { communityConfig as cfg, communityError, database } from '../../../../lib/community-server.ts';
import { invokeProvider } from '../../../../lib/invoke.ts';

export const dynamic = 'force-dynamic';
export async function POST(req: Request, context: {params:Promise<{id:string}>}) {
  try {
    const db = database();
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) return Response.json({ error: 'Marketplace origin required.' }, { status: 403 });
    const { id } = await context.params;
    const registry = createRegistryClient(cfg);
    const listing = (await registry.list()).find((listing) => (listing.id ?? listing.provider) === id);
    if (!listing || !await isListingActive(registry, listing)) return Response.json({ error: 'This listing is unavailable.' }, { status: 409 });
    if (Number(req.headers.get('content-length') ?? 0) > 65536) return Response.json({ error: 'Request exceeds 64 KB.' }, { status: 413 });
    const body = await req.text();
    if (Buffer.byteLength(body) > 65536) return Response.json({ error: 'Request exceeds 64 KB.' }, { status: 413 });
    JSON.parse(body);
    const forwarded: Record<string,string> = { 'content-type': 'application/json', 'x-tb-listing-id': id };
    for (const name of ['payment-signature','x-payment']) { const value = req.headers.get(name); if (value) forwarded[name] = value; }
    const upstream = await invokeProvider(listing.endpoint, body, forwarded);
    const headers = upstream.headers;
    headers.set('cache-control','no-store');
    const settlement = headers.get('payment-response') ?? headers.get('x-payment-response');
    if (settlement) {
      try {
        const tx = (decodePaymentResponseHeader(settlement) as {transaction?:string}).transaction;
        if (tx) {
          const call = await recordVerifiedCall(db,cfg,{ listing, txHash:tx, source:'human', status:upstream.status, requestText:body, responseText:upstream.body });
          headers.set('x-tb-call-id',call.id);
        }
      } catch (error) {
        headers.set('x-tb-receipt-error','Payment confirmed, but this call could not be added to your shared history. Do not pay again to retry saving.');
        if (error instanceof ReceiptPersistenceError) headers.set('x-tb-receipt-proof',receiptProof(cfg,error.row));
      }
    }
    return new Response(upstream.body, {status:upstream.status,headers});
  } catch (error) { return communityError(error); }
}
