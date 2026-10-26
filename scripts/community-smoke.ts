import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Keypair } from '@stellar/stellar-sdk';
import { loadConfig, REPO_ROOT } from '@tb/config';
import { createCommunityStore } from '@tb/community';
import { createRegistryClient } from '@tb/registry-client';
import { recordVerifiedCall } from '@tb/community/receipts';
import type { CommunityCall, Decision, Report } from '@tb/community/types';
import type { AuditRecord } from '../apps/auditor/src/runner.ts';

// Invoke the actual API handlers against the real database in a disposable namespace.
// NODE_OPTIONS=--conditions=react-server allows server-only route imports in this CLI.
const buyer=Keypair.random(),provider=Keypair.random(),moderator=Keypair.random(),outsider=Keypair.random();
const namespace=`smoke-${randomUUID()}`;
process.env.COMMUNITY_NAMESPACE=namespace;
process.env.MODERATOR_WALLETS=moderator.publicKey();
process.env.MODERATION_RESPONSE_SECONDS='0';
const cfg=loadConfig();
const db=createCommunityStore(cfg);
const origin='http://localhost:3000';
const cookies=new Map<string,string>();

async function main(){
  if(!db)throw new Error('Configure Supabase before running this smoke test.');
  const api=await import('../apps/web/app/api/community/route.ts');
  const post=async(body:unknown,wallet?:string,requestOrigin=origin)=>{
    const headers:Record<string,string>={'content-type':'application/json',origin:requestOrigin};
    if(wallet&&cookies.has(wallet))headers.cookie=cookies.get(wallet)!;
    return api.POST(new Request(`${origin}/api/community`,{method:'POST',headers,body:JSON.stringify(body)}));
  };
  const get=(view:string,wallet?:string)=>api.GET(new Request(`${origin}/api/community?${view}`,{headers:wallet?{cookie:cookies.get(wallet)??''}:{}}));
  const login=async(key:Keypair)=>{
    const challenge=await post({action:'challenge',wallet:key.publicKey()});
    assert.equal(challenge.status,200,'Challenge creation must succeed');
    const payload=await challenge.json() as {id:string;message:string};
    const digest=createHash('sha256').update(`Stellar Signed Message:\n${payload.message}`).digest();
    const bad=await post({action:'verify',id:payload.id,signature:(key.publicKey()===outsider.publicKey()?buyer:outsider).sign(digest).toString('base64')});
    assert.equal(bad.status,401,'Wrong signer must be rejected');
    const signed={action:'verify',id:payload.id,signature:key.sign(digest).toString('base64')};
    const verified=await post(signed);
    assert.equal(verified.status,200,'Wallet login must succeed');
    const cookie=verified.headers.get('set-cookie');
    assert.ok(cookie?.includes('HttpOnly'),'Session must be HttpOnly');
    cookies.set(key.publicKey(),cookie!.split(';')[0]);
    assert.equal((await post(signed)).status,401,'Used challenges must be rejected');
  };
  assert.equal((await get('view=workspace')).status,401,'Private workspace requires wallet authentication');
  assert.equal((await post({action:'challenge',wallet:buyer.publicKey()},undefined,'https://untrusted.example')).status,403,'Cross-origin writes must be rejected');
  for(const key of [buyer,provider,moderator,outsider])await login(key);
  console.log('PASS: wallet signatures, wrong-signer rejection, single-use challenges, HttpOnly sessions, origin checks.');

  const registry=await createRegistryClient(cfg).list();
  const apiFixture=registry.find(listing=>listing.claimedModel.startsWith('api:'));
  if(!apiFixture)throw new Error('Register an API listing before the community smoke test.');
  const base={listing_id:apiFixture.id??apiFixture.provider,listing_name:'Smoke fixture',provider:provider.publicKey(),buyer:buyer.publicKey(),endpoint:'https://weather.example/forecast',amount_atomic:'50000',source:'human',response_ok:true,schema_valid:true,fields_present:true,status_code:200,request_hash:'smoke',at:new Date().toISOString()};
  const [call]=await db.insert<CommunityCall>('community_calls',{...base,tx_hash:createHash('sha256').update(namespace).digest('hex')});
  assert.equal((await post({action:'review',callId:call.id,vote:1,comment:'Smoke test review'},outsider.publicKey())).status,409,'Another buyer cannot review this call');
  assert.equal((await post({action:'review',callId:call.id,vote:1,comment:'Useful forecast'},buyer.publicKey())).status,409,'Synthetic mismatched provider receipts must be rejected by the API');
  // Isolated fixture rows exercise SQL eligibility and replies without a new payment.
  await db.rpc('community_save_review',{p_wallet:buyer.publicKey(),p_call_id:call.id,p_vote:1,p_reason:'',p_comment:'Useful forecast'});
  assert.equal((await post({action:'review',callId:call.id,vote:-1,reason:'accuracy',comment:'Edit without new call'},buyer.publicKey())).status,409,'A new call is required to edit');
  await db.rpc('community_create_report',{p_wallet:buyer.publicKey(),p_call_id:call.id,p_reason:'missing_fields',p_description:'Smoke test: a promised field was absent.',p_response_seconds:0});
  const reports=await db.rows<Report>('community_reports',{listing_id:`eq.${base.listing_id}`} );
  assert.equal(reports.length,1);
  const report=reports[0];
  const outsiderView=await (await get('view=workspace',outsider.publicKey())).json() as {reports:Report[]};
  assert.equal(outsiderView.reports.length,0,'Unrelated wallets must not see private reports');
  assert.equal((await post({action:'report_reply',id:report.id,reply:'Not my listing'},buyer.publicKey())).status,403);
  assert.equal((await post({action:'report_reply',id:report.id,reply:'Provider investigated this problem.'},provider.publicKey())).status,200);
  const publicView=await (await get(`view=listing&listingId=${base.listing_id}`)).json() as {positive:number;total:number};
  assert.equal(publicView.positive,1);assert.equal(publicView.total,1);
  assert.ok(!JSON.stringify(publicView).includes(report.description),'Private report text must not leak into public reputation');
  const providerWorkspace=await (await get('view=workspace',provider.publicKey())).json() as {unreadKeys:string[]};
  assert.equal(providerWorkspace.unreadKeys.length,2,'Provider sees its review and report as unread');
  assert.equal((await post({action:'mark_read',keys:providerWorkspace.unreadKeys},outsider.publicKey())).status,403,'Other wallets cannot acknowledge provider events');
  assert.equal((await post({action:'mark_read',keys:providerWorkspace.unreadKeys},provider.publicKey())).status,200);
  await login(provider);
  const afterLogin=await (await get('view=workspace',provider.publicKey())).json() as {unreadKeys:string[]};
  assert.equal(afterLogin.unreadKeys.length,0,'Read state survives a new wallet session');
  console.log('PASS: provider notifications, ownership checks and persisted acknowledgement across sessions.');
  console.log('PASS: review eligibility, edit prevention, public reputation, private report isolation and provider-only responses.');

  const [decision]=await db.insert<Decision>('community_decisions',{report_id:report.id,listing_id:base.listing_id,provider:base.provider,moderator:moderator.publicKey(),action:'warning',note:'Smoke test moderation decision in an isolated namespace.'});
  const claimed=await db.rpc<Decision>('community_claim_decision',{p_id:decision.id,p_moderator:moderator.publicKey()});
  assert.equal(claimed.id,decision.id,'PostgREST composite decision must be decoded correctly');
  assert.equal(claimed.status,'executing');
  await db.rpc('community_complete_decision',{p_id:decision.id});
  assert.equal((await db.rows<Report>('community_reports',{id:`eq.${report.id}`}))[0].status,'confirmed');
  console.log('PASS: shared moderation locking and completion (database warning only; no chain sanction).');

  const local=JSON.parse(readFileSync(path.join(REPO_ROOT,'data/audits.json'),'utf8')) as AuditRecord[];
  const audit=local.find(record=>record.weather&&!record.verdict.inconclusive&&record.probes.some(probe=>probe.status==='ok'&&probe.txHash)&&registry.some(listing=>(listing.id??listing.provider)===(record.listingId??record.provider)));
  if(audit){
    const listing=registry.find(listing=>(listing.id??listing.provider)===(audit.listingId??audit.provider))!;
    const probe=audit.probes.find(probe=>probe.status==='ok'&&probe.txHash);
    if(!probe||probe.status!=='ok'||!probe.txHash)throw new Error('Missing audit payment evidence.');
    const body={schema:'api:weather@1',availableFields:[],location:{},forecast:{}};
    const receipt=await recordVerifiedCall(db,cfg,{listing,txHash:probe.txHash!,source:'audit',status:200,requestText:'smoke: existing audit evidence',responseText:JSON.stringify(body)});
    assert.equal(receipt.provider,listing.provider);
    await assert.rejects(()=>db.rpc('community_save_review',{p_wallet:receipt.buyer,p_call_id:receipt.id,p_vote:1,p_reason:'',p_comment:'Auditor cannot vote'}),/Verified/);
    console.log('PASS: receipt verification against an existing confirmed Stellar payment; auditor receipts cannot vote.');
  } else console.log('SKIP: no suitable existing audit transaction for read-only receipt verification.');
}

async function cleanup(){
  if(!db)return;
  const headers:Record<string,string>={apikey:cfg.supabaseSecretKey!};
  if(cfg.supabaseSecretKey!.startsWith('eyJ'))headers.authorization=`Bearer ${cfg.supabaseSecretKey}`;
  for(const table of ['community_reads','community_decisions','community_reports','community_reviews','community_calls','community_audits','community_sessions','community_challenges']){
    const response=await fetch(`${new URL(cfg.supabaseUrl!).origin}/rest/v1/${table}?${new URLSearchParams({namespace:`eq.${namespace}`})}`,{method:'DELETE',headers});
    if(!response.ok)throw new Error(`Could not clean up ${table} in the smoke namespace (HTTP ${response.status}).`);
  }
  console.log('Smoke namespace cleaned up. Shared demo data and Stellar balances were preserved.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Community smoke test failed.');process.exitCode=1;}).finally(()=>cleanup().catch(error=>{console.error(error instanceof Error?error.message:'Cleanup failed.');process.exitCode=1;}));
