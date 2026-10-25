import type { ReactNode } from 'react';
import { ListingCard } from './ListingCard.tsx';
import { auditingFor, stallKey } from '../lib/stall.ts';
import { SLASHED_VISIBLE_MS, type ApiListing, type AuditStatus, type CatalogState } from '../lib/types.ts';

type Props = { state: CatalogState; now: number; onTry?: (l: ApiListing) => void; audit?: AuditStatus };
export type CatalogFilter = 'all' | 'api' | 'inference';

const LABEL: Record<CatalogFilter, string> = { all: 'All', inference: 'Inference', api: 'API' };
const inCategory = (l: ApiListing, f: CatalogFilter) => f === 'all' || (f === 'api') === l.claimedModel.startsWith('api:');

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
  const visible = state.status === 'ok' ? visibleListings(state.listings, now) : [];
  let content: ReactNode;
  if (state.status === 'loading') content = <p className="empty">Loading listings…</p>;
  else if (state.status === 'error') content = <p className="empty empty--error">Registry unavailable — retrying… ({state.message})</p>;
  else {
    const shown = visible.filter((l) => inCategory(l, filter));
    content = shown.length === 0 ? <p className="empty">{visible.length === 0 ? 'No listings yet.' : `No ${filter === 'api' ? 'API' : 'inference'} listings yet.`}</p> : (
      <section className="grid">{shown.map((l) => <ListingCard key={stallKey(l)} listing={l} now={now} onTry={onTry} auditing={audit ? auditingFor(l, audit) : undefined} />)}</section>
    );
  }
  return (
    <>
      <nav className="tabs" aria-label="Listing category">
        {(['all', 'inference', 'api'] as const).map((category) => (
          <button key={category} type="button" className={`tab ${filter === category ? 'is-active' : ''}`} aria-pressed={filter === category} onClick={() => onFilterChange?.(category)}>
            {LABEL[category]} <span className="tab__count">{visible.filter((l) => inCategory(l, category)).length}</span>
          </button>
        ))}
      </nav>
      {content}
    </>
  );
}
