import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, REPO_ROOT, verifiableModels } from '@tb/config';
import { createRegistryClient, isListingActive, listingKey, type RegistryClient, type EndpointRegistryMethods } from '@tb/registry-client';
import { createPayingFetch, type PayingFetch } from '@tb/x402-client';
import { BudgetGuard, usd } from './budget.ts';
import { chooseListing } from './choose.ts';
import { runWeatherRequest } from './weather.ts';

type AgentDeps = {
  registry: Pick<RegistryClient, 'list' | 'isActive'> & Partial<EndpointRegistryMethods>;
  pay: PayingFetch;
  log: (line: string) => void;
  model: string;
  article: string;
  budgetAtomic: bigint;
  guard?: BudgetGuard;
  /** only buy models the auditor can verify (unset = no filter) */
  verifiable?: Set<string>;
  /** only buy listings that passed an audit (unset = no filter) */
  isTrusted?: (provider: string) => boolean;
  /** number of summaries requested in one job (overspend demo asks for many) */
  jobs?: number;
};

export type AgentResult = { paidTo: string | null; answer?: string; txHash?: string };

export async function runAgent(d: AgentDeps): Promise<AgentResult> {
  const guard = d.guard ?? new BudgetGuard(d.budgetAtomic);
  const jobs = d.jobs ?? 1;
  d.log(`[agent] task: summarize article · budget ${usd(guard.remaining())} left · model ${d.model}`);
  const exclude = new Set<string>();

  for (;;) {
    const pick = chooseListing(await d.registry.list(), d.model, exclude, d.verifiable);
    if (!pick) {
      d.log(`[agent] no active ${d.verifiable ? 'verifiable ' : ''}provider for ${d.model} — stopping, nothing paid`);
      return { paidTo: null };
    }
    d.log(`[agent] picked ${pick.name} at ${usd(pick.priceAtomic)}/request (cheapest ${d.model})`);
    if (!(await isListingActive(d.registry, pick))) {
      d.log(`[agent] ${pick.name} was delisted → rerouting`);
      exclude.add(listingKey(pick));
      continue;
    }
    if (d.isTrusted && !d.isTrusted(listingKey(pick))) {
      d.log(`[agent] ${pick.name} not audited yet (under review) → skipping`);
      exclude.add(listingKey(pick));
      continue;
    }
    const cost = pick.priceAtomic * BigInt(jobs);
    if (!guard.canSpend(cost)) {
      d.log(`[agent] REJECTED: payment ${usd(cost)} exceeds remaining budget ${usd(guard.remaining())}`);
      return { paidTo: null };
    }

    let res: Awaited<ReturnType<PayingFetch>>;
    try {
      res = await d.pay(
        pick.endpoint,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: `Summarize this article in 3 bullet points:\n\n${d.article}` }] }),
          signal: AbortSignal.timeout(45_000),
        },
        { maxAmountAtomic: pick.priceAtomic }, // never pay more than the registered price
      );
    } catch (e) {
      d.log(`[agent] ${pick.name} failed (${(e as Error).message}) → trying the next provider`);
      exclude.add(listingKey(pick));
      continue;
    }
    if (!res.ok) {
      d.log(`[agent] ${pick.name} failed (HTTP ${res.status}) → trying the next provider`);
      exclude.add(listingKey(pick));
      continue;
    }
    guard.record(pick.priceAtomic);
    const answer = ((await res.json()) as { choices: { message: { content: string } }[] }).choices[0].message.content;
    d.log(`[agent] paid ${usd(pick.priceAtomic)} → ${pick.name} · tx ${res.payment?.txHash ?? '?'}`);
    d.log(`[agent] answer:\n${answer}`);
    d.log(`[agent] budget left ${usd(guard.remaining())}`);
    return { paidTo: pick.name, answer, txHash: res.payment?.txHash };
  }
}

// ---- CLI ----
const SPEND_FILE = path.join(REPO_ROOT, 'data/agent-spend.json');
const readSpent = () => (existsSync(SPEND_FILE) ? BigInt(JSON.parse(readFileSync(SPEND_FILE, 'utf8')).spentAtomic) : 0n);

async function cli() {
  const cfg = loadConfig();
  const arg = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const model = arg('model') ?? cfg.minimaxModel;
  const article = readFileSync(arg('article') ?? path.join(REPO_ROOT, 'apps/agent/article.txt'), 'utf8');
  const budgetAtomic = BigInt(Math.round(Number(arg('budget') ?? 0.5) * 1e7));
  const guard = new BudgetGuard(budgetAtomic, process.argv.includes('--reset-budget') ? 0n : readSpent());
  const jobs = process.argv.includes('--try-overspend') ? 100 : 1;
  const registry = createRegistryClient(cfg);
  const pay = createPayingFetch(cfg.keys.agent.secret);
  if (process.argv.includes('--weather')) {
    const latitude = Number(arg('latitude'));
    const longitude = Number(arg('longitude'));
    if (!arg('latitude') || !arg('longitude')) throw new Error('weather mode requires --latitude and --longitude');
    const marketplaceUrl = process.env.TRUSTBAZAAR_URL ?? 'http://localhost:3000';
    await runWeatherRequest({ registry, pay, log: console.log, guard, schemaUrl: `${marketplaceUrl.replace(/\/$/, '')}/api/schemas/weather/v1` }, { latitude, longitude, forecastHours: Number(arg('hours') ?? 1) });
  } else {
    // Trust = the latest audit of a listing passed (and wasn't inconclusive). Auditor down → no filter, with a warning.
    let isTrusted: ((p: string) => boolean) | undefined;
    try {
      const audits = (await (await fetch(`http://localhost:${cfg.auditorPort}/audits`, { signal: AbortSignal.timeout(3000) })).json()) as { listingId?: string; provider: string; verdict: { pass: boolean; inconclusive: boolean } }[];
      const latest = new Map<string, boolean>();
      for (const a of audits) { const key = a.listingId ?? a.provider; if (!latest.has(key)) latest.set(key, a.verdict.pass && !a.verdict.inconclusive); }
      isTrusted = (p) => latest.get(p) === true;
    } catch {
      console.log('[agent] auditor unreachable — buying without the audit check');
    }
    await runAgent({
      registry, pay, isTrusted, log: console.log, model, article, budgetAtomic, guard, jobs,
      verifiable: process.argv.includes('--allow-unverifiable') ? undefined : new Set(verifiableModels(cfg.minimaxModel).map((m) => m.id)),
    });
  }

  mkdirSync(path.dirname(SPEND_FILE), { recursive: true });
  writeFileSync(SPEND_FILE, JSON.stringify({ spentAtomic: String(guard.spentAtomic()) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await cli();
