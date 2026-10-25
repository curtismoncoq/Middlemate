'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Catalog, visibleListings, type CatalogFilter } from '../components/Catalog.tsx';
import { Stall } from '../components/Stall.tsx';
import { AuditFeed } from '../components/AuditFeed.tsx';
import { SLASH_LINE } from '../components/ListingCard.tsx';
import { TryItPanel } from '../components/TryItPanel.tsx';
import { WeatherTryItPanel } from '../components/WeatherTryItPanel.tsx';
import { useWallet } from '../components/WalletContext.tsx';
import { catalogSummary } from '../lib/catalog.ts';
import { streetStatus } from '../lib/stall.ts';
import { IDLE_AUDIT, type ApiListing, type AuditStatus, type CatalogState } from '../lib/types.ts';

const POLL_MS = 3000;

export default function CatalogPage() {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  const [now, setNow] = useState(() => Date.now());
  const [starting, setStarting] = useState(false);
  const [audit, setAudit] = useState<AuditStatus>(IDLE_AUDIT);
  const [trying, setTrying] = useState<ApiListing | null>(null);
  const [filter, setFilter] = useState<CatalogFilter>('all');
  const wallet = useWallet();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/listings', { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        setState(r.ok ? { status: 'ok', listings: j.listings } : { status: 'error', message: j.error ?? `HTTP ${r.status}` });
        if (r.ok) setAudit(j.audit ?? IDLE_AUDIT);
      } catch (e) {
        if (alive) setState({ status: 'error', message: (e as Error).message });
      }
      if (alive) setNow(Date.now());
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const runAudit = async () => {
    setStarting(true);
    try {
      await fetch('/api/audit/run', { method: 'POST', body: '{}' });
    } finally {
      setStarting(false); // progress now comes from the auditor's live status (polled with the listings)
    }
  };

  const listings = state.status === 'ok' ? state.listings : [];
  const s = state.status === 'ok' ? catalogSummary(listings) : null;
  const street = visibleListings(listings, now);
  const status = state.status === 'ok' ? streetStatus(listings, audit, now) : state.status === 'error' ? 'Registry unavailable, retrying.' : 'Opening the street…';

  return (
    <>
      <section className="stage hero">
        <p className="wordmark">TrustBazaar <span>Stellar Testnet</span></p>
        <h1 className="display">Pay per request.<br />Liars get slashed.</h1>
        <div className="street" aria-label="The stalls on the street">
          {street.length === 0 ? (
            <p className="street__empty">{state.status === 'ok' ? 'No stalls yet. List the first endpoint.' : status}</p>
          ) : (
            street.map((l, i) => (
              <Stall key={l.provider} listing={l} number={i * 2 + 1} auditing={audit.current?.provider === l.provider ? audit.current : undefined} />
            ))
          )}
        </div>
        <div className="hero__foot">
          <p className="hero__status">
            <b>{status}</b> AI endpoints paid per request over x402. Providers stake USDC, and a hidden auditor buys probes and slashes the ones that lie.
          </p>
          <div className="hero__actions">
            <Link className="btn btn--lime" href="/list">List an endpoint</Link>
            <button className="btn btn--outline" onClick={runAudit} disabled={starting || audit.running}>
              {audit.running ? 'Audit in progress…' : starting ? 'Starting audit…' : 'Run audit now'}
            </button>
          </div>
        </div>
      </section>

      <section className="stage ledger">
        <header className="ledger__head">
          <h2 className="display-2">Catalog</h2>
          <dl className="figures">
            <div><dt>Staked</dt><dd className="num">{s ? `${s.stakedUsdc.toLocaleString('en-US')}` : '—'}<small>USDC</small></dd></div>
            <div><dt>Passed audit</dt><dd className="num">{s ? s.passed : '—'}<small>{`of ${s ? s.live : '—'}`}</small></dd></div>
            <div><dt>Slashed</dt><dd className={`num ${s && s.slashed > 0 ? 'is-negative' : ''}`}>{s ? s.slashed : '—'}<small>{`below ${SLASH_LINE}`}</small></dd></div>
          </dl>
        </header>
        <AuditFeed status={audit} />
        <Catalog state={state} now={now} onTry={setTrying} audit={audit} filter={filter} onFilterChange={setFilter} />
      </section>
      {trying && (trying.claimedModel === 'api:weather@1'
        ? <WeatherTryItPanel key={trying.provider} listing={trying} pay={wallet.pay} onClose={() => setTrying(null)} />
        : <TryItPanel key={trying.provider} listing={trying} pay={wallet.pay} onClose={() => setTrying(null)} />)}
    </>
  );
}
