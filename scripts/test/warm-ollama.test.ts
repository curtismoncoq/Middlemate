import { describe, it, expect } from 'vitest';
import { warmOllama } from '../warm-ollama.ts';

type Call = { url: string; body: Record<string, unknown> };
const fakeFetch = (fail: string[] = []) => {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, body });
    return new Response('{}', { status: fail.includes(body.model) ? 404 : 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
};

describe('warmOllama', () => {
  it('loads chat models with /api/generate and the embedder with /api/embed, keeping them loaded', async () => {
    const { f, calls } = fakeFetch();
    await warmOllama('http://ollama', ['llama3.2:3b', 'nomic-embed-text'], 'nomic-embed-text', f);
    expect(calls).toEqual([
      { url: 'http://ollama/api/generate', body: { model: 'llama3.2:3b', keep_alive: '30m' } },
      { url: 'http://ollama/api/embed', body: { model: 'nomic-embed-text', input: 'warm', keep_alive: '30m' } },
    ]);
  });

  it('reports a model that fails to load instead of throwing', async () => {
    const { f } = fakeFetch(['qwen2.5:0.5b']);
    const r = await warmOllama('http://ollama', ['qwen2.5:0.5b', 'llama3.2:3b'], 'nomic-embed-text', f);
    expect(r.map((x) => [x.model, x.ok])).toEqual([['qwen2.5:0.5b', false], ['llama3.2:3b', true]]);
    expect(r[0].error).toMatch(/404/);
  });
});
