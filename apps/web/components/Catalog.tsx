import type { ReactNode } from 'react';
import { ListingCard } from './ListingCard.tsx';
import { SLASHED_VISIBLE_MS, type ApiListing, type AuditStatus, type CatalogState } from '../lib/types.ts';

type Props = { state: CatalogState; now: number; onTry?: (l: ApiListing) => void; audit?: AuditStatus };
export type CatalogFilter = 'all' | 'api' | 'inference';

/** Active listings plus recently slashed ones (kept on screen for SLASHED_VISIBLE_MS). */
export function visibleListings(listings: ApiListing[], now: number) {
  return listings.filter((l) => {
    if (l.retired) return false;
    if (l.active && BigInt(l.stakeAtomic) > 0n) return true;
    const a = l.lastAudit;
    return !!a?.slashTx && now - Date.parse(a.at) < SLASHED_VISIBLE_MS;
  });
}

export function Catalog({ state, now, onTry, audit, filter = 'all', onFilterChange }: Props & { filter?: CatalogFilter; onFilterChange?: (filter: CatalogFilter) => void }) {
  let content: ReactNode;
  if (state.status === 'loading') content = <p className="empty">Loading listings…</p>;
  else if (state.status === 'error') content = <p className="empty empty--error">Registry unavailable — retrying… ({state.message})</p>;
  else {
    const visible = visibleListings(state.listings, now);
    const shown = visible.filter((l) => filter === 'all' || (filter === 'api' ? l.claimedModel.startsWith('api:') : !l.claimedModel.startsWith('api:')));
    content = shown.length === 0 ? <p className="empty">{visible.length === 0 ? 'No listings yet.' : `No ${filter === 'api' ? 'API' : 'inference'} listings yet.`}</p> : (
      <section className="grid">{shown.map((l) => <ListingCard key={l.id ?? l.provider} listing={l} now={now} onTry={onTry} auditing={audit?.current && (audit.current.listingId ?? audit.current.provider) === (l.id ?? l.provider) ? audit.current : undefined} />)}</section>
    );
  }
  return (
    <>
      <nav className="catalog-filters" aria-label="Listing category">
        {(['all', 'api', 'inference'] as const).map((category) => <button key={category} type="button" className={`catalog-filter ${filter === category ? 'is-active' : ''}`} aria-pressed={filter === category} onClick={() => onFilterChange?.(category)}>{category === 'all' ? 'All' : category === 'api' ? 'API' : 'Inference'}</button>)}
      </nav>
      {content}
    </>
  );
}
