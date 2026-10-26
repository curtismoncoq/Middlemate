import 'server-only';
import { isVerifiable, loadConfig, verifiableModels } from '@tb/config';
import { createRegistryClient } from '@tb/registry-client';
import { IDLE_AUDIT, type ApiListing, type AuditStatus, type AuditSummary } from './types.ts';
import { createCommunityStore } from '@tb/community';

const cfg = loadConfig();
const registry = createRegistryClient(cfg);
export const MODELS = verifiableModels(cfg.minimaxModel);
/** What every listing must charge in: USDC on Stellar testnet. */
export const PAYMENT = { network: cfg.network, asset: cfg.usdcContract };
export const AUDITOR_URL = process.env.AUDITOR_URL ?? `http://localhost:${cfg.auditorPort}`;

type RawAudit = AuditSummary & { listingId?: string; provider: string; name: string; verdict?: { score: number; matchedModel: string; confidence: number; pass: boolean; inconclusive: boolean; scored?: number; unverifiable?: boolean }; probes?: unknown[] };

export async function fetchAudits(): Promise<RawAudit[]> {
  try {
    const db = createCommunityStore(cfg);
    if (db) return (await db.all<{body:RawAudit}>('community_audits', {order:'at.desc'})).map(row=>row.body);
    const r = await fetch(`${AUDITOR_URL}/audits`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    return r.ok ? ((await r.json()) as RawAudit[]) : [];
  } catch {
    return []; // auditor offline: catalog still renders, just without trust data
  }
}

const summarize = (a: RawAudit): AuditSummary => ({
  at: a.at, score: a.verdict!.score, matchedModel: a.verdict!.matchedModel, confidence: a.verdict!.confidence,
  pass: a.verdict!.pass, inconclusive: a.verdict!.inconclusive, scored: a.verdict!.scored, probes: a.probes?.length, unverifiable: a.verdict!.unverifiable, slashTx: a.slashTx, slashedAtomic: a.slashedAtomic, pauseTx: a.pauseTx,
});

export async function listingsWithAudits(): Promise<ApiListing[]> {
  const [listings, audits] = await Promise.all([registry.list(), fetchAudits()]);
  return listings.map((l) => {
    const last = audits.find((a) => l.id ? a.listingId === l.id : !a.listingId && a.provider === l.provider); // audits are newest first
    return { ...l, priceAtomic: String(l.priceAtomic), stakeAtomic: String(l.stakeAtomic), communityEnabled: !!cfg.supabaseUrl && !!cfg.supabaseSecretKey, verifiable: isVerifiable(l.claimedModel, MODELS), lastAudit: last ? summarize(last) : undefined };
  });
}

export async function fetchAuditStatus(): Promise<AuditStatus> {
  try {
    const r = await fetch(`${AUDITOR_URL}/audit/status`, { cache: 'no-store', signal: AbortSignal.timeout(2000) });
    return r.ok ? ((await r.json()) as AuditStatus) : IDLE_AUDIT;
  } catch {
    return IDLE_AUDIT;
  }
}
