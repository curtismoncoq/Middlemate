import { usdc, type ApiListing } from './types.ts';

export type CatalogSummary = { live: number; stakedUsdc: number; passed: number; underReview: number; slashed: number };

const isApi = (l: ApiListing) => l.claimedModel.startsWith('api:');
const isLive = (l: ApiListing) => l.active && BigInt(l.stakeAtomic) > 0n;

/** Headline figures for the catalog, computed from the registry rows. */
export function catalogSummary(listings: ApiListing[]): CatalogSummary {
  const live = listings.filter(isLive);
  return {
    live: live.length,
    stakedUsdc: usdc(live.reduce((sum, l) => sum + BigInt(l.stakeAtomic), 0n)),
    passed: live.filter((l) => l.lastAudit?.pass && !l.lastAudit.inconclusive).length,
    underReview: live.filter((l) => !l.lastAudit && !isApi(l) && l.verifiable !== false).length,
    slashed: listings.filter((l) => !!l.lastAudit?.slashTx).length,
  };
}
