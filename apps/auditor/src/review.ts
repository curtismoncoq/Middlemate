import { listingKey, type Listing } from '@tb/registry-client';

/** Entry audits that scored too few probes (endpoint down, payments refused) are retried this many times. */
export const ENTRY_RETRIES = 3;
const RETRY_AFTER_MS = 60_000;

type AuditRef = { listingId?: string; provider: string; at?: string; verdict?: { inconclusive: boolean; unverifiable?: boolean } };

/**
 * Listings that need their entry audit: active, staked and verifiable, and either never audited or
 * last audited without enough scored probes (retried after a minute, up to ENTRY_RETRIES audits).
 */
export function awaitingReview(listings: Listing[], records: AuditRef[], referenceModels: string[], now = Date.now()): Listing[] {
  const byListing = new Map<string, AuditRef[]>();
  for (const r of records) {
    const k = r.listingId ?? r.provider;
    byListing.set(k, [...(byListing.get(k) ?? []), r]);
  }
  const needsAudit = (l: Listing) => {
    const recs = byListing.get(listingKey(l));
    if (!recs) return true;
    const latest = recs.reduce((a, b) => (Date.parse(b.at ?? '') > Date.parse(a.at ?? '') ? b : a));
    const unscored = recs.filter((r) => r.verdict?.inconclusive && !r.verdict.unverifiable).length;
    return !!latest.verdict?.inconclusive && !latest.verdict.unverifiable && unscored < ENTRY_RETRIES && now - Date.parse(latest.at ?? '') >= RETRY_AFTER_MS;
  };
  return listings.filter((l) => l.active && l.stakeAtomic > 0n && referenceModels.includes(l.claimedModel) && needsAudit(l));
}
