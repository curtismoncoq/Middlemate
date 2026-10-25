import { listingKey, type Listing } from '@tb/registry-client';

/** Listings that need their entry audit: active, staked, verifiable, and never audited. */
export function awaitingReview(listings: Listing[], records: { listingId?: string; provider: string }[], referenceModels: string[]): Listing[] {
  const audited = new Set(records.map((r) => r.listingId ?? r.provider));
  return listings.filter((l) => l.active && l.stakeAtomic > 0n && referenceModels.includes(l.claimedModel) && !audited.has(listingKey(l)));
}
