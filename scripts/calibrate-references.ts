// Fingerprint calibration without payments: asks each backend the demo serves (fresh answers, like a
// provider would give) every fingerprint probe and prints which reference each answer lands closest to.
// Run after adding a reference model: `pnpm calibrate`. Spends a few MiniMax calls; no USDC.
import path from 'node:path';
import { loadConfig, REPO_ROOT, seedListings } from '@tb/config';
import { minimaxBackend, ollamaBackend, type Backend } from '../apps/providers/src/backends.ts';
import { createReferences, ollamaEmbed, REFERENCE_MODELS } from '../apps/auditor/src/references.ts';
import { closestReference } from '../apps/auditor/src/scoring.ts';
import { FINGERPRINT } from '../apps/auditor/src/probes.ts';

const cfg = loadConfig();
const references = createReferences(REFERENCE_MODELS(cfg), { file: path.join(REPO_ROOT, 'data/references.json') });
const embed = ollamaEmbed(cfg.ollamaUrl);
const served: Record<string, Backend> = {};
for (const s of seedListings(cfg.minimaxModel)) {
  const key = s.servedBy.kind === 'minimax' ? cfg.minimaxModel : s.servedBy.model;
  served[key] ??= s.servedBy.kind === 'minimax' ? minimaxBackend(cfg.minimaxBaseUrl, cfg.minimaxApiKey ?? '', cfg.minimaxModel) : ollamaBackend(cfg.ollamaUrl, s.servedBy.model);
}

for (const [model, backend] of Object.entries(served)) {
  const votes: Record<string, number> = {};
  for (const p of FINGERPRINT) {
    const [answer, refs] = await Promise.all([backend([{ role: 'user', content: p.prompt }], { temperature: 0 }), references(p.prompt)]);
    const names = Object.keys(refs);
    const [a, ...r] = await embed([answer, ...names.map((m) => refs[m])]);
    const c = closestReference(a, Object.fromEntries(names.map((m, i) => [m, r[i]])));
    votes[c.model] = (votes[c.model] ?? 0) + 1;
    const runnerUp = Object.entries(c.margins).filter(([m]) => m !== c.model).sort((x, y) => y[1] - x[1])[0];
    console.log(`${model.padEnd(14)} ${p.id.padEnd(9)} → ${c.model.padEnd(16)} ${c.similarity.toFixed(3)}  (next ${runnerUp[0]} ${runnerUp[1].toFixed(3)})`);
  }
  console.log(`${model}: ${votes[model] ?? 0}/${FINGERPRINT.length} fingerprint probes matched itself  ${JSON.stringify(votes)}\n`);
}
