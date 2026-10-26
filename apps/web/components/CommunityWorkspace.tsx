'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Decision, Report, Workspace } from '@tb/community/types';
import { communityAction, communityJson, ensureCommunitySession, moderate } from '../lib/community-client.ts';
import { txUrl, type ApiListing } from '../lib/types.ts';
import { ListingCommunity, REASONS, ThumbIcon } from './Community.tsx';

const open = (report: Report) => !['confirmed','dismissed','resolved'].includes(report.status);

function Reply({wallet,id,kind,initial,onSaved}:{wallet:string;id:string;kind:'review'|'report';initial:string;onSaved:()=>void}) {
  const [reply,setReply]=useState(initial);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  return <form className="community-reply" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await communityAction(wallet,{action:`${kind}_reply`,id,reply});onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
    <label className="field">{kind==='review'?'Public provider response':'Provider response for this private case'}<textarea required maxLength={kind==='review'?1000:3000} value={reply} onChange={event=>setReply(event.target.value)}/></label>
    <button className="btn btn--outline" disabled={busy}>{busy?'Saving…':'Save response'}</button>{error&&<p className="field__error">{error}</p>}
  </form>;
}

function Case({report,wallet,moderator,decisions,onSaved}:{report:Report;wallet:string;moderator:boolean;decisions:Decision[];onSaved:()=>void}) {
  const [action,setAction]=useState('request_response');
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const canModerate=moderator&&wallet!==report.buyer&&wallet!==report.provider&&open(report);
  const pending=decisions.some(decision=>['prepared','executing'].includes(decision.status));
  const run=async(body:unknown)=>{setBusy(true);setError('');try{await moderate(wallet,body);onSaved();}catch(e){setError((e as Error).message);onSaved();}finally{setBusy(false);}};
  return <article className="community-case"><header><div><b>{report.listing_name}</b><small>Case {report.id.slice(0,8)} · {report.status.replaceAll('_',' ')} · {new Date(report.created_at).toLocaleString()}</small></div><span className="badge badge--amber">{report.reason.replaceAll('_',' ')}</span></header>
    <p>{report.description}</p>{report.origin==='audit'&&<p className="muted">Automated comparison case · audit {report.audit_id}. See the MET Norway evidence in Trust & audits.</p>}<p className="muted">Provider response deadline: {new Date(report.response_deadline).toLocaleString()}. A warning or slash requires a response or expiry of this period.</p>
    {report.provider_reply&&<blockquote>Provider response: {report.provider_reply}</blockquote>}
    {wallet===report.provider&&open(report)&&<Reply wallet={wallet} id={report.id} kind="report" initial={report.provider_reply} onSaved={onSaved}/>}
    {decisions.map(decision=><div className="community-item" key={decision.id}><b>{decision.action.replaceAll('_',' ')} · {decision.status}</b><p>{decision.note}</p>{decision.slash_tx&&<a href={txUrl(decision.slash_tx)} target="_blank" rel="noreferrer">Slash transaction ↗</a>}{decision.pause_tx&&<> · <a href={txUrl(decision.pause_tx)} target="_blank" rel="noreferrer">Pause transaction ↗</a></>}{decision.error&&<p className="field__error">{decision.error}</p>}{canModerate&&decision.moderator===wallet&&['prepared','failed'].includes(decision.status)&&<button className="btn btn--outline" disabled={busy} onClick={()=>run({action:'moderate',retryId:decision.id})}>Resume this decision</button>}{canModerate&&decision.moderator===wallet&&decision.status==='prepared'&&<button className="btn btn--ghost" disabled={busy} onClick={async()=>{await communityAction(wallet,{action:'cancel_decision',id:decision.id});onSaved();}}>Cancel pending approval</button>}</div>)}
    {canModerate&&!pending&&<form onSubmit={event=>{event.preventDefault();void run({action:'moderate',reportId:report.id,decision:action,note});}}>
      <h4>Moderator decision</h4><label className="field">Action<select value={action} onChange={event=>setAction(event.target.value)}><option value="request_response">Request provider response</option><option value="dismiss">Dismiss report</option><option value="resolve">Resolved after correction</option><option value="warning">Confirm a warning</option><option value="pause">Suspend routing onchain</option><option value="slash">Slash stake and suspend onchain</option></select></label>
      <label className="field">Public decision reason<textarea required minLength={10} maxLength={2000} value={note} onChange={event=>setNote(event.target.value)} /></label>
      <p className="muted">Keep private case information out of this public reason. Chain actions require another wallet signature and are executed by the authorized auditor.</p>
      <button className="btn btn--outline" disabled={busy}>{busy?'Awaiting wallet or chain confirmation…':'Review & confirm decision'}</button>
    </form>}
    {moderator&&[report.buyer,report.provider].includes(wallet)&&<p className="muted">Another moderator must review this case because you are a participant.</p>}
    {error&&<p className="field__error" role="alert">{error}</p>}
  </article>;
}

export function CommunityWorkspace({address,listings,onUnreadChange}:{address:string;listings:ApiListing[];onUnreadChange?:(count:number)=>void}) {
  const [data,setData]=useState<Workspace|null>(null);
  const [enabled,setEnabled]=useState<boolean|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{onUnreadChange?.(data?.unreadKeys?.length??0);},[data,onUnreadChange]);
  const current=useRef(address);current.current=address;
  const load=useCallback(async()=>{
    const requested=address;
    const result=await communityJson<Workspace>('/api/community?view=workspace');
    if(current.current===requested&&result.wallet===requested)setData(result);
  },[address]);
  useEffect(()=>{
    let cancelled=false;
    setData(null);setError('');setEnabled(null);
    void communityJson<{enabled:boolean;wallet:string|null}>('/api/community?view=session').then(session=>{if(cancelled)return;setEnabled(session.enabled);if(session.wallet===address)void load().catch(e=>{if(!cancelled)setError(e.message);});}).catch(e=>{if(!cancelled)setError(e.message);});
    return()=>{cancelled=true;};
  },[address,load]);
  useEffect(()=>{
    if(!data)return;
    const refresh=()=>void load().catch(e=>setError(e.message));
    const timer=setInterval(refresh,10000);window.addEventListener('community-updated',refresh);
    return()=>{clearInterval(timer);window.removeEventListener('community-updated',refresh);};
  },[!!data,load]);
  const refresh=()=>void load().catch(e=>setError(e.message));
  const owned=listings.filter(listing=>listing.provider===address&&listing.claimedModel.startsWith('api:'));
  const apiIds=new Set(data?.apiListingIds??[]);
  return <section className="community-workspace">
    <div className="dash-section-head"><div><span className="eyebrow">Experience, evidence & accountability</span><h2>Community workspace</h2></div>{data&&<button className="btn btn--outline" disabled={busy||!data.unreadKeys?.length} onClick={async()=>{setBusy(true);setError('');try{await communityAction(address,{action:'mark_read',keys:data.unreadKeys.slice(0,500)});await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Saving…':'Mark as read'}</button>}</div>
    <p className="muted">User reputation, observed technical results and weather concordance are separate signals. Votes and weather differences never automatically slash an API provider.</p>
    {enabled===false&&<p className="dash-blank">Shared community features are not configured yet. Add the Supabase configuration described in the setup guide to enable verified call history, reviews and reports.</p>}
    {enabled&&owned.length>0&&<section className="dash-panel"><h3>Your APIs: reputation & observed results</h3>{owned.map(listing=>{
      return <article className="community-item" key={listing.id??listing.provider}><h4>{listing.name}</h4>{process.env.NEXT_PUBLIC_WEATHER_DEMO==='1'&&listing.claimedModel==='api:weather@1'&&/^http:\/\/(localhost|127\.0\.0\.1):(4003|4004|4005|4006)\//.test(listing.endpoint)&&<p className="muted">Weather demo using live MET Norway data. Testnet USDC payments go to the registered provider.</p>}{listing.claimedModel==='api:weather@1'&&<p>MET Norway concordance: {listing.lastAudit&&!listing.lastAudit.inconclusive?`${listing.lastAudit.score}/100`:'No comparable result yet'} · <span className="muted">Forecast agreement, not a fraud verdict</span></p>}<ListingCommunity listingId={listing.id??listing.provider}/></article>;
    })}</section>}
    {enabled&&!data&&<button className="btn btn--outline" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await ensureCommunitySession(address);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Confirm the message in Freighter…':'Verify wallet to view reviews & private cases'}</button>}
    {error&&<p className="field__error" role="alert">{error}</p>}
    {data&&<>
      {data.reviews.filter(review=>review.provider===address&&apiIds.has(review.listing_id)).length>0&&<section className="dash-panel"><h3>Respond to your customer reviews</h3>{data.reviews.filter(review=>review.provider===address&&apiIds.has(review.listing_id)).map(review=><article className="community-item" key={review.id}><b><ThumbIcon down={review.vote===-1}/> {review.vote===1?'Satisfactory':'Unsatisfactory'}</b><p>{REASONS.find(([id])=>id===review.reason)?.[1]} {review.comment}</p><Reply wallet={address} id={review.id} kind="review" initial={review.provider_reply} onSaved={refresh}/></article>)}</section>}
      <section className="dash-panel"><h3>{data.moderator?'Moderator queue & case history':'Your reports & provider cases'}</h3><p className="muted">Private evidence is visible only to the buyer, provider and configured moderators. Confirmed decisions are public.</p>{!data.reports.length&&<p className="dash-blank">No reports to display.</p>}{data.reports.map(report=><Case key={report.id} report={report} wallet={address} moderator={data.moderator} decisions={data.decisions.filter(decision=>decision.report_id===report.id)} onSaved={refresh}/>)}</section>
    </>}
  </section>;
}
