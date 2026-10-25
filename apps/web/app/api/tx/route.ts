import { loadConfig } from '@tb/config';
import { buildUnsignedTx, submitSignedTx, type WalletCall } from '@tb/registry-client';

export const dynamic = 'force-dynamic';
const cfg = loadConfig();

type Body =
  | { action: 'build'; publicKey: string; call: { method: WalletCall['method']; args: Record<string, string> } }
  | { action: 'submit'; xdr: string };

/** Builds unsigned registry transactions for a browser wallet, and submits them once signed. */
export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  try {
    if (b.action === 'submit') return Response.json(await submitSignedTx(cfg, b.xdr));
    const a = b.call.args;
    let call: WalletCall;
    switch (b.call.method) {
      case 'register': call = { method: 'register', args: { name: a.name, endpoint: a.endpoint, claimedModel: a.claimedModel, priceAtomic: BigInt(a.priceAtomic) } }; break;
      case 'registerEndpoint': call = { method: 'registerEndpoint', args: { id: a.id, name: a.name, endpoint: a.endpoint, claimedModel: a.claimedModel, priceAtomic: BigInt(a.priceAtomic), amountAtomic: BigInt(a.amountAtomic) } }; break;
      case 'stake': call = { method: 'stake', args: { amountAtomic: BigInt(a.amountAtomic) } }; break;
      case 'stakeEndpoint': call = { method: 'stakeEndpoint', args: { id: a.id, amountAtomic: BigInt(a.amountAtomic) } }; break;
      case 'unregister': call = { method: 'unregister', args: { provider: a.provider } }; break;
      case 'renameEndpoint': call = { method: 'renameEndpoint', args: { id: a.id, name: a.name } }; break;
      case 'requestExit': case 'cancelExit': case 'withdrawEndpoint': call = { method: b.call.method, args: { id: a.id } }; break;
      default: throw new Error('Unsupported registry operation');
    }
    return Response.json({ xdr: await buildUnsignedTx(cfg, b.publicKey, call) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
