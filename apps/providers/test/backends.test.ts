import { describe, it, expect, vi, afterEach } from 'vitest';
import { ollamaBackend } from '../src/backends.ts';

afterEach(() => vi.unstubAllGlobals());

describe('ollamaBackend', () => {
  it('asks Ollama to keep the model loaded between demo clips', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: { content: 'hi' } })));
    vi.stubGlobal('fetch', fetchMock);
    await ollamaBackend('http://ollama', 'qwen2.5:0.5b')([{ role: 'user', content: 'x' }]);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.keep_alive).toBe('30m');
  });
});
