import { AUDITOR_URL } from '../../../../lib/server.ts';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.text();
  try {
    const r = await fetch(`${AUDITOR_URL}/audit/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body || '{}' });
    return new Response(await r.text(), { status: r.status, headers: { 'content-type': 'application/json' } });
  } catch {
    return Response.json({ error: 'auditor is not running (pnpm --filter @tb/auditor start)' }, { status: 503 });
  }
}
