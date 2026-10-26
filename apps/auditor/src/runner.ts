import { listingKey, type Listing, type RegistryClient, type EndpointRegistryMethods } from '@tb/registry-client';
import type { PayingFetch } from '@tb/x402-client';
import { pickProbes as defaultPickProbes, type Probe } from './probes.ts';
import { closestReference, computeVerdict, type ProbeResult, type Verdict } from './scoring.ts';
import { WEATHER_SCHEMA_ID, type NormalizedWeatherData, type WeatherCapabilityManifest } from '@tb/weather-contract';
import { auditWeatherListing, WEATHER_PROBES, type WeatherAuditEvidence, type WeatherAuditProbe } from './weather-audit.ts';

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
  /** Progressive weather enforcement: warnings 1 and 2 precede the third-failure slash. */
  warning?: { level: number; threshold: number };
  /** Field-level provider versus MET Norway evidence. */
  weather?: WeatherAuditEvidence;
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

export type AuditStore = { add(r: AuditRecord): void | Promise<void>; all(): AuditRecord[]; clear(): void; refresh?(): Promise<void> };

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
  weather?: {
    reference: (request: { latitude: number; longitude: number; forecastHours: number }) => Promise<NormalizedWeatherData>;
    capabilities?: (endpoint: string) => Promise<WeatherCapabilityManifest>;
    probes?: WeatherAuditProbe[];
  };
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
        headers: { 'content-type': 'application/json', 'x-tb-listing-id': listingKey(l) },
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
    const isWeather = l.claimedModel === WEATHER_SCHEMA_ID;
    let probes: ProbeResult[];
    let verdict: Verdict;
    let spentAtomic: string;
    let weather: WeatherAuditEvidence | undefined;

    if (isWeather) {
      if (!deps.weather) throw new Error('Weather reference is not configured');
      const round = deps.weather.probes ?? WEATHER_PROBES;
      current = { listingId: l.id, provider: l.provider, name: l.name, probe: 0, total: round.length };
      say(l, 'probing weather against MET Norway');
      const result = await auditWeatherListing(l, {
        pay: deps.pay,
        reference: deps.weather.reference,
        capabilities: deps.weather.capabilities,
        probes: round,
        onProgress: (probe, evidence) => {
          if (current) current = { ...current, probe: current.probe + 1 };
          say(l, `${probe.id} → ${evidence.status === 'error' ? `error ${evidence.error}` : evidence.fields.every((field) => field.pass) ? 'within tolerance' : `${evidence.fields.filter((field) => !field.pass).length} contradiction(s)`}`);
        },
      });
      ({ probes, verdict, weather, spentAtomic } = result);
    } else {
      const round = pick();
      current = { listingId: l.id, provider: l.provider, name: l.name, probe: 0, total: round.length };
      say(l, `probing (${l.claimedModel})`);
      probes = [];
      for (const p of round) {
        const r = await runProbe(l, p);
        probes.push(r);
        current = { ...current, probe: current.probe + 1 };
        say(l, `${p.id} → ${r.status === 'error' ? 'error ' + r.error : r.kind === 'checkable' ? (r.correct ? 'correct' : 'wrong') : `closest ${r.closest.model} (${r.closest.similarity.toFixed(3)})`}`);
      }
      verdict = computeVerdict(l.claimedModel, probes, deps.referenceModels);
      spentAtomic = String(BigInt(probes.filter((p) => p.status === 'ok' && p.txHash).length) * l.priceAtomic);
    }
    const rec: AuditRecord = { id: `${Date.now()}-${listingKey(l).slice(0, 8)}`, listingId: l.id, at: new Date().toISOString(), provider: l.provider, name: l.name, claimedModel: l.claimedModel, verdict, probes, spentAtomic, ...(weather ? { weather } : {}) };
    say(l, verdict.unverifiable ? `UNVERIFIABLE (no reference for ${l.claimedModel})`
      : verdict.inconclusive ? `NOT SCORED (${verdict.scored} of ${probes.length} probes answered)`
      : `score ${verdict.score} matched ${verdict.matchedModel} → ${verdict.pass ? 'PASS' : 'FAIL'}`);
    if (isWeather && !verdict.pass && !verdict.inconclusive) say(l, 'MET Norway disagreement recorded for review — no automatic financial sanction');
    const shouldSlash = !isWeather && !verdict.pass;
    if (shouldSlash) {
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
    await deps.store.add(rec);
    return rec;
  }

  let running: Promise<AuditRecord[]> | null = null;

  /** Audits every active listing (or one provider). Concurrent calls share the in-flight run. */
  async function runAudit(provider?: string): Promise<AuditRecord[]> {
    if (running) return running;
    running = (async () => {
      await deps.store.refresh?.();
      const targets = bySuspicion((await deps.registry.list()).filter((l) => l.active && l.stakeAtomic > 0n && (!provider || listingKey(l) === provider || l.provider === provider)));
      const out: AuditRecord[] = [];
      for (const l of targets) {
        if (l.claimedModel === WEATHER_SCHEMA_ID && !deps.weather) {
          say(l, 'skipped — MET Norway reference is unavailable (not probed)');
          continue;
        }
        if (!l.claimedModel.startsWith('api:') && deps.referenceModels && !deps.referenceModels.includes(l.claimedModel)) {
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
