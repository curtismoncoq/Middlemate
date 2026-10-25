import type { CommunityStore } from '@tb/community';
import type { AuditRecord, AuditStore } from './runner.ts';
import type { Config } from '@tb/config';

export async function databaseAuditStore(db: CommunityStore, cfg: Config): Promise<AuditStore> {
  let records: AuditRecord[] = [];
  const refresh = async () => { records = (await db.all<{body:AuditRecord}>('community_audits', { order: 'at.desc' })).map((row) => row.body); };
  await refresh();
  return {
    all: () => [...records], refresh,
    async add(record) {
      await db.insert('community_audits', { id: record.id, listing_id: record.listingId ?? record.provider, provider: record.provider, at: record.at, body: record }, 'namespace,id');
      records = [record, ...records.filter((row) => row.id !== record.id)];
      if (record.weather && !record.verdict.pass && !record.verdict.inconclusive) await db.rpc('community_open_audit_case', {p_audit_id:record.id,p_auditor:cfg.keys.auditor.public,p_response_seconds:cfg.moderationResponseSeconds});
    },
    clear() { throw new Error('Shared audits cannot be cleared by demo reset. Use a new COMMUNITY_NAMESPACE for a clean demo.'); },
  };
}
