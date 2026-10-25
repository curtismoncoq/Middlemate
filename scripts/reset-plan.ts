import type { Listing } from '@tb/registry-client';

/**
 * What demo:reset may do with the current registry.
 * Legacy listings are unregistered by the admin. Per-ID listings can only be withdrawn by their owner,
 * so reset stops only for those still on the street (active and staked). Slashed, expired-exit and
 * retired ones are already off the catalog. The registry's view already reports a listing as
 * inactive once its exit grace has passed, so `now` only documents that rule.
 */
export function resetPlan(listings: Listing[], _now: number = Date.now() / 1000) {
  return {
    unregister: listings.filter((l) => !l.id),
    blocking: listings.filter((l) => !!l.id && !l.retired && l.active && l.stakeAtomic > 0n),
  };
}

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

export function blockingMessage(blocking: Listing[]) {
  const names = blocking.map((l) => `${l.name} (${short(l.provider)})`).join(', ');
  return `Still listed: ${names}. Remove each one from Dashboard with its owner's wallet (the 10 s grace is enough; withdraw can come later), then run demo:reset again.`;
}
