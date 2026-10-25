// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ListingCard } from '../components/ListingCard.tsx';
import { AuditFeed } from '../components/AuditFeed.tsx';
import type { ApiListing } from '../lib/types.ts';

afterEach(cleanup);

const l: ApiListing = {
  provider: 'GCHEAT', name: 'CheapMax', endpoint: 'http://x', claimedModel: 'MiniMax-M2.7', priceAtomic: '120000', stakeAtomic: '50000000', active: true,
};

describe('live audit UI', () => {
  it('shows a being-audited badge with probe progress on the card under audit', () => {
    render(<ListingCard listing={l} now={Date.now()} auditing={{ probe: 3, total: 6 }} />);
    expect(screen.getByText(/Being audited · probe 3\/6/)).toBeTruthy();
  });

  it('renders the latest probe lines, newest first, and nothing when idle with no feed', () => {
    const feed = [
      { at: '2026-10-25T16:00:00Z', provider: 'GCHEAT', name: 'CheapMax', line: 'f-pitch → closest qwen2.5:0.5b (1.000)' },
      { at: '2026-10-25T16:00:09Z', provider: 'GCHEAT', name: 'CheapMax', line: 'c-days → wrong' },
    ];
    const { container, rerender } = render(<AuditFeed status={{ running: true, current: { provider: 'GCHEAT', name: 'CheapMax', probe: 2, total: 6 }, feed }} />);
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent);
    expect(items[0]).toContain('c-days → wrong');
    expect(items[1]).toContain('closest qwen2.5:0.5b');
    expect(screen.getByText(/Auditing CheapMax/)).toBeTruthy();
    rerender(<AuditFeed status={{ running: false, current: null, feed: [] }} />);
    expect(container.textContent).toBe('');
  });
});
