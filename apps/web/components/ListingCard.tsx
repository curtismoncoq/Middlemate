import { ago, price, txUrl, usdc, type ApiListing } from '../lib/types.ts';
import { WeatherFieldMatrix } from './WeatherFieldMatrix.tsx';
import { ListingCommunity } from './Community.tsx';

type Props = { listing: ApiListing; now: number; onTry?: (l: ApiListing) => void; auditing?: { probe: number; total: number }; preview?: boolean };

/** Score at or above this passes the audit; below it with enough probes, the stake is slashed. */
export const SLASH_LINE = 60;

/** Trust score 0–100 as a bar, with a tick at the slash line. */
function TrustMeter({ score, slashed, children }: { score: number; slashed?: boolean; children: React.ReactNode }) {
  return (
    <div className={`meter ${slashed ? 'meter--slashed' : ''}`}>
      <div className="meter__row">{children}</div>
      <div className="meter__track" role="meter" aria-label="Trust score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}>
        <span className="meter__fill" style={{ width: `${score}%` }} />
        <span className="meter__line" style={{ left: `${SLASH_LINE}%` }} title={`Slash line: ${SLASH_LINE}`} />
      </div>
    </div>
  );
}

export function ListingCard({ listing: l, now, onTry, auditing, preview }: Props) {
  const a = l.lastAudit;
  const slashed = !!a && !a.pass && !!a.slashTx;
  const isApi = l.claimedModel.startsWith('api:');
  const unverifiable = !isApi && (l.verifiable === false || !!a?.unverifiable);
  const underReview = !a && !isApi && l.verifiable !== false && l.active;

  if (slashed) {
    return (
      <article className="card card--slashed" aria-label={l.name}>
        <header className="card__head">
          <h3>{l.name}</h3>
          <span className="pill pill--alarm">SLASHED · DELISTED</span>
        </header>
        <p className="card__claim">
          Claims <code>{l.claimedModel}</code>
        </p>
        <TrustMeter score={a.score} slashed>
          <p className="card__matched">
            Actually matched: <code>{a.matchedModel}</code> ({Math.round(a.confidence * 100)}%)
          </p>
        </TrustMeter>
        <div className="card__money">
          <p className="card__price card__price--struck">
            <span>{price(l.priceAtomic)}</span> / request
          </p>
          <p className="card__stake card__stake--lost">{`Stake ${usdc(a.slashedAtomic ?? '0')} → 0 USDC`}</p>
        </div>
        <footer className="card__foot">
          <span>{`Trust ${a.score} · below ${SLASH_LINE}`}</span>
          <a href={txUrl(a.slashTx!)} target="_blank" rel="noreferrer">
            slash tx {a.slashTx!.slice(0, 6)}…
          </a>
        </footer>
      </article>
    );
  }

  const state = auditing ? (
    <span className="pill pill--warning">
      <span className="pulse" aria-hidden="true" />
      Being audited · probe {auditing.probe}/{auditing.total}
    </span>
  ) : isApi ? (
    <span className="pill" title="Schema declared; semantic audit of API data is future work">API · schema declared</span>
  ) : unverifiable ? (
    <span className="pill pill--warning" title="No reference model to compare against">Unverifiable model</span>
  ) : !a ? (
    <span className="pill pill--warning">Under review</span>
  ) : a.pass && !a.inconclusive ? (
    <span className="pill pill--positive">Passed</span>
  ) : (
    <span className="pill pill--warning">Inconclusive</span>
  );

  return (
    <article className={`card ${auditing ? 'card--auditing' : ''} ${preview ? 'card--preview' : ''}`} aria-label={l.name}>
      <header className="card__head">
        <h3>{l.name}</h3>
        {state}
      </header>
      <p className="card__claim">
        {isApi ? 'Contract' : 'Serves'} <code>{l.claimedModel || '—'}</code>
      </p>

      {a && !isApi && !unverifiable ? (
        <TrustMeter score={a.score}>
          <span className="meter__score">Trust {a.score}</span>
          <span className="meter__when">audited {ago(a.at, now)}</span>
        </TrustMeter>
      ) : underReview ? (
        <p className="card__note">Being checked by the auditor before anyone can buy.</p>
      ) : unverifiable ? (
        <p className="card__note card__note--warn">This model can&apos;t be checked by the auditor — buy at your own risk.</p>
      ) : null}

      {l.claimedModel === 'api:weather@1' && !preview && <WeatherFieldMatrix listing={l} />}
      {isApi && l.communityEnabled && !preview && <ListingCommunity compact listingId={l.id ?? l.provider} />}

      <div className="card__money">
        <p className="card__price">
          <span>{price(l.priceAtomic)}</span> / request
        </p>
        <p className="card__stake">{`Staked ${usdc(l.stakeAtomic)} USDC`}</p>
      </div>
      <button className="btn btn--secondary" onClick={() => onTry?.(l)} disabled={!l.active || underReview || preview}>
        {l.claimedModel === 'api:weather@1' ? 'Try weather API' : 'Try it'}
      </button>
    </article>
  );
}
