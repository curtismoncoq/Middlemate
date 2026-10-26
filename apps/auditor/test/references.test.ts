import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createReferences, loadRecording, recordedBackend } from '../src/references.ts';
import { FINGERPRINT } from '../src/probes.ts';

describe('createReferences disk cache', () => {
  it('reuses reference answers across auditor restarts within the TTL', async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'tb-ref-')), 'refs.json');
    const backend = vi.fn(async () => 'ref answer');
    const first = createReferences({ m: backend }, { file, ttlMs: 60_000 });
    expect(await first('p1')).toEqual({ m: 'ref answer' });
    const second = createReferences({ m: backend }, { file, ttlMs: 60_000 }); // "restart"
    expect(await second('p1')).toEqual({ m: 'ref answer' });
    expect(backend).toHaveBeenCalledTimes(1);
  });

  it('refetches once the cached answer is older than the TTL', async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'tb-ref-')), 'refs.json');
    const backend = vi.fn(async () => 'ref answer');
    await createReferences({ m: backend }, { file, ttlMs: 0 })('p1');
    await createReferences({ m: backend }, { file, ttlMs: 0 })('p1');
    expect(backend).toHaveBeenCalledTimes(2);
  });
});

describe('recorded references (models we can only record, not query live)', () => {
  it('answers a probe prompt from the recording', async () => {
    const b = recordedBackend({ 'p1': 'recorded answer' });
    expect(await b([{ role: 'user', content: 'p1' }])).toBe('recorded answer');
  });

  it('errors on a prompt that was never recorded, so the probe is excluded rather than scored', async () => {
    await expect(recordedBackend({ p1: 'a' })([{ role: 'user', content: 'p2' }])).rejects.toThrow(/no recorded answer/);
  });

  it('has a Claude answer for every fingerprint probe (re-run `pnpm record:claude` after changing probes)', () => {
    const rec = loadRecording('claude-opus-5-5.json');
    expect(rec.model).toBe('claude-opus-5-5');
    for (const p of FINGERPRINT) expect(rec.answers[p.prompt], p.id).toMatch(/\S/);
  });
});
