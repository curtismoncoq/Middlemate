// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { stallView, streetStatus } from '../lib/stall.ts';
import { Stall } from '../components/Stall.tsx';
import type { ApiListing, AuditStatus } from '../lib/types.ts';

afterEach(cleanup);

const at = '2026-10-25T16:00:00Z';
const now = Date.parse('2026-10-25T16:00:30Z');
const base: ApiListing = { provider: 'GA', name: 'Provider A', endpoint: 'http://x', claimedModel: 'MiniMax-M2.7', priceAtomic: '200000', stakeAtomic: '50000000', active: true, verifiable: true };
const idle: AuditStatus = { running: false, current: null, feed: [] };
const pass = { at, score: 100, matchedModel: 'MiniMax-M2.7', confidence: 1, pass: true };
const slash = { at, score: 0, matchedModel: 'qwen2.5:0.5b', confidence: 1, pass: false, slashTx: 'abc', slashedAtomic: '50000000' };

describe('stallView', () => {
  it('an audited stall is open, with its trust on the door placard', () => {
    expect(stallView({ ...base, lastAudit: pass })).toMatchObject({ sign: 'PROVIDER A', window: 'MINIMAX-M2.7', price: '$0.02', state: 'open', placard: ['TRUST', '100'] });
  });
  it('a new verifiable stall is under review; while probed it shows the probe count', () => {
    expect(stallView(base)).toMatchObject({ state: 'review', placard: ['UNDER', 'REVIEW'] });
    expect(stallView(base, { probe: 3, total: 6 })).toMatchObject({ state: 'auditing', placard: ['PROBE', '3/6'] });
  });
  it('a slashed stall is shuttered with the stake it lost', () => {
    expect(stallView({ ...base, active: false, stakeAtomic: '0', lastAudit: slash })).toMatchObject({ state: 'slashed', tape: 'SLASHED · STAKE 5 → 0' });
  });
  it('unverifiable models and API listings get their own placards', () => {
    expect(stallView({ ...base, claimedModel: 'Claude Opus 5.5', verifiable: false })).toMatchObject({ state: 'unverifiable', placard: ['NOT', 'VERIFIED'] });
    expect(stallView({ ...base, claimedModel: 'api:weather@1', verifiable: false })).toMatchObject({ state: 'api', kind: 'WEATHER API', placard: ['SCHEMA', 'DECLARED'] });
  });
  it('shortens long names to fit the sign', () => {
    expect(stallView({ ...base, name: 'A very long provider name indeed' }).sign).toBe('A VERY LONG PROV…');
  });
});

describe('streetStatus', () => {
  it('leads with the audit in progress', () => {
    expect(streetStatus([base], { running: true, current: { provider: 'GA', name: 'CheapMax', probe: 3, total: 6 }, feed: [] }, now)).toBe('Auditing CheapMax now, probe 3 of 6.');
  });
  it('then a slash in the last minute, then stalls under review, then all clear', () => {
    expect(streetStatus([{ ...base, active: false, stakeAtomic: '0', name: 'CheapMax', lastAudit: slash }], idle, now)).toBe('CheapMax was just slashed.');
    expect(streetStatus([base], idle, now)).toBe('1 stall under review.');
    expect(streetStatus([{ ...base, lastAudit: pass }, { ...base, provider: 'GB', lastAudit: pass }], idle, now)).toBe('All 2 stalls audited.');
    expect(streetStatus([], idle, now)).toBe('The street is empty.');
  });
});

describe('Stall', () => {
  it('describes the stall for screen readers', () => {
    render(<Stall listing={{ ...base, lastAudit: pass }} />);
    expect(screen.getByRole('img', { name: 'Provider A: serves MiniMax-M2.7, $0.02 per request, trust 100' })).toBeTruthy();
  });
});
