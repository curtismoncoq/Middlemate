export type ListingInput = { name: string; endpoint: string; claimedModel: string; priceUsd: string; stakeUsdc: string };
export type ValidListing = { name: string; endpoint: string; claimedModel: string; priceAtomic: string; stakeAtomic: string };
export type Validation = { ok: true; value: ValidListing } | { ok: false; errors: Partial<Record<keyof ListingInput, string>> };

const atomic = (n: number) => String(Math.round(n * 1e7));

export function validateListing(i: ListingInput): Validation {
  const errors: Partial<Record<keyof ListingInput, string>> = {};
  if (!i.name.trim()) errors.name = 'Give the listing a name';
  if (!i.claimedModel.trim()) errors.claimedModel = 'Say which model you serve';
  try {
    const u = new URL(i.endpoint);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
  } catch {
    errors.endpoint = 'Endpoint must be an http(s) URL';
  }
  const price = Number(i.priceUsd);
  if (!(price > 0)) errors.priceUsd = 'Price must be above $0';
  const stake = Number(i.stakeUsdc);
  if (!(stake >= 1)) errors.stakeUsdc = 'Stake at least 1 USDC';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name: i.name.trim(), endpoint: i.endpoint.trim(), claimedModel: i.claimedModel.trim(), priceAtomic: atomic(price), stakeAtomic: atomic(stake) } };
}
