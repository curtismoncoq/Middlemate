// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WalletProvider, useWallet } from '../components/WalletContext.tsx';

const wallet = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn(), restoreConnection: vi.fn() }));
vi.mock('../lib/wallet.ts', () => ({ ...wallet, WALLET_SESSION_KEY: 'test-wallet' }));
vi.mock('../lib/x402-browser.ts', () => ({ createBrowserPayingFetch: () => vi.fn() }));

function Status() {
  const w = useWallet();
  return <><output>{w.address ?? 'disconnected'}</output><button onClick={w.connect}>Connect</button><button onClick={w.disconnect}>Disconnect</button></>;
}
const mount = () => render(<WalletProvider><Status /></WalletProvider>);
beforeEach(() => { vi.clearAllMocks(); wallet.restoreConnection.mockResolvedValue({ address: 'GONE' }); wallet.disconnect.mockResolvedValue(undefined); });
afterEach(cleanup);

it('restores the wallet after remount without opening the connection modal', async () => {
  const first = mount();
  await screen.findByText('GONE');
  first.unmount();
  mount();
  await screen.findByText('GONE');
  expect(wallet.connect).not.toHaveBeenCalled();
});

it('ignores an old restoration result after explicit disconnect', async () => {
  let resolve!: (result: { address: string }) => void;
  wallet.restoreConnection.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
  await act(async () => resolve({ address: 'GOLD' }));
  expect(screen.getByText('disconnected')).toBeTruthy();
});

it('updates the address from the wallet when the user returns to the page', async () => {
  mount();
  await screen.findByText('GONE');
  wallet.restoreConnection.mockResolvedValue({ address: 'GTWO' });
  fireEvent(window, new Event('focus'));
  await screen.findByText('GTWO');
});

it('honors disconnect if an older connection modal resolves afterwards', async () => {
  let resolve!: (result: { address: string }) => void;
  wallet.connect.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  mount();
  await screen.findByText('GONE');
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
  await act(async () => resolve({ address: 'GLATE' }));
  expect(screen.getByText('disconnected')).toBeTruthy();
  expect(wallet.disconnect).toHaveBeenCalledTimes(2);
});
