import { Account, Address, Asset, Contract, Keypair, nativeToScVal, Networks, Operation, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { loadConfig } from '@tb/config';
import { createCommunityStore, verifyWalletMessage } from '../src/index.ts';
import { recoverReceipt, receiptProof, verifySettlement } from '../src/receipts.ts';

afterEach(()=>vi.unstubAllGlobals());
it('verifies SEP-53 ownership signatures and rejects another wallet or modified message',()=>{
  const key=Keypair.random();const message='Middlemate\nOrigin: http://localhost:3000\nNonce: unique';
  const signature=key.sign(createHash('sha256').update(`Stellar Signed Message:\n${message}`).digest()).toString('base64');
  expect(verifyWalletMessage(key.publicKey(),message,signature)).toBe(true);
  expect(verifyWalletMessage(Keypair.random().publicKey(),message,signature)).toBe(false);
  expect(verifyWalletMessage(key.publicKey(),message+'changed',signature)).toBe(false);
});
it('uses the Supabase secret only on backend API headers, with namespace filters',async()=>{
  const fetcher=vi.fn(async()=>Response.json([]));vi.stubGlobal('fetch',fetcher);
  const db=createCommunityStore(loadConfig({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',COMMUNITY_NAMESPACE:'shared-dev'}))!;
  await db.rows('community_reports',{provider:'eq.GOWNER'});
  const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
  expect(new URL(url).searchParams.get('namespace')).toBe('eq.shared-dev');
  expect(new Headers(init.headers).get('apikey')).toBe('sb_secret_test');
  expect(new Headers(init.headers).has('authorization')).toBe(false);
});
it('binds a settlement to its actual payer, owner, token and maximum price',()=>{
  const buyer=Keypair.random().publicKey();const owner=Keypair.random().publicKey();
  const token=StrKey.encodeContract(Buffer.alloc(32,3));
  const cfg={networkPassphrase:Networks.TESTNET,usdcContract:token};
  const listing={id:'listing',provider:owner,name:'Weather',endpoint:'http://localhost:4003/weather/v1/forecast',claimedModel:'api:weather@1',priceAtomic:50000n};
  const build=(op:ReturnType<typeof Operation.payment>)=>new TransactionBuilder(new Account(buyer,'1'),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(op).setTimeout(30).build().toXDR();
  const envelope=build(new Contract(token).call('transfer',new Address(buyer).toScVal(),new Address(owner).toScVal(),nativeToScVal(50000n,{type:'i128'})));
  expect(verifySettlement(envelope,cfg,listing)).toMatchObject({buyer,provider:owner,amount_atomic:'50000'});
  expect(()=>verifySettlement(envelope,cfg,{...listing,provider:buyer})).toThrow(/owner/);
  expect(()=>verifySettlement(envelope,cfg,{...listing,priceAtomic:40000n})).toThrow(/price/);
  expect(()=>verifySettlement(build(Operation.payment({destination:owner,asset:Asset.native(),amount:'1'})),cfg,listing)).toThrow(/not an API payment/);
});
it('rejects altered and cross-namespace receipt recovery tokens before contacting Stellar',async()=>{
  const cfg=loadConfig({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',COMMUNITY_NAMESPACE:'one'});
  const db=createCommunityStore(cfg)!;
  const token=receiptProof(cfg,{listing_id:'listing',listing_name:'Weather',provider:'GOWNER',buyer:'GBUYER',endpoint:'http://weather',tx_hash:'a'.repeat(64),amount_atomic:'50000',source:'human',response_ok:true,schema_valid:true,fields_present:true,status_code:200,request_hash:'hash',at:new Date().toISOString()});
  await expect(recoverReceipt(db,{...cfg,communityNamespace:'two'},token)).rejects.toThrow(/expired/);
  await expect(recoverReceipt(db,cfg,token+'x')).rejects.toThrow(/Invalid/);
});
