import { describe, it, expect } from 'vitest';
import { verifiableModels, isVerifiable } from '../src/models.ts';

describe('verifiable model registry', () => {
  const models = verifiableModels('MiniMax-M2.7');
  it('lists every model the auditor can reference, with how to reach it', () => {
    expect(models.map((m) => m.id)).toEqual(['MiniMax-M2.7', 'llama3.2:3b', 'qwen2.5:0.5b']);
    expect(models[0]).toMatchObject({ label: 'MiniMax M2.7', reference: { kind: 'minimax' } });
    expect(models[2].reference).toEqual({ kind: 'ollama', model: 'qwen2.5:0.5b' });
  });
  it('treats anything else as unverifiable (exact id match)', () => {
    expect(isVerifiable('llama3.2:3b', models)).toBe(true);
    expect(isVerifiable('Llama 3.2 3B', models)).toBe(false);
    expect(isVerifiable('Claude Opus 5.5', models)).toBe(false);
  });
});
