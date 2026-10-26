import { OLLAMA_KEEP_ALIVE } from '@tb/config';

export type WarmResult = { model: string; ok: boolean; ms: number; error?: string };

/** Loads each model into Ollama so the first audit on camera doesn't wait for a cold start. Never throws. */
export async function warmOllama(url: string, models: string[], embedModel: string, fetchImpl: typeof fetch = fetch): Promise<WarmResult[]> {
  const results: WarmResult[] = [];
  for (const model of models) {
    const t0 = Date.now();
    const [route, body] = model === embedModel ? ['embed', { model, input: 'warm', keep_alive: OLLAMA_KEEP_ALIVE }] : ['generate', { model, keep_alive: OLLAMA_KEEP_ALIVE }];
    try {
      const r = await fetchImpl(`${url}/api/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
      results.push(r.ok ? { model, ok: true, ms: Date.now() - t0 } : { model, ok: false, ms: Date.now() - t0, error: `HTTP ${r.status}` });
    } catch (e) {
      results.push({ model, ok: false, ms: Date.now() - t0, error: (e as Error).message });
    }
  }
  return results;
}
