import { describe, it, expect } from 'vitest';
import { validateListing } from '../lib/listForm.ts';

const MODELS = ['MiniMax-M2.7', 'llama3.2:3b', 'qwen2.5:0.5b'];

const good = { name: 'My Llama', endpoint: 'https://api.example.com/v1/chat/completions', claimedModel: 'llama3.2:3b', priceUsd: '0.005', stakeUsdc: '5' };

describe('validateListing', () => {
  it('accepts a valid listing and converts to atomic units', () => {
    const r = validateListing(good, MODELS);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ priceAtomic: '50000', stakeAtomic: '50000000' });
  });
  it('rejects a non-http endpoint', () => {
    expect(validateListing({ ...good, endpoint: 'ftp://x' }, MODELS)).toMatchObject({ ok: false, errors: { endpoint: expect.any(String) } });
  });
  it('rejects zero price and stake below 1 USDC', () => {
    const r = validateListing({ ...good, priceUsd: '0', stakeUsdc: '0.5' }, MODELS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['priceUsd', 'stakeUsdc']);
  });
  it('requires a name and a model', () => {
    const r = validateListing({ ...good, name: ' ', claimedModel: '' }, MODELS);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['claimedModel', 'name']);
    else throw new Error('expected errors');
  });

  it('rejects a model outside the registry unless the provider accepts being unverifiable', () => {
    expect(validateListing({ ...good, claimedModel: 'Claude Opus 5.5' }, MODELS)).toMatchObject({ ok: false, errors: { claimedModel: expect.stringMatching(/unverifiable/i) } });
    expect(validateListing({ ...good, claimedModel: 'Claude Opus 5.5', allowUnverifiable: true }, MODELS).ok).toBe(true);
  });
});
