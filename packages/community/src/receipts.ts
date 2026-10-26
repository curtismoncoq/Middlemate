import { Address, FeeBumpTransaction, rpc, scValToNative, TransactionBuilder, type xdr } from '@stellar/stellar-sdk';
import type { Config } from '@tb/config';
import { validateWeatherCapabilities, WEATHER_SCHEMA_ID } from '@tb/weather-contract';
import { CommunityError, hashText, type CommunityStore } from './index.ts';
import type { CommunityCall } from './types.ts';
import { createHmac, timingSafeEqual } from 'node:crypto';

type CallRow = Omit<CommunityCall,'id'|'namespace'>;
export class ReceiptPersistenceError extends CommunityError {
  constructor(public row: CallRow) { super('Payment confirmed, but the call receipt could not be saved. Retry saving without paying again.', 503); }
}
export function receiptProof(cfg: Config, row: CallRow) {
  const body = Buffer.from(JSON.stringify({ row, namespace: cfg.communityNamespace, expires: Date.now() + 3600000 })).toString('base64url');
  return `${body}.${createHmac('sha256', cfg.supabaseSecretKey!).update(body).digest('base64url')}`;
}
export async function recoverReceipt(store: CommunityStore, cfg: Config, token: string) {
  const [body, signature] = token.split('.');
  const expected = createHmac('sha256', cfg.supabaseSecretKey!).update(body ?? '').digest();
  const actual = Buffer.from(signature ?? '', 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new CommunityError('Invalid receipt proof.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as {row:CallRow;namespace:string;expires:number};
  if (payload.namespace !== cfg.communityNamespace || payload.expires < Date.now()) throw new CommunityError('Receipt recovery proof expired.');
  const transaction = await new rpc.Server(cfg.rpcUrl).getTransaction(payload.row.tx_hash);
  if (transaction.status !== 'SUCCESS') throw new CommunityError('Confirmed payment required.');
  const paid = verifySettlement(transaction.envelopeXdr, cfg, { provider: payload.row.provider, priceAtomic: BigInt(payload.row.amount_atomic), name: payload.row.listing_name, endpoint: payload.row.endpoint, claimedModel: '' });
  if (paid.buyer !== payload.row.buyer) throw new CommunityError('Wrong buyer in receipt.');
  return saveCall(store, payload.row);
}

async function saveCall(store: CommunityStore, row: CallRow): Promise<CommunityCall> {
  const inserted = await store.insert<CommunityCall>('community_calls', row, 'namespace,tx_hash');
  const receipt = inserted[0] ?? (await store.rows<CommunityCall>('community_calls', { tx_hash: `eq.${row.tx_hash}`, limit: '1' }))[0];
  if (!receipt || receipt.listing_id !== row.listing_id || receipt.buyer !== row.buyer) throw new CommunityError('This payment is already bound to another listing.');
  return receipt;
}

type ReceiptListing = { id?: string; provider: string; name: string; endpoint: string; claimedModel: string; priceAtomic: bigint };
export function verifySettlement(envelope: string | xdr.TransactionEnvelope, cfg: Pick<Config,'networkPassphrase'|'usdcContract'>, listing: ReceiptListing) {
  const parsed = TransactionBuilder.fromXDR(envelope, cfg.networkPassphrase);
  const tx = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed;
  if (tx.operations.length !== 1) throw new CommunityError('Expected one direct USDC settlement.');
  const operation = tx.operations[0];
  if (operation.type !== 'invokeHostFunction' || operation.func.switch().name !== 'hostFunctionTypeInvokeContract') throw new CommunityError('This transaction is not an API payment.');
  const call = operation.func.invokeContract();
  const args = call.args();
  if (Address.fromScAddress(call.contractAddress()).toString() !== cfg.usdcContract || call.functionName().toString() !== 'transfer' || args.length !== 3) throw new CommunityError('Wrong payment asset or operation.');
  const buyer = Address.fromScVal(args[0]).toString();
  const provider = Address.fromScVal(args[1]).toString();
  const amount = scValToNative(args[2]);
  if (provider !== listing.provider || typeof amount !== 'bigint' || amount <= 0n || amount > listing.priceAtomic) throw new CommunityError('Payment does not match this listing owner and price.');
  return { buyer, provider, amount_atomic: String(amount) };
}

export function inspectResponse(claim: string, text: string): { schema_valid: boolean | null; fields_present: boolean | null } {
  try {
    const body = JSON.parse(text);
    if (claim === WEATHER_SCHEMA_ID) {
      const manifest = validateWeatherCapabilities(body);
      if (!body.location || !body.forecast) return { schema_valid: false, fields_present: false };
      const fields = manifest.availableFields.every((id) => { const [group,key] = id.split('.'); return body[group]?.[key] !== undefined && body[group]?.[key] !== null; });
      return { schema_valid: true, fields_present: fields };
    }
    if (!claim.startsWith('api:')) return { schema_valid: typeof body.choices?.[0]?.message?.content === 'string', fields_present: null };
    return { schema_valid: null, fields_present: null };
  } catch { return { schema_valid: false, fields_present: false }; }
}

export async function recordVerifiedCall(store: CommunityStore, cfg: Config, input: {
  listing: ReceiptListing; txHash: string; source: CommunityCall['source']; status: number; requestText: string; responseText: string;
}): Promise<CommunityCall> {
  if (!/^[0-9a-f]{64}$/i.test(input.txHash)) throw new CommunityError('A confirmed real payment transaction is required.');
  const server = new rpc.Server(cfg.rpcUrl);
  const transaction = await server.getTransaction(input.txHash);
  if (transaction.status !== 'SUCCESS') throw new CommunityError('Payment is not confirmed or is outside RPC retention.', 409);
  const payment = verifySettlement(transaction.envelopeXdr, cfg, input.listing);
  const row: CallRow = {
    listing_id: input.listing.id ?? input.listing.provider, listing_name: input.listing.name, endpoint: input.listing.endpoint,
    ...payment, tx_hash: input.txHash, source: input.source, response_ok: input.status >= 200 && input.status < 300,
    ...inspectResponse(input.listing.claimedModel, input.responseText), status_code: input.status,
    request_hash: hashText(input.requestText), at: new Date(transaction.createdAt * 1000).toISOString(),
  };
  try { return await saveCall(store, row); }
  catch (error) { if (error instanceof CommunityError && error.status < 500) throw error; throw new ReceiptPersistenceError(row); }
}
