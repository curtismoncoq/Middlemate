import { describe, it, expect } from 'vitest';
import { cosine, closestReference, computeVerdict, type ProbeResult } from '../src/scoring.ts';

const fp = (model: string): ProbeResult => ({ probeId: 'f', kind: 'fingerprint', status: 'ok', answer: 'x', closest: { model, similarity: 0.95, margins: {} } });
const chk = (correct: boolean): ProbeResult => ({ probeId: 'c', kind: 'checkable', status: 'ok', answer: 'x', correct });
const err = (): ProbeResult => ({ probeId: 'e', kind: 'fingerprint', status: 'error', error: 'timeout' });

describe('cosine', () => {
  it('is 1 for identical and 0 for orthogonal vectors', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe('closestReference', () => {
  it('picks the reference with the highest similarity', () => {
    const r = closestReference([1, 0.1], { a: [0, 1], b: [1, 0], c: [0.5, 0.5] });
    expect(r.model).toBe('b');
    expect(r.margins.a).toBeLessThan(r.margins.b);
  });
});

describe('computeVerdict', () => {
  it('fails a listing whose answers match a different model', () => {
    const v = computeVerdict('MiniMax-M2.7', [fp('qwen2.5:0.5b'), fp('qwen2.5:0.5b'), fp('qwen2.5:0.5b'), fp('qwen2.5:0.5b'), chk(false), chk(false)]);
    expect(v.pass).toBe(false);
    expect(v.matchedModel).toBe('qwen2.5:0.5b');
    expect(v.score).toBeLessThan(60);
    expect(v.confidence).toBeCloseTo(1);
  });

  it('passes an honest listing that misses one checkable probe', () => {
    const v = computeVerdict('MiniMax-M2.7', [fp('MiniMax-M2.7'), fp('MiniMax-M2.7'), fp('MiniMax-M2.7'), fp('MiniMax-M2.7'), chk(true), chk(false)]);
    expect(v.pass).toBe(true);
    expect(v.score).toBeGreaterThanOrEqual(60);
    expect(v.matchedModel).toBe('MiniMax-M2.7');
  });

  it('is inconclusive (passes, never slashes) with fewer than 5 scored probes', () => {
    const v = computeVerdict('MiniMax-M2.7', [err(), err(), fp('qwen2.5:0.5b'), fp('qwen2.5:0.5b'), chk(false), chk(false)]);
    expect(v.scored).toBe(4);
    expect(v.pass).toBe(true);
    expect(v.inconclusive).toBe(true);
  });

  it('marks a listing that claims a model we have no reference for as unverifiable, never failing it', () => {
    const v = computeVerdict('Claude Opus 5.5', [fp('llama3.2:3b'), fp('llama3.2:3b'), fp('llama3.2:3b'), fp('llama3.2:3b'), chk(true), chk(false)], ['MiniMax-M2.7', 'llama3.2:3b', 'qwen2.5:0.5b']);
    expect(v.unverifiable).toBe(true);
    expect(v.pass).toBe(true);
    expect(v.inconclusive).toBe(true);
    expect(v.matchedModel).toBe('llama3.2:3b');
  });
});
