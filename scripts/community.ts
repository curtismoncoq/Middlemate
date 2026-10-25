import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, REPO_ROOT } from '@tb/config';
import { createCommunityStore } from '@tb/community';
import type { AuditRecord } from '../apps/auditor/src/runner.ts';

async function main() {
  const cfg=loadConfig();
  const db=createCommunityStore(cfg);
  if(!db)throw new Error('Add SUPABASE_URL and SUPABASE_SECRET_KEY to the root .env, then follow docs/supabase-setup.md.');
  if(process.argv[2]==='import-audits'){
    const records=JSON.parse(readFileSync(path.join(REPO_ROOT,'data/audits.json'),'utf8')) as AuditRecord[];
    let inserted=0;
    for(let offset=0;offset<records.length;offset+=100){
      const batch=records.slice(offset,offset+100).map(record=>({id:record.id,listing_id:record.listingId??record.provider,provider:record.provider,at:record.at,body:record}));
      if(batch.length)inserted+=(await db.insert('community_audits',batch,'namespace,id')).length;
    }
    console.log(`Imported ${inserted} audits into namespace ${db.namespace}. Existing rows were preserved. No stakes or payments changed.`);
    return;
  }
  await Promise.all((['community_calls','community_reviews','community_reports','community_decisions','community_audits','community_challenges','community_sessions'] as const).map(table=>db.rows(table,{limit:'1'})));
  console.log(`Supabase tables and server access are ready. Namespace: ${db.namespace}`);
  console.log(`Moderator wallets configured: ${cfg.moderatorWallets.length}. Provider response window: ${cfg.moderationResponseSeconds}s.`);
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Community setup failed.');process.exitCode=1;});
