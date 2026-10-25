// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ListingCard } from '../components/ListingCard.tsx';
import { Catalog } from '../components/Catalog.tsx';
import type { ApiListing } from '../lib/types.ts';

afterEach(cleanup);

const base: ApiListing = {
  provider: 'GA', name: 'Provider A', endpoint: 'http://x', claimedModel: 'MiniMax-M2.7', priceAtomic: '200000', stakeAtomic: '50000000', active: true, verifiable: true,
};
const passed = { at: '2026-10-25T15:03:00Z', score: 97, matchedModel: 'MiniMax-M2.7', confidence: 1, pass: true };

describe('trust meter', () => {
  it('shows the audited score as a meter against the slash line', () => {
    render(<ListingCard listing={{ ...base, lastAudit: passed }} now={Date.now()} />);
    const m = screen.getByRole('meter', { name: /Trust score/ });
    expect(m.getAttribute('aria-valuenow')).toBe('97');
    expect(m.getAttribute('aria-valuemin')).toBe('0');
    expect(m.getAttribute('aria-valuemax')).toBe('100');
  });

  it('draws the slashed score at 0', () => {
    render(<ListingCard listing={{ ...base, active: false, stakeAtomic: '0', lastAudit: { ...passed, score: 0, pass: false, matchedModel: 'qwen2.5:0.5b', slashTx: 'abc', slashedAtomic: '50000000' } }} now={Date.now()} />);
    expect(screen.getByRole('meter', { name: /Trust score/ }).getAttribute('aria-valuenow')).toBe('0');
  });

  it('has no meter before an audit, for unverifiable models, or for API listings', () => {
    render(<ListingCard listing={base} now={Date.now()} />);
    render(<ListingCard listing={{ ...base, provider: 'GB', claimedModel: 'Claude Opus 5.5', verifiable: false }} now={Date.now()} />);
    render(<ListingCard listing={{ ...base, provider: 'GC', claimedModel: 'api:weather@1', verifiable: false }} now={Date.now()} />);
    expect(screen.queryByRole('meter')).toBeNull();
  });
});

describe('catalog filter counts', () => {
  it('labels each filter tab with the number of visible listings in it', () => {
    const listings = [base, { ...base, provider: 'GB', name: 'Llama', claimedModel: 'llama3.2:3b' }, { ...base, provider: 'GC', name: 'Weather', claimedModel: 'api:weather@1' }];
    render(<Catalog state={{ status: 'ok', listings }} now={Date.now()} />);
    expect(screen.getByRole('button', { name: 'All 3' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Inference 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'API 1' })).toBeTruthy();
  });
});
