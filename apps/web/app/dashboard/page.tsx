'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '../../components/WalletContext.tsx';
import { signTransaction } from '../../lib/wallet.ts';
import { txUrl, usdc } from '../../lib/types.ts';
import type { DashboardEvent, DashboardSnapshot } from '../../lib/dashboard.ts';

const usd = (amount: string) => `$${usdc(amount).toFixed(2)}`;
const shortDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function MoneyChart({ title, amount, series, tint }: { title: string; amount: string; series: { date: string; amountAtomic: string }[]; tint: 'green' | 'blue' }) {
  const values = series.map((point) => Number(BigInt(point.amountAtomic)) / 1e7);
  const max = Math.max(...values, 0.000001);
  const points = values.map((value, index) => `${18 + index * (724 / Math.max(values.length - 1, 1))},${190 - value / max * 150}`);
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${point}`).join(' ');
  const area = `${path} L742,202 L18,202 Z`;
  const hasData = values.some((value) => value > 0);
  return <section className={`money-chart money-chart--${tint}`}>
    <div className="money-chart__head"><div><span className="eyebrow">Last 7 days · Stellar RPC</span><h2>{title}</h2></div><strong>{usd(amount)}</strong></div>
    <svg viewBox="0 0 760 230" role="img" aria-label={`${title} over the last 7 days`} className="money-chart__svg">
      <defs><linearGradient id={`fill-${tint}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".22"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
      {[40, 90, 140, 190].map((y) => <line key={y} x1="18" x2="742" y1={y} y2={y} className="chart-grid"/>)}
      {hasData && <><path d={area} className="chart-area"/><path d={path} className="chart-line"/><circle cx={points.at(-1)?.split(',')[0]} cy={points.at(-1)?.split(',')[1]} r="4" className="chart-dot"/></>}
      {!hasData && <line x1="18" x2="742" y1="190" y2="190" className="chart-empty-line"/>}
    </svg>
    <div className="money-chart__foot"><span>{shortDate(series[0]?.date ?? new Date().toISOString())}</span>{!hasData && <span>No confirmed payments recorded yet</span>}<span>{shortDate(series.at(-1)?.date ?? new Date().toISOString())}</span></div>
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
  const load = useCallback(async () => {
    if (!wallet.address) { setData(null); return; }
    try {
      const response = await fetch(`/api/dashboard?address=${encodeURIComponent(wallet.address)}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setData(body); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [wallet.address]);
  useEffect(() => { void load(); const timer = setInterval(load, 30_000); return () => clearInterval(timer); }, [load]);

  const handleStake = async (provider: string) => {
    const amount = Number(stakeInput[provider]);
    if (!wallet.address || !(amount > 0)) return;
    setBusy(provider); setError(null);
    try {
      const amountAtomic = String(Math.round(amount * 1e7));
      const built = await fetch('/api/tx', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'build', publicKey: wallet.address, call: { method: 'stake', args: { amountAtomic } } }) }).then((r) => r.json());
      if (!built.xdr) throw new Error(built.error ?? 'Could not build stake transaction');
      const signed = await signTransaction(built.xdr, wallet.address);
      const submitted = await fetch('/api/tx', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'submit', xdr: signed }) }).then((r) => r.json());
      if (!submitted.hash) throw new Error(submitted.error ?? 'Stake transaction failed');
      setStakeInput((values) => ({ ...values, [provider]: '' }));
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  const listingEarned = useMemo(() => {
    const map = new Map<string, bigint>();
    for (const event of data?.provider.events ?? []) map.set(event.provider, (map.get(event.provider) ?? 0n) + BigInt(event.amountAtomic));
    return map;
  }, [data]);

  if (!wallet.address) return <section className="dashboard-empty"><span className="dash-orb">◆</span><h1>Your TrustBazaar dashboard</h1><p>Connect a Stellar wallet to see your provider earnings, stake, purchases, and activity in one place.</p><button className="btn" onClick={wallet.connect}>Connect wallet</button></section>;
  if (!data && !error) return <p className="empty">Loading your dashboard…</p>;
  return <div className="dashboard">
    <header className="dashboard__heading"><div><span className="eyebrow">Personal workspace</span><h1>Your dashboard</h1><p className="muted mono">{wallet.address}</p></div><span className={`badge ${data?.registryMode === 'onchain' ? 'badge--green' : 'badge--amber'}`}>{data?.registryMode === 'onchain' ? 'STELLAR TESTNET · ONCHAIN REGISTRY' : 'OFFCHAIN REGISTRY'}</span></header>
    {error && <p className="empty--error">{error}</p>}
    {process.env.NEXT_PUBLIC_WEATHER_DEMO === '1' && <div className="demo-notice">Weather demo responses are synthetic local fixtures. Requests to those fixtures use simulated payments and do not appear as earnings or spend. Listings and stake submitted through a wallet use the configured registry mode; activity shown below comes from confirmed USDC transfers on Stellar Testnet.</div>}

    <section className="dash-provider">
      <div className="dash-section-head"><div><span className="eyebrow">Provider studio</span><h2>Revenue & operations</h2></div><span className="dash-live"><i/> Refreshes every 30 seconds</span></div>
      <div className="dash-provider__grid">
        <MoneyChart title="Provider earnings" amount={data?.provider.earningsAtomic ?? '0'} series={data?.provider.daily ?? []} tint="green" />
        <aside className="dash-provider__stats">
          <div className="dash-stat dash-stat--featured"><span>Total staked</span><strong>{usd(data?.provider.stakeAtomic ?? '0')}</strong><small>Across {data?.listings.length ?? 0} listing{data?.listings.length === 1 ? '' : 's'}</small></div>
          <div className="dash-stat"><span>Paid requests served</span><strong>{data?.provider.requests ?? 0}</strong></div>
          <div className="dash-stat"><span>Active listings</span><strong>{data?.listings.filter((item) => item.active && BigInt(item.stakeAtomic) > 0n).length ?? 0}<small> / {data?.listings.length ?? 0}</small></strong></div>
        </aside>
      </div>
      <section className="dash-panel"><div className="dash-panel__head"><div><h3>Your listings & stake</h3><p className="muted">Each listing has its own stake and service status.</p></div></div>
        {!data?.listings.length ? <p className="dash-blank">No listings are registered to this wallet yet. Publish an endpoint to start building your provider dashboard.</p> : <div className="provider-listings">{data.listings.map((listing) => <article className="provider-listing" key={listing.provider}>
          <div className="provider-listing__identity"><span className="listing-glyph">{listing.claimedModel.startsWith('api:') ? '⌁' : '✳'}</span><div><b>{listing.name}</b><small>{listing.claimedModel} · {listing.priceAtomic ? `$${(Number(listing.priceAtomic) / 1e7).toFixed(4)} / request` : ''}</small></div></div>
          <div className="provider-listing__metric"><span>Stake</span><b>{usd(listing.stakeAtomic)}</b></div>
          <div className="provider-listing__metric"><span>Earned · 7d</span><b>{usd(String(listingEarned.get(listing.provider) ?? 0n))}</b></div>
          <div className="provider-listing__metric"><span>Requests · 7d</span><b>{data.provider.events.filter((event) => event.provider === listing.provider).length}</b></div>
          <span className={`badge ${listing.active ? 'badge--green' : 'badge--red'}`}>{listing.active ? 'ACTIVE' : 'PAUSED'}</span>
          {listing.provider === wallet.address && <div className="provider-listing__controls"><input aria-label={`Additional stake for ${listing.name}`} type="number" min="0.1" step="0.1" placeholder="USDC" value={stakeInput[listing.provider] ?? ''} onChange={(e) => setStakeInput((values) => ({ ...values, [listing.provider]: e.target.value }))}/><button className="btn btn--ghost" disabled={!!busy || !stakeInput[listing.provider]} onClick={() => handleStake(listing.provider)}>{busy === listing.provider ? 'Confirm in wallet…' : 'Add stake'}</button></div>}
          <small className="provider-listing__limit">To stop serving, disable this endpoint with its host. The deployed registry only lets the auditor pause a listing.</small>
        </article>)}</div>}
      </section>
      <div className="dash-lower-grid">
        <section className="dash-panel"><div className="dash-panel__head"><div><h3>Provider activity</h3><p className="muted">Confirmed USDC transfers to your registered provider wallet, read from Stellar RPC.</p></div></div>{data?.provider.events.length ? <div className="dash-activity">{data.provider.events.slice(0, 8).map((event) => <ActivityRow key={event.id} event={event} side="earned" />)}</div> : <p className="dash-blank">No confirmed USDC transfers to your provider wallet in the last 7 days.</p>}</section>
        <section className="dash-panel"><div className="dash-panel__head"><div><h3>Trust & audits</h3><p className="muted">Latest audit results for your listings.</p></div></div>{data?.audits.length ? <div className="audit-mini-list">{data.audits.slice(0, 5).map((audit, index) => <div key={`${audit.at}-${index}`}><span className={`audit-score ${audit.pass ? 'audit-score--pass' : 'audit-score--fail'}`}>{audit.score}</span><div><b>{audit.name}</b><small>{new Date(audit.at).toLocaleString()} · {audit.inconclusive ? 'Inconclusive' : audit.pass ? 'Passed' : 'Failed'}</small></div></div>)}</div> : <p className="dash-blank">No audit results for your listings yet.</p>}</section>
      </div>
    </section>

    <section className="dash-buyer"><div className="dash-section-head"><div><span className="eyebrow">Buyer activity</span><h2>Your usage & spend</h2></div></div>
      <div className="dash-buyer__grid"><MoneyChart title="Spend over time" amount={data?.buyer.spentAtomic ?? '0'} series={data?.buyer.daily ?? []} tint="blue"/><div className="dash-buyer__summary"><div><span>Total spent</span><b>{usd(data?.buyer.spentAtomic ?? '0')}</b></div><div><span>Successful calls</span><b>{data?.buyer.requests ?? 0}</b></div><div><span>Average per call</span><b>{data?.buyer.requests ? usd(String(BigInt(data.buyer.spentAtomic) / BigInt(data.buyer.requests))) : '$0.00'}</b></div></div></div>
      <section className="dash-panel"><div className="dash-panel__head"><div><h3>Recent requests</h3><p className="muted">Confirmed USDC transfers from this wallet to registered marketplace providers.</p></div></div>{data?.buyer.events.length ? <div className="dash-activity">{data.buyer.events.slice(0, 10).map((event) => <ActivityRow key={event.id} event={event} side="spent" />)}</div> : <p className="dash-blank">No confirmed USDC transfers from this wallet to a registered marketplace provider in the last 7 days.</p>}</section>
    </section>
  </div>;
}
