import type { Listing, RegistryClient } from '@tb/registry-client';
import type { PayingFetch } from '@tb/x402-client';
import { pickProbes as defaultPickProbes, type Probe } from './probes.ts';
import { closestReference, computeVerdict, type ProbeResult, type Verdict } from './scoring.ts';

export type AuditRecord = {
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
};

export type AuditStore = { add(r: AuditRecord): void; all(): AuditRecord[] };

export function memoryStore(initial: AuditRecord[] = []): AuditStore {
  const records = [...initial];
  return { add: (r) => void records.unshift(r), all: () => [...records] };
}

type Deps = {
  registry: Pick<RegistryClient, 'list' | 'slash' | 'pauseListing'>;
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
  const log = deps.log ?? (() => {});
  const pick = deps.pickProbes ?? (() => defaultPickProbes());

  async function ask(l: Listing, prompt: string) {
    const res = await deps.pay(l.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], temperature: 0 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { choices: { message: { content: string } }[] };
    return { answer: j.choices[0].message.content, txHash: res.payment?.txHash };
  }

  async function runProbe(l: Listing, p: Probe): Promise<ProbeResult> {
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
      const refs = await deps.references(p.prompt);
      const models = Object.keys(refs);
      const [answerEmb, ...refEmbs] = await deps.embed([got.answer, ...models.map((m) => refs[m])]);
      const closest = closestReference(answerEmb, Object.fromEntries(models.map((m, i) => [m, refEmbs[i]])));
      return { probeId: p.id, kind: 'fingerprint', status: 'ok', answer: got.answer, closest, prompt: p.prompt, txHash: got.txHash };
    } catch (e) {
      return { probeId: p.id, kind: 'fingerprint', status: 'error', error: `reference failed: ${(e as Error).message}`, prompt: p.prompt };
    }
  }

  async function auditOne(l: Listing): Promise<AuditRecord> {
    log(`[audit] ${l.name}: probing (${l.claimedModel})`);
    const probes: ProbeResult[] = [];
    for (const p of pick()) {
      const r = await runProbe(l, p);
      probes.push(r);
      log(`[audit] ${l.name}: ${p.id} → ${r.status === 'error' ? 'error ' + r.error : r.kind === 'checkable' ? (r.correct ? 'correct' : 'wrong') : `closest ${r.closest.model} (${r.closest.similarity.toFixed(3)})`}`);
    }
    const verdict = computeVerdict(l.claimedModel, probes, deps.referenceModels);
    const rec: AuditRecord = { id: `${Date.now()}-${l.provider.slice(0, 6)}`, at: new Date().toISOString(), provider: l.provider, name: l.name, claimedModel: l.claimedModel, verdict, probes };
    log(`[audit] ${l.name}: score ${verdict.score} matched ${verdict.matchedModel} → ${verdict.unverifiable ? 'UNVERIFIABLE (no reference for ' + l.claimedModel + ')' : verdict.pass ? 'PASS' : 'FAIL'}`);
    if (!verdict.pass) {
      const s = await deps.registry.slash(deps.auditorSecret, l.provider);
      rec.slashTx = s.hash;
      rec.slashedAtomic = String(s.amountAtomic);
      log(`[audit] ${l.name}: slashed ${s.amountAtomic} tx ${s.hash}`);
      rec.pauseTx = (await deps.registry.pauseListing(deps.auditorSecret, l.provider)).hash;
      log(`[audit] ${l.name}: delisted tx ${rec.pauseTx}`);
    }
    deps.store.add(rec);
    return rec;
  }

  let running: Promise<AuditRecord[]> | null = null;

  /** Audits every active listing (or one provider). Concurrent calls share the in-flight run. */
  async function runAudit(provider?: string): Promise<AuditRecord[]> {
    if (running) return running;
    running = (async () => {
      const targets = (await deps.registry.list()).filter((l) => l.active && l.stakeAtomic > 0n && (!provider || l.provider === provider));
      const out: AuditRecord[] = [];
      for (const l of targets) out.push(await auditOne(l));
      return out;
    })();
    try {
      return await running;
    } finally {
      running = null;
    }
  }

  return { runAudit };
}
