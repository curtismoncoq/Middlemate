'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '../../components/WalletContext.tsx';
import { signTransaction } from '../../lib/wallet.ts';
import { txUrl, usdc, type ApiListing } from '../../lib/types.ts';
import type { DashboardEvent, DashboardSnapshot } from '../../lib/dashboard.ts';

const usd = (amount: string) => `$${usdc(amount).toFixed(2)}`;
const shortDate = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function MoneyChart({ title, amount, series, tint, unavailable = false }: { title: string; amount: string; series: { date: string; amountAtomic: string }[]; tint: 'green' | 'blue'; unavailable?: boolean }) {
  const values = series.map((point) => Number(BigInt(point.amountAtomic)) / 1e7);
  const max = Math.max(...values, 0.000001);
  const points = values.map((value, index) => `${18 + index * (724 / Math.max(values.length - 1, 1))},${190 - value / max * 150}`);
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${point}`).join(' ');
  const area = `${path} L742,202 L18,202 Z`;
  const hasData = values.some((value) => value > 0);
  return <section className={`money-chart money-chart--${tint}`}>
    <div className="money-chart__head"><div><span className="eyebrow">Last 7 days · Stellar RPC</span><h2>{title}</h2></div><strong>{unavailable ? '—' : usd(amount)}</strong></div>
    <svg viewBox="0 0 760 230" role="img" aria-label={`${title} over the last 7 days`} className="money-chart__svg">
      {[40, 90, 140, 190].map((y) => <line key={y} x1="18" x2="742" y1={y} y2={y} className="chart-grid"/>)}
      {hasData && <><path d={area} className="chart-area"/><path d={path} className="chart-line"/><circle cx={points.at(-1)?.split(',')[0]} cy={points.at(-1)?.split(',')[1]} r="4" className="chart-dot"/></>}
      {!hasData && <line x1="18" x2="742" y1="190" y2="190" className="chart-empty-line"/>}
    </svg>
    <div className="money-chart__foot"><span>{shortDate(series[0]?.date ?? new Date().toISOString())}</span>{!hasData && <span>{unavailable ? 'Payment history unavailable' : 'No confirmed payments recorded yet'}</span>}<span>{shortDate(series.at(-1)?.date ?? new Date().toISOString())}</span></div>
  </section>;
}

function ActivityRow({ event, side }: { event: DashboardEvent; side: 'earned' | 'spent' }) {
  return <div className="dash-activity__row">
    <span className={`activity-icon activity-icon--${side}`}>{side === 'earned' ? '↓' : '↑'}</span>
    <div className="dash-activity__main"><b>{event.listingName}</b><small>{new Date(event.at).toLocaleString()} · Confirmed USDC transfer</small></div>
    <strong>{side === 'earned' ? '+' : '−'}{usd(event.amountAtomic)}</strong>
    {event.txHash && event.txHash !== 'simulated' && <a href={txUrl(event.txHash)} target="_blank" rel="noreferrer">↗</a>}
  </div>;
}

export default function DashboardPage() {
  const wallet = useWallet();
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stakeInput, setStakeInput] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const [lastTx, setLastTx] = useState<string | null>(null);
  const currentWallet = useRef(wallet.address);
  currentWallet.current = wallet.address;
  const requestSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const requestedWallet = wallet.address;
    if (!wallet.address) { setData(null); return; }
    try {
      const response = await fetch(`/api/dashboard?address=${encodeURIComponent(wallet.address)}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      if (currentWallet.current === requestedWallet && sequence === requestSequence.current) { setData(body); setError(null); }
    } catch (e) { if (currentWallet.current === requestedWallet && sequence === requestSequence.current) setError((e as Error).message); }
  }, [wallet.address]);
  useEffect(() => { setData(null); setError(null); void load(); const timer = setInterval(load, 10_000); return () => clearInterval(timer); }, [load]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);

  const runAction = async (listing: ApiListing, call: unknown) => {
    const key = listing.id ?? listing.provider;
    if (!wallet.address || listing.provider !== wallet.address) return;
    setBusy(key); setError(null); setLastTx(null);
    try {
      const post = async (body: unknown) => {
        const response = await fetch('/api/tx', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
        return result;
      };
      const built = await post({ action: 'build', publicKey: wallet.address, call });
      const signed = await signTransaction(built.xdr, wallet.address);
      const submitted = await post({ action: 'submit', xdr: signed });
      setLastTx(submitted.hash);
      setStakeInput((values) => ({ ...values, [key]: '' }));
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  const handleStake = (listing: ApiListing) => {
    const input = stakeInput[listing.id ?? listing.provider] ?? '';
    if (!/^\d+(?:\.\d{1,7})?$/.test(input)) { setError('Enter a positive USDC amount with at most 7 decimal places.'); return; }
    const [whole, fraction = ''] = input.split('.');
    const amount = BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, '0'));
    if (amount <= 0n) { setError('Stake must be positive.'); return; }
    void runAction(listing, { method: listing.id ? 'stakeEndpoint' : 'stake', args: { ...(listing.id ? { id: listing.id } : {}), amountAtomic: String(amount) } });
  };
  const rename = (listing: ApiListing) => {
    const name = window.prompt('Listing name', listing.name)?.trim();
    if (name && name !== listing.name) void runAction(listing, { method: 'renameEndpoint', args: { id: listing.id, name } });
  };
  const exit = (listing: ApiListing) => {
    if (window.confirm(listing.id ? `Remove ${listing.name}? The onchain grace period starts after wallet confirmation. Then confirm withdrawal to receive the remaining stake.` : `Remove ${listing.name} and refund ${usdc(listing.stakeAtomic)} USDC to your wallet? This legacy registry refunds immediately.`)) {
      void runAction(listing, { method: listing.id ? 'requestExit' : 'unregister', args: listing.id ? { id: listing.id } : { provider: listing.provider } });
    }
  };
  const withdraw = (listing: ApiListing) => {
    if (window.confirm(`Withdraw the remaining ${usdc(listing.stakeAtomic)} USDC from ${listing.name} to your connected wallet?`)) void runAction(listing, { method: 'withdrawEndpoint', args: { id: listing.id } });
  };

  if (wallet.restoring) return <p className="empty">Restoring wallet connection…</p>;
  if (!wallet.address) return <section className="dashboard-empty"><span className="dash-orb">◆</span><h1>Your TrustBazaar dashboard</h1><p>Connect a Stellar wallet to see your provider earnings, stake, purchases, and activity in one place.</p><button className="btn" onClick={wallet.connect}>Connect wallet</button></section>;
  if (!data) return error
    ? <section className="dashboard-empty"><h1>Your dashboard</h1><p className="empty--error">{error}</p><button className="btn" onClick={load}>Retry connection</button></section>
    : <p className="empty">Loading your dashboard…</p>;
  return <div className="dashboard">
    <header className="dashboard__heading"><div><span className="eyebrow">Personal workspace</span><h1>Your dashboard</h1><p className="muted mono">{wallet.address}</p></div><span className={`badge ${data?.registryMode === 'onchain' ? 'badge--green' : 'badge--amber'}`}>{data?.registryMode === 'onchain' ? 'STELLAR TESTNET · ONCHAIN REGISTRY' : 'OFFCHAIN REGISTRY'}</span></header>
    {error && <p className="empty--error">{error}</p>}
    {lastTx && <p role="status">Transaction confirmed · <a href={txUrl(lastTx)} target="_blank" rel="noreferrer">View transaction ↗</a></p>}
    {data.activityError && <p className="demo-notice" role="status">{data.activityError}</p>}
    {process.env.NEXT_PUBLIC_WEATHER_DEMO === '1' && <div className="demo-notice">Weather demo responses are synthetic fixtures. Requests settle real Testnet USDC to the fixture payout wallets. Dashboard activity below uses confirmed transfers to registered provider wallets.</div>}

    <section className="dash-provider">
      <div className="dash-section-head"><div><span className="eyebrow">Provider studio</span><h2>Revenue & operations</h2></div><span className="dash-live"><i/> Refreshes every 10 seconds</span></div>
      <div className="dash-provider__grid">
        <MoneyChart title="Provider earnings" amount={data?.provider.earningsAtomic ?? '0'} series={data?.provider.daily ?? []} tint="green" unavailable={!!data.activityError} />
        <aside className="dash-provider__stats">
          <div className="dash-stat dash-stat--featured"><span>Total staked</span><strong>{usd(data?.provider.stakeAtomic ?? '0')}</strong><small>Across {data?.listings.length ?? 0} listing{data?.listings.length === 1 ? '' : 's'}</small></div>
          <div className="dash-stat"><span>Confirmed payments received</span><strong>{data.activityError ? '—' : data.provider.requests}</strong></div>
          <div className="dash-stat"><span>Active listings</span><strong>{data?.listings.filter((item) => item.active && BigInt(item.stakeAtomic) > 0n).length ?? 0}<small> / {data?.listings.length ?? 0}</small></strong></div>
        </aside>
      </div>
      <section className="dash-panel"><div className="dash-panel__head"><div><h3>Your listings & stake</h3><p className="muted">Each listing has its own stake and service status.</p></div></div>
        <p className="muted">Earnings above are for the provider wallet. Each listing below has its own stake and controls.</p>
        {!data.listings.length ? <p className="dash-blank">No listings are registered to this wallet yet. <a href="/list">List an endpoint</a> to get started.</p> : <div className="provider-listings">{data.listings.map((listing) => {
          const key = listing.id ?? listing.provider;
          const exiting = !!listing.exitAt && !listing.retired;
          const remaining = Math.max(0, Math.ceil((listing.exitAt ?? 0) - now / 1000));
          return <article className="provider-listing" key={key}>
            <div className="provider-listing__identity"><span className="listing-glyph">{listing.claimedModel.startsWith('api:') ? 'API' : 'LLM'}</span><div><b>{listing.name}</b><small>{listing.claimedModel} · {Number(listing.priceAtomic) / 1e7} USDC / request</small><small className="mono">{listing.endpoint}</small>{listing.id && <small className="mono">Listing {listing.id.slice(0, 12)}…</small>}</div></div>
            <div className="provider-listing__metric"><span>Stake</span><b>{usdc(listing.stakeAtomic)} USDC</b></div>
            <span className={`badge ${listing.active ? 'badge--green' : 'badge--amber'}`}>{listing.retired ? 'REMOVED' : exiting ? remaining > 0 ? `EXIT IN ${remaining}s` : 'READY TO WITHDRAW' : listing.active ? 'ACTIVE' : 'PAUSED'}</span>
            {!listing.retired && listing.provider === wallet.address && <div className="provider-listing__controls">
              {!exiting && <><input aria-label={`Additional stake for ${listing.name}`} inputMode="decimal" placeholder="USDC" value={stakeInput[key] ?? ''} onChange={(e) => setStakeInput((values) => ({ ...values, [key]: e.target.value }))}/><button className="btn btn--ghost" disabled={!!busy || !stakeInput[key]} onClick={() => handleStake(listing)}>Add stake</button>{listing.id && <button className="btn btn--ghost" disabled={!!busy} onClick={() => rename(listing)}>Rename</button>}<button className="btn btn--ghost" disabled={!!busy} onClick={() => exit(listing)}>Remove & unstake</button></>}
              {exiting && (remaining > 0 ? <><span>Stake stays slashable during the onchain grace period.</span><button className="btn btn--ghost" disabled={!!busy} onClick={() => runAction(listing, { method: 'cancelExit', args: { id: listing.id } })}>Cancel removal</button></> : <button className="btn" disabled={!!busy} onClick={() => withdraw(listing)}>Withdraw {usdc(listing.stakeAtomic)} USDC</button>)}
              {busy === key && <small role="status">Confirm in wallet · waiting for Stellar confirmation…</small>}
            </div>}
            {exiting && <small className="provider-listing__limit">New routing stops when the onchain grace ends. Confirm withdrawal afterwards; the refund always goes to your wallet.</small>}
          </article>;
        })}</div>}
      </section>
      <div className="dash-lower-grid">
        <section className="dash-panel"><div className="dash-panel__head"><div><h3>Provider activity</h3><p className="muted">Confirmed USDC transfers to your registered provider wallet, read from Stellar RPC.</p></div></div>{data?.provider.events.length ? <div className="dash-activity">{data.provider.events.slice(0, 8).map((event) => <ActivityRow key={event.id} event={event} side="earned" />)}</div> : <p className="dash-blank">No confirmed USDC transfers to your provider wallet in the last 7 days.</p>}</section>
        <section className="dash-panel"><div className="dash-panel__head"><div><h3>Trust & audits</h3><p className="muted">Latest audit results for your listings.</p></div></div>{data?.audits.length ? <div className="audit-mini-list">{data.audits.slice(0, 5).map((audit, index) => <div key={`${audit.at}-${index}`}><span className={`audit-score ${audit.pass ? 'audit-score--pass' : 'audit-score--fail'}`}>{audit.score}</span><div><b>{audit.name}</b><small>{new Date(audit.at).toLocaleString()} · {audit.inconclusive ? 'Inconclusive' : audit.pass ? 'Passed' : 'Failed'}</small></div></div>)}</div> : <p className="dash-blank">No audit results for your listings yet.</p>}</section>
      </div>
    </section>

    <section className="dash-buyer"><div className="dash-section-head"><div><span className="eyebrow">Buyer activity</span><h2>Your usage & spend</h2></div></div>
      <div className="dash-buyer__grid"><MoneyChart title="Spend over time" amount={data.buyer.spentAtomic} series={data.buyer.daily} tint="blue" unavailable={!!data.activityError}/><div className="dash-buyer__summary"><div><span>Total spent</span><b>{data.activityError ? '—' : usd(data.buyer.spentAtomic)}</b></div><div><span>Payments sent</span><b>{data.activityError ? '—' : data.buyer.requests}</b></div><div><span>Average payment</span><b>{data.activityError ? '—' : data.buyer.requests ? usd(String(BigInt(data.buyer.spentAtomic) / BigInt(data.buyer.requests))) : '$0.00'}</b></div></div></div>
      <section className="dash-panel"><div className="dash-panel__head"><div><h3>Recent payments</h3><p className="muted">Confirmed USDC transfers from this wallet to registered marketplace providers.</p></div></div>{data?.buyer.events.length ? <div className="dash-activity">{data.buyer.events.slice(0, 10).map((event) => <ActivityRow key={event.id} event={event} side="spent" />)}</div> : <p className="dash-blank">No confirmed USDC transfers from this wallet to a registered marketplace provider in the last 7 days.</p>}</section>
    </section>
  </div>;
}
