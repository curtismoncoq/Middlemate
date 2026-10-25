/** What the endpoint itself charges per request, read from its unpaid x402 `402 Payment Required` answer. */
export type EndpointPrice = { amountAtomic: string; payTo: string };
type Offer = { network?: string; asset?: string; amount?: string; payTo?: string };

/**
 * Calls the endpoint once without paying and reads its payment terms, so a listing's price is always
 * what buyers will actually be charged. Throws a sentence a provider can act on.
 */
export async function readEndpointPrice(url: string, expected: { network: string; asset: string }, fetchImpl: typeof fetch = fetch): Promise<EndpointPrice> {
  let r: Response;
  try {
    r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error('Could not reach the endpoint. Check the URL and that the server is running.');
  }
  if (r.status !== 402) throw new Error(`The endpoint didn't ask for payment (HTTP ${r.status}). It must answer unpaid requests with an x402 402.`);
  let offers: Offer[];
  try {
    offers = (JSON.parse(atob(r.headers.get('payment-required') ?? '')) as { accepts?: Offer[] }).accepts ?? [];
  } catch {
    throw new Error('The endpoint answered 402 but its payment terms could not be read.');
  }
  const o = offers.find((x) => x.network === expected.network && x.asset === expected.asset && /^\d+$/.test(x.amount ?? '') && x.payTo);
  if (!o) throw new Error('The endpoint doesn’t accept USDC on Stellar testnet.');
  return { amountAtomic: o.amount!, payTo: o.payTo! };
}
