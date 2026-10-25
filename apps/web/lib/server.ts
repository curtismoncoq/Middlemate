import 'server-only';
import { isVerifiable, loadConfig, verifiableModels } from '@tb/config';
import { createRegistryClient } from '@tb/registry-client';
import { IDLE_AUDIT, type ApiListing, type AuditStatus, type AuditSummary } from './types.ts';

const cfg = loadConfig();
const registry = createRegistryClient(cfg);
export const MODELS = verifiableModels(cfg.minimaxModel);
export const AUDITOR_URL = process.env.AUDITOR_URL ?? `http://localhost:${cfg.auditorPort}`;

type RawAudit = AuditSummary & { provider: string; name: string; verdict?: { score: number; matchedModel: string; confidence: number; pass: boolean; inconclusive: boolean; unverifiable?: boolean }; probes?: unknown[] };

export async function fetchAudits(): Promise<RawAudit[]> {
  try {
    const r = await fetch(`${AUDITOR_URL}/audits`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    return r.ok ? ((await r.json()) as RawAudit[]) : [];
  } catch {
    return []; // auditor offline: catalog still renders, just without trust data
  }
}

const summarize = (a: RawAudit): AuditSummary => ({
  at: a.at, score: a.verdict!.score, matchedModel: a.verdict!.matchedModel, confidence: a.verdict!.confidence,
  pass: a.verdict!.pass, inconclusive: a.verdict!.inconclusive, unverifiable: a.verdict!.unverifiable, slashTx: a.slashTx, slashedAtomic: a.slashedAtomic, pauseTx: a.pauseTx,
});

export async function listingsWithAudits(): Promise<ApiListing[]> {
  const [listings, audits] = await Promise.all([registry.list(), fetchAudits()]);
  return listings.map((l) => {
    const last = audits.find((a) => a.provider === l.provider); // audits are newest first
    return { ...l, priceAtomic: String(l.priceAtomic), stakeAtomic: String(l.stakeAtomic), verifiable: isVerifiable(l.claimedModel, MODELS), lastAudit: last ? summarize(last) : undefined };
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
