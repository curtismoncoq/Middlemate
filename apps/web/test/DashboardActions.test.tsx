// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DashboardPage from '../app/dashboard/page.tsx';
import { buildDashboardSnapshot } from '../lib/dashboard.ts';
import type { ApiListing } from '../lib/types.ts';
import { signTransaction } from '../lib/wallet.ts';

const owner = 'GOWNER';
vi.mock('../components/WalletContext.tsx', () => ({ useWallet: () => ({ address: 'GOWNER', connect: vi.fn() }) }));
vi.mock('../lib/wallet.ts', () => ({ signTransaction: vi.fn(async () => 'signed') }));
const listing = (id: string, name: string): ApiListing => ({ id, provider: owner, name, endpoint: 'https://weather.example/forecast', claimedModel: 'api:weather@1', priceAtomic: '10000', stakeAtomic: '50000000', active: true });

function setup(listings: ApiListing[]) {
  const calls: { action: string; call?: { method: string; args: Record<string, string> }; xdr?: string }[] = [];
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/dashboard')) return Response.json({ ...buildDashboardSnapshot(owner, listings, [], []), registryMode: 'onchain' });
    const body = JSON.parse(String(init?.body)); calls.push(body);
    return Response.json(body.action === 'build' ? { xdr: 'unsigned' } : { hash: 'confirmed-hash' });
  }));
  render(<DashboardPage />);
  return calls;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.mocked(signTransaction).mockResolvedValue('signed'); });

describe('provider wallet actions', () => {
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
