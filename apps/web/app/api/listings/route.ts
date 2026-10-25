import { listingsWithAudits } from '../../../lib/server.ts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json({ listings: await listingsWithAudits() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
