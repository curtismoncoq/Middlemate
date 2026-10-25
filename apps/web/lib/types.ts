export type AuditSummary = {
  at: string;
  score: number;
  matchedModel: string;
  confidence: number;
  pass: boolean;
  inconclusive?: boolean;
  unverifiable?: boolean;
  slashTx?: string;
  slashedAtomic?: string;
  pauseTx?: string;
};

/** Listing as sent over JSON (bigints as strings) with its latest audit. */
export type ApiListing = {
  id?: string;
  exitAt?: number;
  retired?: boolean;
  provider: string;
  name: string;
  endpoint: string;
  claimedModel: string;
  priceAtomic: string;
  stakeAtomic: string;
  active: boolean;
  /** claimed model is in the verifiable registry (false = auditor can't check it) */
  verifiable?: boolean;
  communityEnabled?: boolean;
  lastAudit?: AuditSummary;
};

export type AuditStatus = {
  running: boolean;
  current: { listingId?: string; provider: string; name: string; probe: number; total: number } | null;
  feed: { at: string; provider: string; name: string; line: string }[];
};
export const IDLE_AUDIT: AuditStatus = { running: false, current: null, feed: [] };

export type CatalogState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; listings: ApiListing[] };

export const SLASHED_VISIBLE_MS = 60_000;
export const txUrl = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const usdc = (atomic: string | bigint) => Number(atomic) / 1e7;
export const price = (atomic: string) => `$${String(+usdc(atomic).toFixed(4))}`;

export function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
