'use client';
import { useEffect, useState } from 'react';
import { Catalog, type CatalogFilter } from '../components/Catalog.tsx';
import { AuditFeed } from '../components/AuditFeed.tsx';
import { TryItPanel } from '../components/TryItPanel.tsx';
import { WeatherTryItPanel } from '../components/WeatherTryItPanel.tsx';
import { useWallet } from '../components/WalletContext.tsx';
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

  return (
    <>
      <section className="hero">
        <div>
          <h1>Pay per request. Trust what you get.</h1>
          <p>
            AI endpoints paid over <b>x402</b> on Stellar. Every provider stakes USDC in a Soroban registry, and a hidden auditor checks
            that they serve the model they claim. Liars lose their stake.
          </p>
        </div>
        <button className="btn btn--audit" onClick={runAudit} disabled={starting || audit.running}>
          {audit.running ? 'Audit in progress…' : starting ? 'Starting audit…' : 'Run audit now'}
        </button>
      </section>
      <AuditFeed status={audit} />
      <Catalog state={state} now={now} onTry={setTrying} audit={audit} filter={filter} onFilterChange={setFilter} />
      {trying && (trying.claimedModel === 'api:weather@1'
        ? <WeatherTryItPanel key={trying.provider} listing={trying} pay={wallet.pay} onClose={() => setTrying(null)} />
        : <TryItPanel key={trying.provider} listing={trying} pay={wallet.pay} onClose={() => setTrying(null)} />)}
    </>
  );
}
