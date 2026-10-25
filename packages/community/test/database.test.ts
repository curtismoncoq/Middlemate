import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
let call: string;
beforeAll(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(readFileSync(new URL('../../../supabase/migrations/202610250001_community_trust.sql', import.meta.url), 'utf8'));
  const result = await db.query<{ id: string }>(`insert into community_calls(namespace,listing_id,listing_name,provider,buyer,endpoint,tx_hash,amount_atomic,source,response_ok,status_code,request_hash,at) values('test','listing','Weather','provider','buyer','http://weather',repeat('a',64),50000,'human',true,200,'hash',now()) returning id`);
  call = result.rows[0].id;
}, 30000);
afterAll(async () => db.close());

describe('shared community database rules', () => {
  it('allows one verified review, rejects replayed edits and cross-wallet/cross-namespace calls', async () => {
    await expect(db.query('select community_save_review($1,$2,$3,$4,$5,$6)', ['test','intruder',call,1,'',''])).rejects.toThrow(/Verified/);
    await expect(db.query('select community_save_review($1,$2,$3,$4,$5,$6)', ['other','buyer',call,1,'',''])).rejects.toThrow(/Verified/);
    await db.query('select community_save_review($1,$2,$3,$4,$5,$6)', ['test','buyer',call,1,'','Useful forecast']);
    await expect(db.query('select community_save_review($1,$2,$3,$4,$5,$6)', ['test','buyer',call,-1,'accuracy','Changed opinion'])).rejects.toThrow(/new paid call/);
    expect((await db.query('select * from community_reviews')).rows).toHaveLength(1);
  });

  it('keeps reports separate from votes and blocks premature, self and duplicate moderation', async () => {
    const created = await db.query<{ r: { id: string } }>('select to_jsonb(community_create_report($1,$2,$3,$4,$5,$6)) as r', ['test','buyer',call,'missing_fields','The promised temperature field was absent.',3600]);
    const report = created.rows[0].r.id;
    await expect(db.query('select community_create_report($1,$2,$3,$4,$5,$6)', ['test','buyer',call,'accuracy','Duplicate report for this call',3600])).rejects.toThrow(/unique/);
    const decision = await db.query<{ id: string }>(`insert into community_decisions(namespace,report_id,listing_id,provider,moderator,action,note) values('test',$1,'listing','provider','moderator','slash','Repeated paid responses omitted the promised field.') returning id`, [report]);
    const id = decision.rows[0].id;
    await expect(db.query('select community_claim_decision($1,$2,$3)', ['test',id,'intruder'])).rejects.toThrow(/unavailable/);
    await expect(db.query('select community_claim_decision($1,$2,$3)', ['test',id,'moderator'])).rejects.toThrow(/window/);
    await db.query("update community_reports set provider_reply='I have investigated this evidence.' where id=$1", [report]);
    await db.query('select community_claim_decision($1,$2,$3)', ['test',id,'moderator']);
    await expect(db.query('select community_claim_decision($1,$2,$3)', ['test',id,'moderator'])).rejects.toThrow(/already executing/);
    await expect(db.query('select community_complete_decision($1,$2)', ['test',id])).rejects.toThrow(/transactions/);
    await db.query("update community_decisions set slash_tx='slash',pause_tx='pause' where id=$1", [id]);
    await db.query('select community_complete_decision($1,$2)', ['test',id]);
    expect((await db.query<{status:string}>('select status from community_reports where id=$1', [report])).rows[0].status).toBe('confirmed');
  });

  it('denies anonymous reads of private tables and execution of mutation functions', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query('select * from community_reports')).rejects.toThrow(/permission denied/);
      await expect(db.query('select community_save_review($1,$2,$3,$4,$5,$6)', ['test','buyer',call,1,'',''])).rejects.toThrow(/permission denied/);
    } finally { await db.exec('reset role'); }
  });
});
