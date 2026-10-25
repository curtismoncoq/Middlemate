import { loadConfig } from '@tb/config';
import { buildUnsignedTx, submitSignedTx } from '@tb/registry-client';

export const dynamic = 'force-dynamic';
const cfg = loadConfig();

type Body =
  | { action: 'build'; publicKey: string; call: { method: 'register'; args: { name: string; endpoint: string; claimedModel: string; priceAtomic: string } } | { method: 'stake'; args: { amountAtomic: string } } }
  | { action: 'submit'; xdr: string };

/** Builds unsigned registry transactions for a browser wallet, and submits them once signed. */
export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  try {
    if (b.action === 'submit') return Response.json(await submitSignedTx(cfg, b.xdr));
    const call =
      b.call.method === 'register'
        ? { method: 'register' as const, args: { ...b.call.args, priceAtomic: BigInt(b.call.args.priceAtomic) } }
        : { method: 'stake' as const, args: { amountAtomic: BigInt(b.call.args.amountAtomic) } };
    return Response.json({ xdr: await buildUnsignedTx(cfg, b.publicKey, call) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
