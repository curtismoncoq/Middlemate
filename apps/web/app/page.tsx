'use client';
import { useEffect, useState } from 'react';
import { Catalog } from '../components/Catalog.tsx';
import { TryItPanel } from '../components/TryItPanel.tsx';
import { useWallet } from '../components/WalletContext.tsx';
import type { ApiListing, CatalogState } from '../lib/types.ts';

const POLL_MS = 3000;

export default function CatalogPage() {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  const [now, setNow] = useState(() => Date.now());
  const [auditing, setAuditing] = useState(false);
  const [trying, setTrying] = useState<ApiListing | null>(null);
  const wallet = useWallet();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/listings', { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        setState(r.ok ? { status: 'ok', listings: j.listings } : { status: 'error', message: j.error ?? `HTTP ${r.status}` });
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
    setAuditing(true);
    try {
      await fetch('/api/audit/run', { method: 'POST', body: '{}' });
    } finally {
      setAuditing(false);
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
        <button className="btn btn--audit" onClick={runAudit} disabled={auditing}>
          {auditing ? 'Auditing… probes in flight' : 'Run audit now'}
        </button>
      </section>
      <Catalog state={state} now={now} onTry={setTrying} />
      {trying && <TryItPanel key={trying.provider} listing={trying} pay={wallet.pay} onClose={() => setTrying(null)} />}
    </>
  );
}
