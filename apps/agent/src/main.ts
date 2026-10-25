import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, REPO_ROOT } from '@tb/config';
import { createRegistryClient, type RegistryClient } from '@tb/registry-client';
import { createPayingFetch, type PayingFetch } from '@tb/x402-client';
import { BudgetGuard, usd } from './budget.ts';
import { chooseListing } from './choose.ts';
import { runWeatherRequest } from './weather.ts';

type AgentDeps = {
  registry: Pick<RegistryClient, 'list' | 'isActive'>;
  pay: PayingFetch;
  log: (line: string) => void;
  model: string;
  article: string;
  budgetAtomic: bigint;
  guard?: BudgetGuard;
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
    const pick = chooseListing(await d.registry.list(), d.model, exclude);
    if (!pick) {
      d.log(`[agent] no active provider for ${d.model} — stopping, nothing paid`);
      return { paidTo: null };
    }
    d.log(`[agent] picked ${pick.name} at ${usd(pick.priceAtomic)}/request (cheapest ${d.model})`);
    if (!(await d.registry.isActive(pick.provider))) {
      d.log(`[agent] ${pick.name} was delisted → rerouting`);
      exclude.add(pick.provider);
      continue;
    }
    const cost = pick.priceAtomic * BigInt(jobs);
    if (!guard.canSpend(cost)) {
      d.log(`[agent] REJECTED: payment ${usd(cost)} exceeds remaining budget ${usd(guard.remaining())}`);
      return { paidTo: null };
    }

    let res: Awaited<ReturnType<PayingFetch>>;
    try {
      res = await d.pay(pick.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: `Summarize this article in 3 bullet points:\n\n${d.article}` }] }),
      });
    } catch (e) {
      d.log(`[agent] ${pick.name} failed (${(e as Error).message}) → trying the next provider`);
      exclude.add(pick.provider);
      continue;
    }
    if (!res.ok) {
      d.log(`[agent] ${pick.name} failed (HTTP ${res.status}) → trying the next provider`);
      exclude.add(pick.provider);
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
    await runAgent({ registry, pay, log: console.log, model, article, budgetAtomic, guard, jobs });
  }

  mkdirSync(path.dirname(SPEND_FILE), { recursive: true });
  writeFileSync(SPEND_FILE, JSON.stringify({ spentAtomic: String(guard.spentAtomic()) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await cli();
