import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({model:'llama3.2:3b',rpc:vi.fn(async()=>({saved:true}))}));
vi.mock('@tb/registry-client',()=>({createRegistryClient:()=>({list:async()=>[{id:'service',provider:'owner',claimedModel:state.model}]})}));
vi.mock('../lib/community-server.ts',()=>({
 communityConfig:{},sameOrigin:()=>{},requireWallet:async()=> 'buyer',database:()=>({rows:async()=>[{listing_id:'service',provider:'owner'}],rpc:state.rpc}),
 communityError:(error:Error&{status?:number})=>Response.json({error:error.message},{status:error.status??400}),
 uuid:(value:unknown)=>value,text:(value:unknown)=>value,isModerator:()=>false,
 challenge:vi.fn(),consumeChallenge:vi.fn(),createSession:vi.fn(),sessionWallet:vi.fn(),walletAddress:vi.fn(),
}));
import { POST } from '../app/api/community/route.ts';
beforeEach(()=>{state.model='llama3.2:3b';state.rpc.mockClear();});
const post=(action:string)=>POST(new Request('http://localhost:3000/api/community',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,callId:'paid-call',vote:1,reason:'accuracy',description:'Incorrect forecast values',comment:''})}));
it.each(['review','report'])('rejects %s for inference even with a paid receipt',async action=>{
 const result=await post(action);
 expect(result.status).toBe(409);
 expect(state.rpc).not.toHaveBeenCalled();
});
it('keeps verified API reviews available',async()=>{
 state.model='api:weather@1';
 expect((await post('review')).status).toBe(200);
 expect(state.rpc).toHaveBeenCalledWith('community_save_review',expect.objectContaining({p_wallet:'buyer'}));
});
