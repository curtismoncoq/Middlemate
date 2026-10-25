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
  provider: string;
  name: string;
  endpoint: string;
  claimedModel: string;
  priceAtomic: string;
  stakeAtomic: string;
  active: boolean;
  lastAudit?: AuditSummary;
};

export type CatalogState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; listings: ApiListing[] };

export const SLASHED_VISIBLE_MS = 20_000;
export const txUrl = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const usdc = (atomic: string | bigint) => Number(atomic) / 1e7;
export const price = (atomic: string) => `$${String(+usdc(atomic).toFixed(4))}`;

export function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
