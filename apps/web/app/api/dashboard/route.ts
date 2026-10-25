import { StrKey } from '@stellar/stellar-sdk';
import { loadConfig } from '@tb/config';
import { fetchAudits, listingsWithAudits } from '../../../lib/server.ts';
import { buildDashboardSnapshot, type DashboardEvent } from '../../../lib/dashboard.ts';
import { fetchRecentUsdcTransfers } from '../../../lib/stellar-activity.ts';

export const dynamic = 'force-dynamic';
const cfg = loadConfig();

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get('address') ?? '';
  if (!StrKey.isValidEd25519PublicKey(address)) return Response.json({ error: 'Connect a valid Stellar wallet.' }, { status: 400 });
  try {
    const [listings, audits] = await Promise.all([listingsWithAudits(), fetchAudits()]);
    const transfers = await fetchRecentUsdcTransfers(cfg.rpcUrl, cfg.usdcContract, listings.map((listing) => listing.provider));
    const byProvider = new Map(listings.map((listing) => [listing.provider, listing]));
    const events: DashboardEvent[] = transfers.flatMap((transfer) => {
      const listing = byProvider.get(transfer.provider);
      if (!listing) return [];
      return [{
        id: transfer.id, at: transfer.at, provider: transfer.provider, payer: transfer.payer,
        listingName: listing.name, claimedModel: listing.claimedModel,
        amountAtomic: transfer.amountAtomic, txHash: transfer.txHash,
      }];
    }).sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
    return Response.json({ ...buildDashboardSnapshot(address, listings, events, audits), source: 'stellar-testnet', registryMode: cfg.registryMode, activityWindowDays: 7 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stellar Testnet RPC is unavailable.';
    return Response.json({ error: `Could not load onchain dashboard activity: ${message}` }, { status: 502 });
  }
}
