import { StrKey } from '@stellar/stellar-sdk';
import { loadConfig } from '@tb/config';
import { fetchAudits, listingsWithAudits } from '../../../lib/server.ts';
import { buildDashboardSnapshot, marketplacePaymentEvents } from '../../../lib/dashboard.ts';
import { fetchRecentUsdcTransfers, type UsdcTransfer } from '../../../lib/stellar-activity.ts';

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
      transfers = await fetchRecentUsdcTransfers(cfg.rpcUrl, cfg.usdcContract, listings.map((listing) => listing.provider));
    } catch (error) {
      const detail = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
      activityError = `Payment history is unavailable: ${detail}. Listings and stake below are still read from the registry.`;
    }
    const events = marketplacePaymentEvents(transfers, listings, [cfg.registryContractId, cfg.listingRegistryContractId].filter((id): id is string => !!id));
    return Response.json({ ...buildDashboardSnapshot(address, listings, events, audits), source: 'stellar-testnet', registryMode: cfg.registryMode, activityWindowDays: 7, ...(activityError ? { activityError } : {}) });
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
    return Response.json({ error: `Could not read dashboard listings and stake from the registry: ${message}` }, { status: 502 });
  }
}
