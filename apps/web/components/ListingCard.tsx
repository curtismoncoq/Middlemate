import { ago, price, txUrl, usdc, type ApiListing } from '../lib/types.ts';

type Props = { listing: ApiListing; now: number; onTry?: (l: ApiListing) => void };

export function ListingCard({ listing: l, now, onTry }: Props) {
  const a = l.lastAudit;
  const slashed = !!a && !a.pass && !!a.slashTx;

  if (slashed) {
    return (
      <article className="card card--slashed" aria-label={l.name}>
        <header className="card__head">
          <h3>{l.name}</h3>
          <span className="badge badge--red">SLASHED · DELISTED</span>
        </header>
        <p className="card__claim">
          Claims <code>{l.claimedModel}</code>
        </p>
        <p className="card__matched">
          Actually matched: <code>{a.matchedModel}</code> ({Math.round(a.confidence * 100)}%)
        </p>
        <p className="card__price card__price--struck">
          <span>{price(l.priceAtomic)}</span> / request
        </p>
        <footer className="card__meta">
          <span>🔥 Stake {usdc(a.slashedAtomic ?? '0')} → 0 USDC</span>
          <span>Trust {a.score}</span>
          <a href={txUrl(a.slashTx!)} target="_blank" rel="noreferrer">
            slash tx {a.slashTx!.slice(0, 6)}…
          </a>
        </footer>
      </article>
    );
  }

  return (
    <article className="card" aria-label={l.name}>
      <header className="card__head">
        <h3>{l.name}</h3>
        {!a ? (
          <span className="badge">Not audited yet</span>
        ) : a.unverifiable ? (
          <span className="badge badge--amber" title="No reference model to compare against">Unverifiable model</span>
        ) : (
          <span className={`badge ${a.pass ? 'badge--green' : 'badge--amber'}`}>Trust {a.score}</span>
        )}
      </header>
      <p className="card__claim">
        Serves <code>{l.claimedModel}</code>
      </p>
      <p className="card__price">
        <span>{price(l.priceAtomic)}</span> / request
      </p>
      <footer className="card__meta">
        <span>🔒 Staked {usdc(l.stakeAtomic)} USDC</span>
        {a && <span>audited {ago(a.at, now)}</span>}
      </footer>
      <button className="btn" onClick={() => onTry?.(l)} disabled={!l.active}>
        Try it
      </button>
    </article>
  );
}
