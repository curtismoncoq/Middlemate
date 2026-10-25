import type { ApiListing } from './types.ts';
export type DashboardEvent = {
  id: string; at: string; provider: string; payer: string; listingName: string;
  claimedModel: string; amountAtomic: string; txHash: string;
};

/** Registry refunds return principal; they must never count as provider earnings. */
export function marketplacePaymentEvents(transfers: { id: string; at: string; provider: string; payer: string; amountAtomic: string; txHash: string }[], listings: ApiListing[], registryAddresses: string[]): DashboardEvent[] {
  const registries = new Set(registryAddresses);
  return transfers.flatMap((transfer) => {
    if (registries.has(transfer.payer)) return [];
    const owned = listings.filter((listing) => listing.provider === transfer.provider);
    if (!owned.length) return [];
    return [{ ...transfer, listingName: owned.length === 1 ? owned[0].name : 'Provider wallet', claimedModel: owned.length === 1 ? owned[0].claimedModel : '' }];
  }).sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
}

export type DashboardSnapshot = {
  registryMode?: 'onchain' | 'offchain';
  activityError?: string;
  listings: ApiListing[];
  provider: { earningsAtomic: string; stakeAtomic: string; requests: number; events: DashboardEvent[]; daily: { date: string; amountAtomic: string }[] };
  buyer: { spentAtomic: string; requests: number; events: DashboardEvent[]; daily: { date: string; amountAtomic: string }[] };
  audits: { at: string; name: string; score: number; pass: boolean; inconclusive: boolean; slashTx?: string }[];
};

function sum(events: DashboardEvent[]) { return events.reduce((total, event) => total + BigInt(event.amountAtomic), 0n); }

function daily(events: DashboardEvent[], now: number) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now - (6 - index) * 86_400_000).toISOString().slice(0, 10);
    return { date, amountAtomic: '0' };
  });
  const byDate = new Map(days.map((item) => [item.date, BigInt(item.amountAtomic)]));
  for (const event of events) {
    const date = event.at.slice(0, 10);
    if (byDate.has(date)) byDate.set(date, byDate.get(date)! + BigInt(event.amountAtomic));
  }
  return days.map(({ date }) => ({ date, amountAtomic: String(byDate.get(date) ?? 0n) }));
}

export function buildDashboardSnapshot(address: string, allListings: ApiListing[], allEvents: DashboardEvent[], allAudits: { listingId?: string; provider: string; at: string; name: string; verdict?: { score: number; pass: boolean; inconclusive: boolean }; slashTx?: string }[], now = Date.now()): DashboardSnapshot {
  const listings = allListings.filter((listing) => listing.provider === address);
  const providers = new Set(listings.map((listing) => listing.provider));
  const providerEvents = allEvents.filter((event) => providers.has(event.provider));
  const buyerEvents = allEvents.filter((event) => event.payer === address);
  const audits = allAudits.filter((audit) => audit.verdict && listings.some((listing) => listing.id ? listing.id === audit.listingId : !audit.listingId && listing.provider === audit.provider)).map((audit) => ({
    at: audit.at, name: audit.name, score: audit.verdict!.score, pass: audit.verdict!.pass,
    inconclusive: audit.verdict!.inconclusive, ...(audit.slashTx ? { slashTx: audit.slashTx } : {}),
  }));
  return {
    listings,
    provider: { earningsAtomic: String(sum(providerEvents)), stakeAtomic: String(listings.reduce((total, listing) => total + BigInt(listing.stakeAtomic), 0n)), requests: providerEvents.length, events: providerEvents, daily: daily(providerEvents, now) },
    buyer: { spentAtomic: String(sum(buyerEvents)), requests: buyerEvents.length, events: buyerEvents, daily: daily(buyerEvents, now) },
    audits,
  };
}
