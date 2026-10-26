'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '../../components/WalletContext.tsx';
import { signTransaction } from '../../lib/wallet.ts';
import { txUrl, usdc, type ApiListing } from '../../lib/types.ts';
import type { DashboardAudit, DashboardEvent, DashboardSnapshot } from '../../lib/dashboard.ts';
import { CommunityWorkspace } from '../../components/CommunityWorkspace.tsx';

const usd = (amount: string) => usdc(amount).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
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

const evidenceValue = (value: unknown) => value === undefined || value === null ? 'Missing' : typeof value === 'number' ? String(Math.round(value * 1e6) / 1e6) : String(value);

function AuditHistory({ audits }: { audits: DashboardAudit[] }) {
  if (!audits.length) return <p className="dash-blank">No audit results for your listings yet.</p>;
  return <div className="audit-evidence-list">{audits.slice(0, 8).map((audit, index) => {
    const state = audit.inconclusive ? 'Inconclusive'
      : audit.slashTx ? (audit.pauseTx ? 'Slashed & paused' : 'Slashed; pause pending')
      : audit.warning ? (audit.warning.level >= audit.warning.threshold ? 'Slash pending' : `Warning ${audit.warning.level}/${audit.warning.threshold - 1}`)
      : audit.weather ? (audit.pass ? 'Reference within threshold' : 'Reference disagreement — review required')
      : audit.pass ? 'Verified' : 'Failed';
    return <article className={`audit-evidence ${audit.warning || audit.slashTx ? 'audit-evidence--warning' : audit.pass ? 'audit-evidence--pass' : ''}`} key={`${audit.at}-${index}`}>
      <header><span className={`audit-score ${audit.pass ? 'audit-score--pass' : 'audit-score--fail'}`}>{audit.score}</span><div><b>{audit.name}</b><small>{new Date(audit.at).toLocaleString()} · {state}</small></div></header>
      {audit.weather && <details><summary>View MET Norway evidence</summary><div className="audit-evidence__source"><span>Reference: <a href={audit.weather.referenceUrl} target="_blank" rel="noreferrer">{audit.weather.source} ↗</a></span>{audit.weather.extraFields.length > 0 && <span>Unverified extras: {audit.weather.extraFields.join(', ')}</span>}</div>
        <p className="muted">{audit.weather.scoringVersion === 'distance-v1' ? 'Exact values earn 100. An error equal to the field tolerance earns 80; larger errors lower the score toward 0. The overall grade is the average, rounded down. At least 80 is required to pass.' : 'This historical audit used the previous grade: 100 meant all compared fields were within tolerance. Run a new audit to get a grade that reflects the size of each difference.'}</p>
        {audit.weather.probes.map((probe) => <section className="audit-probe" key={probe.id}><h4>{probe.id} · {probe.request.latitude}, {probe.request.longitude} · +{probe.request.forecastHours}h</h4>{probe.status === 'error' ? <p className="muted">Excluded: {probe.error}</p> : <div className="audit-evidence-table" role="table"><div className="audit-evidence-table__head" role="row"><b>Field</b><b>Provider</b><b>MET Norway</b><b>Result</b></div>{probe.fields.map((field) => <div role="row" key={field.id}><code>{field.id}</code><span>{evidenceValue(field.providerValue)}</span><span>{evidenceValue(field.referenceValue)}</span><b className={field.pass ? 'is-good' : 'is-bad'}>{field.reason ?? (field.pass ? 'Within tolerance' : 'Contradiction')}<small>{field.score === undefined ? '' : `${field.score}/100 · `}{field.delta === undefined ? '' : `Δ ${field.delta} · `}Tolerance: {field.tolerance}</small></b></div>)}</div>}</section>)}
      </details>}
      {(audit.slashTx || audit.pauseTx) && <p className="audit-evidence__chain">{audit.slashTx && <a href={txUrl(audit.slashTx)} target="_blank" rel="noreferrer">Slash transaction ↗</a>}{audit.pauseTx && <> · <a href={txUrl(audit.pauseTx)} target="_blank" rel="noreferrer">Pause transaction ↗</a></>}</p>}
      {audit.warning && !audit.slashTx && audit.warning.level === audit.warning.threshold && <p className="muted">The failure threshold was reached, but the onchain slash or pause did not complete. Check the auditor log before retrying.</p>}
      {audit.error && <p className="field__error">Onchain action failed: {audit.error}</p>}
    </article>;
  })}</div>;
}

export default function DashboardPage() {
  const wallet = useWallet();
  const [tab,setTab]=useState<'provider'|'buyer'|'community'>('provider');
  const [unread,setUnread]=useState(0);
  useEffect(()=>{setUnread(0);setTab('provider');},[wallet.address]);
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
  if (!wallet.address) return <section className="dashboard-empty"><span className="dash-orb">◆</span><h1>Your Middlemate dashboard</h1><p>Connect a Stellar wallet to see your provider earnings, stake, purchases, and activity in one place.</p><button className="btn" onClick={wallet.connect}>Connect wallet</button></section>;
  if (!data) return error
    ? <section className="dashboard-empty"><h1>Your dashboard</h1><p className="empty--error">{error}</p><button className="btn" onClick={load}>Retry connection</button></section>
    : <p className="empty">Loading your dashboard…</p>;
  return <div className="dashboard">
    <header className="dashboard__heading"><div><span className="eyebrow">Personal workspace</span><h1>Your dashboard</h1><p className="muted mono">{wallet.address}</p></div><span className={`badge ${data?.registryMode === 'onchain' ? 'badge--green' : 'badge--amber'}`}>{data?.registryMode === 'onchain' ? 'STELLAR TESTNET · ONCHAIN REGISTRY' : 'OFFCHAIN REGISTRY'}</span></header>
    {error && <p className="empty--error">{error}</p>}
    {lastTx && <p role="status">Transaction confirmed · <a href={txUrl(lastTx)} target="_blank" rel="noreferrer">View transaction ↗</a></p>}
    {data.activityError && <p className="demo-notice" role="status">{data.activityError}</p>}

    <nav className="tabs dashboard-tabs" role="tablist" aria-label="Dashboard sections">
      {([['provider','Provider studio'],['buyer','Buyer activity'],['community','Community']] as const).map(([id,label])=><button key={id} type="button" id={`tab-${id}`} role="tab" aria-selected={tab===id} aria-controls={`panel-${id}`} className={`tab ${tab===id?'is-active':''}`} onClick={()=>setTab(id)}>{label}{id==='community'&&unread>0&&<span className="notification-count" aria-label={`${unread} unread community events`}>{unread}</span>}</button>)}
    </nav>
    <section role="tabpanel" id="panel-provider" aria-labelledby="tab-provider" hidden={tab!=='provider'} className="dash-provider">
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
        <section className="dash-panel"><div className="dash-panel__head"><div><h3>Provider activity</h3><p className="muted">Confirmed USDC transfers to your registered provider wallet, read from Stellar RPC.</p></div></div>{data.payoutNotice && <p className="muted">{data.payoutNotice}</p>}{data?.provider.events.length ? <div className="dash-activity">{data.provider.events.slice(0, 8).map((event) => <ActivityRow key={event.id} event={event} side="earned" />)}</div> : <p className="dash-blank">No confirmed USDC transfers to your provider wallet in the last 7 days.</p>}</section>
        <section className="dash-panel"><div className="dash-panel__head"><div><h3>Trust & audits</h3><p className="muted">MET Norway concordance and technical evidence. API disagreements and votes never automatically slash; moderation decisions appear in the community workspace.</p></div></div><AuditHistory audits={data.audits} /></section>
      </div>
    </section>

    <section role="tabpanel" id="panel-buyer" aria-labelledby="tab-buyer" hidden={tab!=='buyer'} className="dash-buyer"><div className="dash-section-head"><div><span className="eyebrow">Buyer activity</span><h2>Your usage & spend</h2></div></div>
      <div className="dash-buyer__grid"><MoneyChart title="Spend over time" amount={data.buyer.spentAtomic} series={data.buyer.daily} tint="blue" unavailable={!!data.activityError}/><div className="dash-buyer__summary"><div><span>Total spent</span><b>{data.activityError ? '—' : usd(data.buyer.spentAtomic)}</b></div><div><span>Payments sent</span><b>{data.activityError ? '—' : data.buyer.requests}</b></div><div><span>Average payment</span><b>{data.activityError ? '—' : data.buyer.requests ? usd(String(BigInt(data.buyer.spentAtomic) / BigInt(data.buyer.requests))) : '$0.00'}</b></div></div></div>
      <section className="dash-panel"><div className="dash-panel__head"><div><h3>Recent payments</h3><p className="muted">Confirmed USDC transfers from this wallet to marketplace providers or weather demo hosts.</p></div></div>{data?.buyer.events.length ? <div className="dash-activity">{data.buyer.events.slice(0, 10).map((event) => <ActivityRow key={event.id} event={event} side="spent" />)}</div> : <p className="dash-blank">No confirmed marketplace payments from this wallet in the last 7 days.</p>}</section>
    </section>
    <div role="tabpanel" id="panel-community" aria-labelledby="tab-community" hidden={tab!=='community'}><CommunityWorkspace address={wallet.address} listings={data.listings} onUnreadChange={setUnread} /></div>
  </div>;
}
