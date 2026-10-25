import type { Listing } from '@tb/registry-client';

/** Cheapest active listing that claims `model`, skipping `exclude`d providers and, when given, models outside `verifiable`. */
export function chooseListing(listings: Listing[], model: string, exclude: Set<string>, verifiable?: Set<string>): Listing | null {
  const candidates = listings
    .filter((l) => l.active && l.stakeAtomic > 0n && l.claimedModel === model && !exclude.has(l.provider) && (!verifiable || verifiable.has(l.claimedModel)))
    .sort((a, b) => (a.priceAtomic < b.priceAtomic ? -1 : a.priceAtomic > b.priceAtomic ? 1 : 0));
  return candidates[0] ?? null;
}
