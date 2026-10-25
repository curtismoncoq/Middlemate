import { minimaxBackend, ollamaBackend, type Backend } from '@tb/providers/backends';
import { verifiableModels, type Config } from '@tb/config';

export const REFERENCE_MODELS = (cfg: Config): Record<string, Backend> =>
  Object.fromEntries(
    verifiableModels(cfg.minimaxModel).map((m) => [
      m.id,
      m.reference.kind === 'minimax'
        ? minimaxBackend(cfg.minimaxBaseUrl, cfg.minimaxApiKey ?? '', cfg.minimaxModel)
        : ollamaBackend(cfg.ollamaUrl, m.reference.model),
    ]),
  );

/** Reference answers per prompt from every model we can host or call, cached for `ttlMs`. */
export function createReferences(models: Record<string, Backend>, ttlMs = 15 * 60_000) {
  const cache = new Map<string, { at: number; value: Promise<Record<string, string>> }>();
  return (prompt: string) => {
    const hit = cache.get(prompt);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = (async () => {
      const entries = await Promise.all(
        Object.entries(models).map(async ([m, b]) => [m, await b([{ role: 'user', content: prompt }], { temperature: 0 })] as const),
      );
      return Object.fromEntries(entries);
    })();
    value.catch(() => cache.delete(prompt));
    cache.set(prompt, { at: Date.now(), value });
    return value;
  };
}

export function ollamaEmbed(url: string, model = 'nomic-embed-text') {
  return async (texts: string[]): Promise<number[][]> => {
    const r = await fetch(`${url}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) throw new Error(`embed HTTP ${r.status}`);
    return ((await r.json()) as { embeddings: number[][] }).embeddings;
  };
}
