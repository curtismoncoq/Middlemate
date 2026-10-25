import { fetchAuditStatus, listingsWithAudits } from '../../../lib/server.ts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [listings, audit] = await Promise.all([listingsWithAudits(), fetchAuditStatus()]);
    return Response.json({ listings, audit });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
