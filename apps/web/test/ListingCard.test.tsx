// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ListingCard } from '../components/ListingCard.tsx';
import { Catalog } from '../components/Catalog.tsx';
import type { ApiListing } from '../lib/types.ts';

afterEach(cleanup);

const base: ApiListing = {
  provider: 'GCHEAT', name: 'CheapMax', endpoint: 'http://localhost:4001/cheapmax/v1/chat/completions',
  claimedModel: 'MiniMax-M2.7', priceAtomic: '120000', stakeAtomic: '50000000', active: true,
};

describe('ListingCard', () => {
  it('shows price, stake and trust for an active listing', () => {
    const now = Date.parse('2026-10-25T15:05:00Z');
    render(<ListingCard listing={{ ...base, lastAudit: { at: '2026-10-25T15:03:00Z', score: 97, matchedModel: 'MiniMax-M2.7', confidence: 1, pass: true } }} now={now} />);
    expect(screen.getByText('$0.012')).toBeTruthy();
    expect(screen.getByText(/Staked 5 USDC/)).toBeTruthy();
    expect(screen.getByText(/Trust 97/)).toBeTruthy();
    expect(screen.getByText(/audited 2m ago/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Try it/ })).toBeTruthy();
  });

  it('shows the slashed state with the matched model and tx link', () => {
    render(<ListingCard listing={{ ...base, active: false, stakeAtomic: '0', lastAudit: { at: '2026-10-25T15:03:00Z', score: 0, matchedModel: 'qwen2.5:0.5b', confidence: 1, pass: false, slashTx: 'abfa5a43', slashedAtomic: '50000000' } }} now={Date.now()} />);
    expect(screen.getByText(/SLASHED · DELISTED/)).toBeTruthy();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Actually matched: qwen2.5:0.5b (100%)')).toBeTruthy();
    expect(screen.getByText(/5 → 0 USDC/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /slash tx/ }).getAttribute('href')).toBe('https://stellar.expert/explorer/testnet/tx/abfa5a43');
  });
});

describe('Catalog states', () => {
  it('shows an error state when the registry is unavailable', () => {
    render(<Catalog state={{ status: 'error', message: 'rpc down' }} now={Date.now()} />);
    expect(screen.getByText(/Registry unavailable — retrying/)).toBeTruthy();
  });

  it('shows an empty state with no listings', () => {
    render(<Catalog state={{ status: 'ok', listings: [] }} now={Date.now()} />);
    expect(screen.getByText(/No listings yet/)).toBeTruthy();
  });

  it('hides slashed listings 20s after the slash', () => {
    const slashed = { ...base, active: false, stakeAtomic: '0', lastAudit: { at: '2026-10-25T15:00:00Z', score: 0, matchedModel: 'qwen2.5:0.5b', confidence: 1, pass: false, slashTx: 't' } };
    const { rerender } = render(<Catalog state={{ status: 'ok', listings: [slashed] }} now={Date.parse('2026-10-25T15:00:10Z')} />);
    expect(screen.queryByText('CheapMax')).toBeTruthy();
    rerender(<Catalog state={{ status: 'ok', listings: [slashed] }} now={Date.parse('2026-10-25T15:00:25Z')} />);
    expect(screen.queryByText('CheapMax')).toBeNull();
  });
});
