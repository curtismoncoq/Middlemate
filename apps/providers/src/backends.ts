export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type Backend = (messages: ChatMessage[], opts?: { temperature?: number }) => Promise<string>;

/** Removes reasoning blocks (`<think>…</think>`, or an unterminated one) from model output. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
}

export function minimaxBackend(baseUrl: string, apiKey: string, model: string): Backend {
  return async (messages, opts = {}) => {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      // MiniMax requires temperature in (0, 1].
      body: JSON.stringify({ model, messages, max_tokens: 2048, temperature: Math.min(1, Math.max(0.01, opts.temperature ?? 0.01)) }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) throw new Error(`minimax HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { choices: { message: { content: string } }[] };
    return stripThinking(j.choices[0].message.content);
  };
}

export function ollamaBackend(url: string, model: string): Backend {
  return async (messages, opts = {}) => {
    const r = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, options: { temperature: opts.temperature ?? 0, seed: 7 } }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) throw new Error(`ollama ${model} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { message: { content: string } };
    return stripThinking(j.message.content);
  };
}
