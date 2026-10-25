import { ListingCard } from './ListingCard.tsx';
import { SLASHED_VISIBLE_MS, type ApiListing, type AuditStatus, type CatalogState } from '../lib/types.ts';

type Props = { state: CatalogState; now: number; onTry?: (l: ApiListing) => void; audit?: AuditStatus };

/** Active listings plus recently slashed ones (kept on screen for SLASHED_VISIBLE_MS). */
export function visibleListings(listings: ApiListing[], now: number) {
  return listings.filter((l) => {
    if (l.active && BigInt(l.stakeAtomic) > 0n) return true;
    const a = l.lastAudit;
    return !!a?.slashTx && now - Date.parse(a.at) < SLASHED_VISIBLE_MS;
  });
}

export function Catalog({ state, now, onTry, audit }: Props) {
  if (state.status === 'loading') return <p className="empty">Loading listings…</p>;
  if (state.status === 'error') return <p className="empty empty--error">Registry unavailable — retrying… ({state.message})</p>;
  const shown = visibleListings(state.listings, now);
  if (shown.length === 0) return <p className="empty">No listings yet.</p>;
  return (
    <section className="grid">
      {shown.map((l) => (
        <ListingCard key={l.provider} listing={l} now={now} onTry={onTry} auditing={audit?.current?.provider === l.provider ? audit.current : undefined} />
      ))}
    </section>
  );
}
