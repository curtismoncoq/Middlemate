import express from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, REPO_ROOT } from '@tb/config';
import { createRegistryClient } from '@tb/registry-client';
import { createPayingFetch } from '@tb/x402-client';
import { createRunner, memoryStore, type AuditRecord, type AuditStore } from './runner.ts';
import { createReferences, ollamaEmbed, REFERENCE_MODELS } from './references.ts';

const cfg = loadConfig();
const AUDITS_FILE = path.join(REPO_ROOT, 'data/audits.json');
const INTERVAL = Number(process.env.AUDIT_INTERVAL_MS ?? 120_000);

function fileStore(file: string): AuditStore {
  const mem = memoryStore(existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as AuditRecord[]) : []);
  return {
    all: mem.all,
    add(r) {
      mem.add(r);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(mem.all(), null, 2));
    },
  };
}

const store = fileStore(AUDITS_FILE);
const runner = createRunner({
  registry: createRegistryClient(cfg),
  auditorSecret: cfg.keys.auditor.secret,
  pay: createPayingFetch(cfg.keys.auditor.secret),
  references: createReferences(REFERENCE_MODELS(cfg)),
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
app.post('/audit/run', async (req, res) => {
  try {
    res.json(await runner.runAudit(req.body?.provider));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.listen(cfg.auditorPort, () => console.log(`[auditor] listening on :${cfg.auditorPort} (payments: ${cfg.paymentsMode}, interval ${INTERVAL || 'off'})`));
if (INTERVAL > 0) setInterval(() => runner.runAudit().catch((e) => console.error('[auditor] run failed', e)), INTERVAL);
