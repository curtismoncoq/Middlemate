// Records Claude's answers to every fingerprint probe, once, through the Claude Code CLI (your Claude
// subscription; no API key). The auditor replays them as the `claude-opus-5-5` reference.
// Re-run after changing FINGERPRINT probes: `pnpm record:claude`.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from '@tb/config';
import { FINGERPRINT } from '../apps/auditor/src/probes.ts';

const MODEL = 'claude-opus-5-5';
// A plain assistant, as an API caller would get it: no coding-agent prompt, no tools, no project files.
const SYSTEM = 'You are Claude, an AI assistant made by Anthropic.';
const cwd = mkdtempSync(path.join(tmpdir(), 'tb-record-'));
const args = ['-p', '--model', MODEL, '--system-prompt', SYSTEM, '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands'];

const answers: Record<string, string> = {};
for (const p of FINGERPRINT) {
  const r = spawnSync('claude', [...args, p.prompt], { cwd, encoding: 'utf8', timeout: 180_000 });
  const answer = r.stdout?.trim();
  if (r.status !== 0 || !answer) {
    console.error(`${p.id}: claude failed (${r.status}) ${r.stderr?.slice(0, 300)}`);
    process.exit(1);
  }
  answers[p.prompt] = answer;
  console.log(`${p.id}: ${answer.replace(/\s+/g, ' ').slice(0, 90)}…`);
}

const file = path.join(REPO_ROOT, 'apps/auditor/references', `${MODEL}.json`);
const how = `claude -p --model ${MODEL} --system-prompt "${SYSTEM}", no tools, empty working directory`;
writeFileSync(file, JSON.stringify({ model: MODEL, recordedAt: new Date().toISOString(), how, answers }, null, 2) + '\n');
console.log(`wrote ${path.relative(REPO_ROOT, file)}`);
