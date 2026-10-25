import { fetchAudits } from '../../../lib/server.ts';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ audits: await fetchAudits() });
}
