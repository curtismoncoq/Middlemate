import express from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, REPO_ROOT } from '@tb/config';
import { createRegistryClient } from '@tb/registry-client';
import { createPayingFetch } from '@tb/x402-client';
import { createRunner, memoryStore, type AuditRecord, type AuditStore } from './runner.ts';
import { awaitingReview } from './review.ts';
import { createReferences, ollamaEmbed, REFERENCE_MODELS } from './references.ts';

const cfg = loadConfig();
const AUDITS_FILE = path.join(REPO_ROOT, 'data/audits.json');
const INTERVAL = Number(process.env.AUDIT_INTERVAL_MS ?? 120_000);

function fileStore(file: string): AuditStore {
  const mem = memoryStore(existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as AuditRecord[]) : []);
  const save = () => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(mem.all(), null, 2));
  };
  return {
    all: mem.all,
    add(r) {
      mem.add(r);
      save();
    },
    clear() {
      mem.clear();
      save();
    },
  };
}

const store = fileStore(AUDITS_FILE);
const runner = createRunner({
  registry: createRegistryClient(cfg),
  auditorSecret: cfg.keys.auditor.secret,
  pay: createPayingFetch(cfg.keys.auditor.secret),
  references: createReferences(REFERENCE_MODELS(cfg), { file: path.join(REPO_ROOT, 'data/references.json') }),
  referenceModels: Object.keys(REFERENCE_MODELS(cfg)),
  embed: ollamaEmbed(cfg.ollamaUrl),
  store,
  log: (l) => console.log(l),
});

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  next();
});
app.get('/audits', (_req, res) => res.json(store.all()));
app.get('/audit/status', (_req, res) => res.json(runner.status()));
app.delete('/audits', (_req, res) => {
  store.clear(); // demo reset
  res.status(204).end();
});
// Starts a round and returns at once (rounds take minutes; clients poll /audits). `?wait=1` blocks until done.
app.post('/audit/run', async (req, res) => {
  const round = runner.runAudit(req.body?.provider);
  if (req.query.wait) {
    try {
      res.json(await round);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
    return;
  }
  round.catch((e) => console.error('[auditor] round failed', e));
  res.status(202).json({ started: true });
});

app.listen(cfg.auditorPort, () => console.log(`[auditor] listening on :${cfg.auditorPort} (payments: ${cfg.paymentsMode}, interval ${INTERVAL || 'off'})`));
if (INTERVAL > 0) setInterval(() => runner.runAudit().catch((e) => console.error('[auditor] run failed', e)), INTERVAL);

// Audit on entry: a new (never audited) listing is reviewed within a few seconds of registering.
const ENTRY_POLL_MS = Number(process.env.ENTRY_POLL_MS ?? 5000);
const refModels = Object.keys(REFERENCE_MODELS(cfg));
const registry = createRegistryClient(cfg);
if (ENTRY_POLL_MS > 0) {
  setInterval(async () => {
    if (runner.status().running) return;
    try {
      const [next] = awaitingReview(await registry.list(), store.all(), refModels);
      if (next) {
        console.log(`[auditor] entry audit: ${next.name} (${next.claimedModel})`);
        await runner.runAudit(next.provider);
      }
    } catch (e) {
      console.error('[auditor] entry check failed', (e as Error).message);
    }
  }, ENTRY_POLL_MS);
}
