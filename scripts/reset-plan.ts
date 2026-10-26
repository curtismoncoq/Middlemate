import type { Listing } from '@tb/registry-client';

/**
 * What demo:reset does with the current registry.
 * Legacy listings are unregistered by the admin (stakes refunded). Per-ID listings can only be
 * withdrawn by their owner, so the auditor pauses those still on the street: they leave the catalog,
 * the stake stays theirs, and the owner can still exit and withdraw it from Dashboard.
 * Slashed, expired-exit and retired ones are already off the catalog. The registry's view already
 * reports a listing as inactive once its exit grace has passed, so `now` only documents that rule.
 */
export function resetPlan(listings: Listing[], _now: number = Date.now() / 1000) {
  return {
    unregister: listings.filter((l) => !l.id),
    pause: listings.filter((l) => !!l.id && !l.retired && l.active),
  };
}

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

export function pausedLine(l: Listing) {
  return `paused ${l.name} (${short(l.provider)}): its ${Number(l.stakeAtomic) / 1e7} USDC stake stays with the owner, who can withdraw it from Dashboard`;
}

/**
 * With Supabase configured the auditor keeps audits in a shared namespace and refuses to clear them,
 * so a reset would leave old audits on camera. Stop before touching the chain unless asked to keep them.
 */
export function sharedHistoryBlock(communityEnabled: boolean, argv: string[]): string | null {
  if (!communityEnabled || argv.includes('--keep-shared-audits')) return null;
  return 'Audit history is shared in Supabase, so demo:reset cannot clear it. For a clean demo, comment out SUPABASE_URL and SUPABASE_SECRET_KEY in .env (or set a new COMMUNITY_NAMESPACE), restart pnpm demo:weather, then run demo:reset again. Pass --keep-shared-audits to reset anyway.';
}
