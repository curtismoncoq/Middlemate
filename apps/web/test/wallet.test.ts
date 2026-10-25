// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  init: vi.fn(), setWallet: vi.fn(), authModal: vi.fn(), disconnect: vi.fn(), getAddress: vi.fn(),
}));
vi.mock('@creit.tech/stellar-wallets-kit/sdk', () => ({ StellarWalletsKit: { ...mocks, selectedModule: { getAddress: mocks.getAddress } } }));
vi.mock('@creit.tech/stellar-wallets-kit/modules/freighter', () => ({ FreighterModule: class {} }));
vi.mock('@creit.tech/stellar-wallets-kit/types', () => ({ Networks: { TESTNET: 'testnet' } }));

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) });
  vi.resetModules(); vi.clearAllMocks(); mocks.authModal.mockResolvedValue({ address: 'GCONNECTED' }); mocks.getAddress.mockResolvedValue({ address: 'GCURRENT' }); mocks.disconnect.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('wallet session restoration', () => {
  it('does not prompt or probe a wallet before the user has connected', async () => {
    const wallet = await import('../lib/wallet.ts');
    expect(await wallet.restoreConnection()).toBeNull();
    expect(mocks.init).not.toHaveBeenCalled();
    expect(mocks.authModal).not.toHaveBeenCalled();
  });

  it('restores after a page reload using the current authorized wallet address', async () => {
    const wallet = await import('../lib/wallet.ts');
    await wallet.connect();
    vi.resetModules(); mocks.authModal.mockClear();
    const reloaded = await import('../lib/wallet.ts');
    expect(await reloaded.restoreConnection()).toEqual({ address: 'GCURRENT' });
    expect(mocks.setWallet).toHaveBeenCalledWith('freighter');
    expect(mocks.getAddress).toHaveBeenCalledWith({ skipRequestAccess: true });
    expect(mocks.authModal).not.toHaveBeenCalled();
  });

  it('does not reuse an address when permission is revoked or the wallet is locked', async () => {
    const wallet = await import('../lib/wallet.ts');
    await wallet.connect(); mocks.authModal.mockClear();
    mocks.getAddress.mockRejectedValueOnce(new Error('Wallet locked'));
    expect(await wallet.restoreConnection()).toBeNull();
    expect(mocks.authModal).not.toHaveBeenCalled();
  });

  it('remembers explicit disconnect even if the kit fails to disconnect', async () => {
    const wallet = await import('../lib/wallet.ts');
    await wallet.connect();
    mocks.disconnect.mockRejectedValueOnce(new Error('Extension unavailable'));
    await wallet.disconnect().catch(() => {});
    expect(await wallet.restoreConnection()).toBeNull();
  });
});
