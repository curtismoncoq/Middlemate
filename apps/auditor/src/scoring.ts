export type Closest = { model: string; similarity: number; margins: Record<string, number> };

export type ProbeResult =
  | { probeId: string; kind: 'checkable' | 'fingerprint'; status: 'error'; error: string; prompt?: string }
  | { probeId: string; kind: 'checkable'; status: 'ok'; answer: string; correct: boolean; prompt?: string; txHash?: string }
  | { probeId: string; kind: 'fingerprint'; status: 'ok'; answer: string; closest: Closest; prompt?: string; txHash?: string };

export type Verdict = {
  score: number; // 0-100
  matchedModel: string;
  confidence: number; // share of fingerprint probes that matched `matchedModel`
  scored: number;
  pass: boolean;
  inconclusive: boolean;
  /** claimed model has no reference we can query, so the fingerprint can't verify it */
  unverifiable?: boolean;
};

export const TRUST_THRESHOLD = Number(process.env.TRUST_THRESHOLD ?? 60);
export const MIN_SCORED = 5;
const FINGERPRINT_WEIGHT = 0.7;

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function closestReference(answerEmb: number[], refs: Record<string, number[]>): Closest {
  const margins: Record<string, number> = {};
  let best = { model: '', similarity: -Infinity };
  for (const [model, emb] of Object.entries(refs)) {
    const s = cosine(answerEmb, emb);
    margins[model] = s;
    if (s > best.similarity) best = { model, similarity: s };
  }
  return { ...best, margins };
}

/**
 * Score = 70% share of fingerprint probes closest to the claimed model
 *       + 30% share of checkable probes answered correctly.
 * Errors are excluded; fewer than MIN_SCORED scored probes, or a claimed model with no
 * reference to compare against, is inconclusive and never fails.
 */
export function computeVerdict(claimedModel: string, results: ProbeResult[], referenceModels?: string[]): Verdict {
  const ok = results.filter((r) => r.status === 'ok');
  const fps = ok.filter((r) => r.kind === 'fingerprint') as Extract<ProbeResult, { kind: 'fingerprint'; status: 'ok' }>[];
  const checks = ok.filter((r) => r.kind === 'checkable') as Extract<ProbeResult, { kind: 'checkable'; status: 'ok' }>[];

  const votes = new Map<string, number>();
  for (const f of fps) votes.set(f.closest.model, (votes.get(f.closest.model) ?? 0) + 1);
  const [matchedModel = claimedModel, topVotes = 0] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];

  const fpRate = fps.length ? (votes.get(claimedModel) ?? 0) / fps.length : 1;
  const checkRate = checks.length ? checks.filter((c) => c.correct).length / checks.length : 1;
  const score = Math.round(100 * (FINGERPRINT_WEIGHT * fpRate + (1 - FINGERPRINT_WEIGHT) * checkRate));
  const scored = ok.length;
  const unverifiable = !!referenceModels && !referenceModels.includes(claimedModel);
  const inconclusive = scored < MIN_SCORED || unverifiable;

  return {
    score,
    matchedModel,
    confidence: fps.length ? topVotes / fps.length : 0,
    scored,
    inconclusive,
    ...(unverifiable ? { unverifiable } : {}),
    pass: inconclusive || score >= TRUST_THRESHOLD,
  };
}
