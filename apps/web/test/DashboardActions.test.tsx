// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DashboardPage from '../app/dashboard/page.tsx';
import { buildDashboardSnapshot, type DashboardAudit } from '../lib/dashboard.ts';
import type { ApiListing } from '../lib/types.ts';
import { signTransaction } from '../lib/wallet.ts';

const owner = 'GOWNER';
vi.mock('../components/WalletContext.tsx', () => ({ useWallet: () => ({ address: 'GOWNER', connect: vi.fn() }) }));
vi.mock('../lib/wallet.ts', () => ({ signTransaction: vi.fn(async () => 'signed') }));
const listing = (id: string, name: string): ApiListing => ({ id, provider: owner, name, endpoint: 'https://weather.example/forecast', claimedModel: 'api:weather@1', priceAtomic: '10000', stakeAtomic: '50000000', active: true });

function setup(listings: ApiListing[], audits: DashboardAudit[] = []) {
  const calls: { action: string; call?: { method: string; args: Record<string, string> }; xdr?: string }[] = [];
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/dashboard')) return Response.json({ ...buildDashboardSnapshot(owner, listings, [], []), audits, registryMode: 'onchain' });
    const body = JSON.parse(String(init?.body)); calls.push(body);
    return Response.json(body.action === 'build' ? { xdr: 'unsigned' } : { hash: 'confirmed-hash' });
  }));
  render(<DashboardPage />);
  return calls;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.mocked(signTransaction).mockResolvedValue('signed'); });

describe('provider wallet actions', () => {
  it('explains the weather grade and displays the field score, error and tolerance', async () => {
    setup([listing('one', 'Weather')], [{
      listingId: 'one', at: '2026-10-25T21:25:00Z', name: 'Weather', score: 90, pass: true, inconclusive: false,
      weather: { scoringVersion: 'distance-v1', source: 'MET Norway', referenceUrl: 'https://api.met.no/weatherapi/locationforecast/2.0/', extraFields: [], probes: [{
        id: 'oslo', request: { latitude: 59.9139, longitude: 10.7522, forecastHours: 1 }, status: 'ok',
        fields: [{ id: 'forecast.temperatureC', providerValue: 19, referenceValue: 18, tolerance: 2, delta: 1, score: 90, pass: true }],
      }] },
    }]);
    fireEvent.click(await screen.findByText('View MET Norway evidence'));
    expect(screen.getByText(/overall grade is the average, rounded down/)).toBeTruthy();
    expect(screen.getByText(/90\/100 · Δ 1 · Tolerance: 2/)).toBeTruthy();
  });

  it.each([
    { pass: true, status: 'Verified' },
    { pass: false, status: 'Failed' },
  ])('renders a $status audit with no warning metadata', async ({ pass, status }) => {
    setup([listing('one', 'Weather')], [{ listingId: 'one', at: '2026-10-25T21:25:00Z', name: 'Weather', score: pass ? 100 : 0, pass, inconclusive: false }]);
    expect(await screen.findByText(new RegExp(`· ${status}$`))).toBeTruthy();
  });

  it('uses the legacy unregister refund for an existing legacy listing', async () => {
    const { id: _id, ...legacy } = listing('legacy', 'Old listing');
    const calls = setup([legacy]);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove & unstake' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0].call).toEqual({ method: 'unregister', args: { provider: owner } });
  });
  it('requests exit for the selected listing ID and signs before submitting', async () => {
    const calls = setup([listing('one', 'Temperature'), listing('two', 'Rain')]);
    const title = await screen.findByText('Rain');
    fireEvent.click(within(title.closest('article')!).getByRole('button', { name: 'Remove & unstake' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]).toMatchObject({ action: 'build', call: { method: 'requestExit', args: { id: 'two' } } });
    expect(signTransaction).toHaveBeenCalledWith('unsigned', owner);
    expect(calls[1]).toEqual({ action: 'submit', xdr: 'signed' });
  });

  it('withdraws a ready listing only after wallet confirmation', async () => {
    const calls = setup([{ ...listing('ready', 'Rain'), exitAt: Math.floor(Date.now() / 1000) - 5, active: false }]);
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw 5 USDC' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0].call).toEqual({ method: 'withdrawEndpoint', args: { id: 'ready' } });
  });

  it('does not submit a transaction when wallet signing is rejected', async () => {
    vi.mocked(signTransaction).mockRejectedValueOnce(new Error('User rejected signing'));
    const calls = setup([listing('one', 'Temperature')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove & unstake' }));
    await screen.findByText('User rejected signing');
    expect(calls).toHaveLength(1);
  });
});

it('switches between the three dashboard sections',async()=>{
  setup([listing('one','Weather')]);
  const provider=await screen.findByRole('tab',{name:'Provider studio'});
  expect(provider.getAttribute('aria-selected')).toBe('true');
  fireEvent.click(screen.getByRole('tab',{name:'Buyer activity'}));
  expect(screen.getByRole('heading',{name:'Your usage & spend'})).toBeTruthy();
  expect(provider.getAttribute('aria-selected')).toBe('false');
  fireEvent.click(screen.getByRole('tab',{name:/Community/}));
  expect(screen.getByRole('heading',{name:'Community workspace'})).toBeTruthy();
});
