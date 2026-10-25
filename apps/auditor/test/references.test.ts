import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createReferences } from '../src/references.ts';

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
