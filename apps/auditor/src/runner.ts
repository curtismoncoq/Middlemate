import { listingKey, type Listing, type RegistryClient, type EndpointRegistryMethods } from '@tb/registry-client';
import type { PayingFetch } from '@tb/x402-client';
import { pickProbes as defaultPickProbes, type Probe } from './probes.ts';
import { closestReference, computeVerdict, type ProbeResult, type Verdict } from './scoring.ts';

export type AuditRecord = {
  listingId?: string;
  id: string;
  at: string;
  provider: string;
  name: string;
  claimedModel: string;
  verdict: Verdict;
  probes: ProbeResult[];
  slashTx?: string;
  slashedAtomic?: string;
  pauseTx?: string;
  /** set when a slash or delist call failed; the verdict still stands */
  error?: string;
  /** USDC (atomic) the auditor paid for this audit's probes */
  spentAtomic?: string;
};

export const PAY_TIMEOUT_MS = 45_000;

export type FeedLine = { listingId?: string; at: string; provider: string; name: string; line: string };
export type AuditStatus = {
  running: boolean;
  current: { listingId?: string; provider: string; name: string; probe: number; total: number } | null;
  /** most recent probe/verdict/slash lines, oldest first */
  feed: FeedLine[];
};
const FEED_MAX = 40;

/** Audit order: listings priced lowest relative to same-model peers first (an underpriced claim is the classic cheat). */
export function bySuspicion(listings: Listing[]): Listing[] {
  const top = new Map<string, bigint>();
  for (const l of listings) if (!top.has(l.claimedModel) || l.priceAtomic > top.get(l.claimedModel)!) top.set(l.claimedModel, l.priceAtomic);
  const ratio = (l: Listing) => Number(l.priceAtomic) / Number(top.get(l.claimedModel) || 1n);
  return [...listings].sort((a, b) => ratio(a) - ratio(b));
}

export type AuditStore = { add(r: AuditRecord): void; all(): AuditRecord[]; clear(): void };

export function memoryStore(initial: AuditRecord[] = []): AuditStore {
  const records = [...initial];
  return { add: (r) => void records.unshift(r), all: () => [...records], clear: () => void records.splice(0) };
}

type Deps = {
  registry: Pick<RegistryClient, 'list' | 'slash' | 'pauseListing'> & Partial<EndpointRegistryMethods>;
  auditorSecret: string;
  pay: PayingFetch;
  /** model id → reference answer for a prompt */
  references: (prompt: string) => Promise<Record<string, string>>;
  embed: (texts: string[]) => Promise<number[][]>;
  store: AuditStore;
  pickProbes?: () => Probe[];
  /** models the references cover; listings claiming anything else are unverifiable */
  referenceModels?: string[];
  log?: (line: string) => void;
};

export function createRunner(deps: Deps) {
  const pick = deps.pickProbes ?? (() => defaultPickProbes());
  let current: AuditStatus['current'] = null;
  const feed: FeedLine[] = [];
  const say = (l: Listing, line: string) => {
    feed.push({ at: new Date().toISOString(), listingId: l.id, provider: l.provider, name: l.name, line });
    if (feed.length > FEED_MAX) feed.shift();
    deps.log?.(`[audit] ${l.name}: ${line}`);
  };
  const log = (line: string) => deps.log?.(line);

  async function ask(l: Listing, prompt: string) {
    const res = await deps.pay(
      l.endpoint,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], temperature: 0 }),
        signal: AbortSignal.timeout(PAY_TIMEOUT_MS),
      },
      { maxAmountAtomic: l.priceAtomic },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { choices: { message: { content: string } }[] };
    return { answer: j.choices[0].message.content, txHash: res.payment?.txHash };
  }

  async function runProbe(l: Listing, p: Probe): Promise<ProbeResult> {
    // Reference answers don't depend on the provider: fetch them while the paid probe settles.
    const refsPromise = p.kind === 'fingerprint' ? deps.references(p.prompt) : null;
    refsPromise?.catch(() => {}); // handled below; avoid an unhandled rejection if the probe itself fails
    let got: { answer: string; txHash?: string } | undefined;
    let lastErr = '';
    for (let attempt = 0; attempt < 2 && !got; attempt++) {
      try {
        got = await ask(l, p.prompt);
      } catch (e) {
        lastErr = (e as Error).message;
      }
    }
    if (!got) return { probeId: p.id, kind: p.kind, status: 'error', error: lastErr, prompt: p.prompt };
    if (p.kind === 'checkable') return { probeId: p.id, kind: 'checkable', status: 'ok', answer: got.answer, correct: p.check(got.answer), prompt: p.prompt, txHash: got.txHash };
    try {
      const refs = await refsPromise!;
      const models = Object.keys(refs);
      const [answerEmb, ...refEmbs] = await deps.embed([got.answer, ...models.map((m) => refs[m])]);
      const closest = closestReference(answerEmb, Object.fromEntries(models.map((m, i) => [m, refEmbs[i]])));
      return { probeId: p.id, kind: 'fingerprint', status: 'ok', answer: got.answer, closest, prompt: p.prompt, txHash: got.txHash };
    } catch (e) {
      return { probeId: p.id, kind: 'fingerprint', status: 'error', error: `reference failed: ${(e as Error).message}`, prompt: p.prompt };
    }
  }

  async function auditOne(l: Listing): Promise<AuditRecord> {
    const round = pick();
    current = { listingId: l.id, provider: l.provider, name: l.name, probe: 0, total: round.length };
    say(l, `probing (${l.claimedModel})`);
    const probes: ProbeResult[] = [];
    for (const p of round) {
      const r = await runProbe(l, p);
      probes.push(r);
      current = { ...current, probe: current.probe + 1 };
      say(l, `${p.id} → ${r.status === 'error' ? 'error ' + r.error : r.kind === 'checkable' ? (r.correct ? 'correct' : 'wrong') : `closest ${r.closest.model} (${r.closest.similarity.toFixed(3)})`}`);
    }
    const verdict = computeVerdict(l.claimedModel, probes, deps.referenceModels);
    const spent = BigInt(probes.filter((p) => p.status === 'ok' && p.txHash).length) * l.priceAtomic;
    const rec: AuditRecord = { id: `${Date.now()}-${listingKey(l).slice(0, 8)}`, listingId: l.id, at: new Date().toISOString(), provider: l.provider, name: l.name, claimedModel: l.claimedModel, verdict, probes, spentAtomic: String(spent) };
    say(l, `score ${verdict.score} matched ${verdict.matchedModel} → ${verdict.unverifiable ? 'UNVERIFIABLE (no reference for ' + l.claimedModel + ')' : verdict.pass ? 'PASS' : 'FAIL'}`);
    if (!verdict.pass) {
      try {
        if (l.id && (!deps.registry.slashEndpoint || !deps.registry.pauseEndpoint)) throw new Error('Registry does not support per-listing audits');
        const s = l.id ? await deps.registry.slashEndpoint!(deps.auditorSecret, l.id) : await deps.registry.slash(deps.auditorSecret, l.provider);
        rec.slashTx = s.hash;
        rec.slashedAtomic = String(s.amountAtomic);
        say(l, `slashed ${Number(s.amountAtomic) / 1e7} USDC · tx ${s.hash}`);
        rec.pauseTx = (l.id ? await deps.registry.pauseEndpoint!(deps.auditorSecret, l.id) : await deps.registry.pauseListing(deps.auditorSecret, l.provider)).hash;
        say(l, `delisted · tx ${rec.pauseTx}`);
      } catch (e) {
        rec.error = (e as Error).message;
        say(l, `on-chain action failed: ${rec.error}`);
      }
    }
    // Stamp after the on-chain actions land: the web app keeps the red card up for a window from `at`.
    rec.at = new Date().toISOString();
    deps.store.add(rec);
    return rec;
  }

  let running: Promise<AuditRecord[]> | null = null;

  /** Audits every active listing (or one provider). Concurrent calls share the in-flight run. */
  async function runAudit(provider?: string): Promise<AuditRecord[]> {
    if (running) return running;
    running = (async () => {
      const targets = bySuspicion((await deps.registry.list()).filter((l) => l.active && l.stakeAtomic > 0n && (!provider || listingKey(l) === provider || l.provider === provider)));
      const out: AuditRecord[] = [];
      for (const l of targets) {
        if (deps.referenceModels && !deps.referenceModels.includes(l.claimedModel)) {
          say(l, `skipped — no reference for ${l.claimedModel} (unverifiable, not probed)`); // don't pay for probes we can't judge
          continue;
        }
        try {
          out.push(await auditOne(l));
        } catch (e) {
          log(`[audit] ${l.name}: audit aborted: ${(e as Error).message}`); // one bad listing never stops the round
        }
      }
      return out;
    })();
    try {
      return await running;
    } finally {
      running = null;
      current = null;
    }
  }

  const status = (): AuditStatus => ({ running: running !== null, current, feed: [...feed] });

  return { runAudit, status };
}
