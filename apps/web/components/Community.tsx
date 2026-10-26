'use client';
import { useEffect, useRef, useState } from 'react';
import type { Reputation } from '@tb/community/types';
import { communityAction, communityJson, postCommunity } from '../lib/community-client.ts';
import { useWallet } from './WalletContext.tsx';
import { txUrl } from '../lib/types.ts';

export function ThumbIcon({down=false}:{down?:boolean}) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={down?{transform:'rotate(180deg)'}:undefined}><path d="M7 10v12H3V10h4Zm0 0 5-8a3 3 0 0 1 2 3l-1 5h6a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2H7"/></svg>;
}

export const REASONS = [ ['technical','Technical error'],['accuracy','Inconsistent data'],['missing_fields','Missing promised fields'],['value','Unsatisfactory experience'],['other','Other'] ];
const short = (wallet: string) => `${wallet.slice(0,5)}…${wallet.slice(-4)}`;

export function ListingCommunity({listingId,compact=false}:{listingId:string;compact?:boolean}) {
  const [data,setData] = useState<Reputation|null>(null);
  const [error,setError] = useState('');
  useEffect(()=>{
    let cancelled=false;
    const load=()=>communityJson<Reputation>(`/api/community?view=listing&listingId=${encodeURIComponent(listingId)}`).then(value=>{if(!cancelled){setData(value);setError('');}}).catch(()=>{if(!cancelled)setError('Community reputation is temporarily unavailable.');});
    void load(); const timer=setInterval(load,30000); window.addEventListener('community-updated',load);
    return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('community-updated',load);};
  },[listingId]);
  if(error)return <p className="muted">{error}</p>;
  if(!data)return <p className="muted">Loading verified reviews…</p>;
  return <section className="community-summary" aria-label="User reputation and observed reliability">
    <div className="community-thumbs"><span className="thumb-green" aria-label={`${data.positive} positive reviews`}><ThumbIcon/> {data.positive}</span><span className="thumb-red" aria-label={`${data.negative} negative reviews`}><ThumbIcon down/> {data.negative}</span><small className="muted">{data.total ? `${data.total} verified ${data.total===1?'review':'reviews'}` : 'No reviews yet'}</small></div>
    {!compact&&<details><summary>Details</summary>
      <p className="muted">{data.samples ? `${data.samples} paid samples · ${data.responseSuccessPct}% successful responses` : 'No paid samples yet.'}{data.schemaValidPct!==null&&` · ${data.schemaValidPct}% valid format`}{data.fieldsPresentPct!==null&&` · ${data.fieldsPresentPct}% promised fields returned`}</p>
      {data.reviews.length===0&&<p className="muted">Reviews become available after a verified paid call.</p>}
      {data.reviews.slice(0,20).map(review=><article className="community-item" key={review.id}><b className={review.vote===1?'thumb-green':'thumb-red'}><ThumbIcon down={review.vote===-1}/> {review.vote===1?'Satisfactory':'Unsatisfactory'}</b><small>{short(review.buyer)} · {new Date(review.updated_at).toLocaleString()}</small>{review.reason&&<p>{REASONS.find(([id])=>id===review.reason)?.[1]??review.reason}</p>}{review.comment&&<p>{review.comment}</p>}{review.provider_reply&&<blockquote>Provider response: {review.provider_reply}</blockquote>}</article>)}
      {data.decisions.map(decision=><article className="community-item" key={decision.id}><b>{decision.action.replace('_',' ')} · {new Date(decision.created_at).toLocaleString()}</b><p>{decision.note}</p>{decision.slash_tx&&<a href={txUrl(decision.slash_tx)} target="_blank" rel="noreferrer">Slash transaction ↗</a>}{decision.pause_tx&&<> · <a href={txUrl(decision.pause_tx)} target="_blank" rel="noreferrer">Pause transaction ↗</a></>}</article>)}
    </details>}
  </section>;
}

export function CallActions({callId,receiptError,proof}:{callId?:string;receiptError?:string;proof?:string}) {
  const wallet=useWallet();
  const [id,setId]=useState(callId);
  const formRef=useRef<HTMLFormElement>(null);
  const [mode,setMode]=useState<'review'|'report'|null>(null);
  useEffect(()=>{if(mode)formRef.current?.scrollIntoView?.({block:'nearest',behavior:'smooth'});},[mode]);
  useEffect(()=>{setId(callId);setMode(null);setMessage('');},[callId]);
  const [vote,setVote]=useState<1|-1>(1);
  const [reason,setReason]=useState('technical');
  const [comment,setComment]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const run=async(action:()=>Promise<unknown>)=>{setBusy(true);setMessage('');try{await action();}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}};
  if(!id)return receiptError?<div className="call-actions"><p className="field__error">{receiptError}</p>{proof&&<button className="btn btn--outline" disabled={busy} onClick={()=>run(async()=>{const result=await postCommunity({action:'recover_receipt',proof});setId(result.id);setMessage('Receipt saved.');})}>Save receipt without paying again</button>}{message&&<p role="status">{message}</p>}</div>:null;
  return <section className="call-actions" aria-label="Feedback after paid use"><div className="community-actions"><button type="button" className="btn btn--outline" onClick={()=>{setMode('review');setComment('');}}>Give a verified review</button><button type="button" className="btn btn--ghost" onClick={()=>{setMode('report');setComment('');}}>Report a problem</button></div>
    {mode&&<form ref={formRef} onSubmit={event=>{event.preventDefault();void run(async()=>{
      if(!wallet.address)throw new Error('Connect the buyer wallet first.');
      await communityAction(wallet.address,mode==='review'?{action:'review',callId:id,vote,reason,comment}:{action:'report',callId:id,reason,description:comment});
      setMode(null);setMessage(mode==='review'?'Review saved. One active review per wallet and listing.':'Report received. Track it in your dashboard.');
    });}}>
      <h4>{mode==='review'?'How was your experience?':'Report a specific problem'}</h4>
      {mode==='review'&&<div className="community-actions"><button type="button" className={`btn btn--outline thumb-green ${vote===1?'is-selected':''}`} aria-pressed={vote===1} onClick={()=>setVote(1)}><ThumbIcon/> Satisfactory</button><button type="button" className={`btn btn--outline thumb-red ${vote===-1?'is-selected':''}`} aria-pressed={vote===-1} onClick={()=>setVote(-1)}><ThumbIcon down/> Unsatisfactory</button></div>}
      {(mode==='report'||vote===-1)&&<label className="field">Reason<select value={reason} onChange={event=>setReason(event.target.value)}>{REASONS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
      <label className="field">{mode==='report'?'Describe the problem (private to the case participants)':'Public comment (optional)'}<textarea value={comment} minLength={mode==='report'?10:undefined} maxLength={mode==='report'?3000:1000} required={mode==='report'} onChange={event=>setComment(event.target.value)} /></label>
      <p className="muted">{mode==='review'?'A new paid call is required to change an existing review. Votes never trigger slashing.':'This call and its payment will be attached. An auditor examines the evidence and the provider can respond.'}</p>
      <button className="btn btn--outline" disabled={busy}>{busy?'Confirm in wallet…':mode==='review'?'Publish review':'Submit report'}</button> <button type="button" className="btn btn--ghost" onClick={()=>setMode(null)}>Cancel</button>
    </form>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
