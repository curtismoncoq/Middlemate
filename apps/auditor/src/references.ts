import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minimaxBackend, ollamaBackend, type Backend } from '@tb/providers/backends';
import { EMBED_MODEL, OLLAMA_KEEP_ALIVE, verifiableModels, type Config } from '@tb/config';

export const REFERENCE_MODELS = (cfg: Config): Record<string, Backend> =>
  Object.fromEntries(
    verifiableModels(cfg.minimaxModel).map((m) => [
      m.id,
      m.reference.kind === 'minimax'
        ? minimaxBackend(cfg.minimaxBaseUrl, cfg.minimaxApiKey ?? '', cfg.minimaxModel)
        : m.reference.kind === 'recorded'
          ? recordedBackend(loadRecording(m.reference.file).answers)
          : ollamaBackend(cfg.ollamaUrl, m.reference.model),
    ]),
  );

const RECORDINGS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../references');

/** Answers to the fingerprint probes, recorded once from a model we can't query live (`pnpm record:claude`). */
export type Recording = { model: string; recordedAt: string; how: string; answers: Record<string, string> };

export const loadRecording = (file: string): Recording => JSON.parse(readFileSync(path.join(RECORDINGS_DIR, file), 'utf8'));

/** A reference backend that replays a recording; an unrecorded prompt errors, so its probe is excluded. */
export function recordedBackend(answers: Record<string, string>): Backend {
  return async (messages) => {
    const prompt = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const a = answers[prompt];
    if (a === undefined) throw new Error('no recorded answer for this prompt');
    return a;
  };
}

/**
 * Reference answers per prompt from every model we can query. Calls to hosted references cost money,
 * so answers are cached in memory and, with `file`, on disk across restarts, for `ttlMs`.
 * Concurrent requests for the same prompt share one fetch.
 */
export function createReferences(models: Record<string, Backend>, opts: { file?: string; ttlMs?: number } = {}) {
  const ttlMs = opts.ttlMs ?? 24 * 60 * 60_000;
  type Entry = { at: number; answers: Record<string, string> };
  const disk: Record<string, Entry> = opts.file && existsSync(opts.file) ? JSON.parse(readFileSync(opts.file, 'utf8')) : {};
  const inflight = new Map<string, Promise<Record<string, string>>>();
  const fresh = (e?: Entry) => !!e && Date.now() - e.at < ttlMs && Object.keys(models).every((m) => m in e.answers);

  return (prompt: string): Promise<Record<string, string>> => {
    if (fresh(disk[prompt])) return Promise.resolve(disk[prompt].answers);
    if (inflight.has(prompt)) return inflight.get(prompt)!;
    const p = (async () => {
      const entries = await Promise.all(
        Object.entries(models).map(async ([m, b]) => [m, await b([{ role: 'user', content: prompt }], { temperature: 0 })] as const),
      );
      const answers = Object.fromEntries(entries);
      disk[prompt] = { at: Date.now(), answers };
      if (opts.file) {
        mkdirSync(path.dirname(opts.file), { recursive: true });
        writeFileSync(opts.file, JSON.stringify(disk, null, 2));
      }
      return answers;
    })().finally(() => inflight.delete(prompt));
    inflight.set(prompt, p);
    return p;
  };
}

export function ollamaEmbed(url: string, model = EMBED_MODEL) {
  return async (texts: string[]): Promise<number[][]> => {
    const r = await fetch(`${url}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, input: texts, keep_alive: OLLAMA_KEEP_ALIVE }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) throw new Error(`embed HTTP ${r.status}`);
    return ((await r.json()) as { embeddings: number[][] }).embeddings;
  };
}
