import { StrKey } from '@stellar/stellar-sdk';
import { loadConfig } from '@tb/config';
import { fetchAudits, listingsWithAudits } from '../../../lib/server.ts';
import { buildDashboardSnapshot, marketplacePaymentEvents } from '../../../lib/dashboard.ts';
import { fetchWalletUsdcTransfers, filterDirectUsdcTransfers, type UsdcTransfer } from '../../../lib/stellar-activity.ts';

export const dynamic = 'force-dynamic';
const cfg = loadConfig();

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get('address') ?? '';
  if (!StrKey.isValidEd25519PublicKey(address)) return Response.json({ error: 'Connect a valid Stellar wallet.' }, { status: 400 });
  try {
    const [listings, audits] = await Promise.all([listingsWithAudits(), fetchAudits()]);
    let transfers: UsdcTransfer[] = [];
    let activityError: string | undefined;
    try {
      const allTransfers = await fetchWalletUsdcTransfers(cfg.rpcUrl, cfg.usdcContract, address);
      transfers = await filterDirectUsdcTransfers(cfg.rpcUrl, cfg.networkPassphrase, cfg.usdcContract, allTransfers);
    } catch (error) {
      const detail = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
      activityError = `Payment history is unavailable: ${detail}. Listings and stake below are still read from the registry.`;
    }
    const demoRecipients = (['weatherAtlas', 'weatherThermo', 'weatherRainwind'] as const)
      .map((role) => ({ provider: cfg.keys[role].public, name: 'Weather demo host (legacy payout)', claimedModel: 'api:weather@1' }));
    const events = marketplacePaymentEvents(transfers, listings, [cfg.registryContractId, cfg.listingRegistryContractId].filter((id): id is string => !!id), demoRecipients);
    const ownsWeatherDemo = listings.some((listing) => listing.provider === address && /^http:\/\/(localhost|127\.0\.0\.1):400[3-6]\/weather\/v1\/forecast(?:[?#]|$)/.test(listing.endpoint));
    const payoutNotice = ownsWeatherDemo ? 'Earlier weather demo requests paid the demo host wallet. Those transfers are shown to buyers as legacy payouts, and are not earnings of your wallet. Listing-tagged requests now pay the registered owner directly.' : undefined;
    return Response.json({ ...buildDashboardSnapshot(address, listings, events, audits), source: 'stellar-testnet', registryMode: cfg.registryMode, activityWindowDays: 7, ...(activityError ? { activityError } : {}), ...(payoutNotice ? { payoutNotice } : {}) });
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
    return Response.json({ error: `Could not read dashboard listings and stake from the registry: ${message}` }, { status: 502 });
  }
}
