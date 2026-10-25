import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { StrKey } from '@stellar/stellar-sdk';
import { loadConfig } from '@tb/config';
import { CommunityError, createCommunityStore, hashText, verifyWalletMessage } from '@tb/community';

export const communityConfig = loadConfig();
export function database() {
  const db = createCommunityStore(communityConfig);
  if (!db) throw new CommunityError('Community features need Supabase. Follow docs/supabase-setup.md.', 503);
  return db;
}
export const isModerator = (wallet: string) => communityConfig.moderatorWallets.includes(wallet);
export function sameOrigin(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin) throw new CommunityError('Use the marketplace origin for this action.', 403);
}
export function text(value: unknown, label: string, min = 1, max = 1000) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new CommunityError(`${label} must contain ${min}–${max} characters.`);
  return value.trim();
}
export function uuid(value: unknown) {
  const id = text(value, 'ID', 36, 36);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new CommunityError('Invalid ID.');
  return id;
}
export function walletAddress(value: unknown) {
  const wallet = text(value, 'Wallet', 56, 56);
  if (!StrKey.isValidEd25519PublicKey(wallet)) throw new CommunityError('A Stellar wallet is required.');
  return wallet;
}
const SESSION = 'tb_community_session';
export async function sessionWallet(req: Request): Promise<string | null> {
  const token = req.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION}=`))?.slice(SESSION.length + 1);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const [session] = await database().rows<{wallet:string}>('community_sessions', { token_hash: `eq.${hashText(token)}`, expires_at: `gt.${new Date().toISOString()}`, limit: '1' });
  return session?.wallet ?? null;
}
export async function requireWallet(req: Request) {
  const wallet = await sessionWallet(req);
  if (!wallet) throw new CommunityError('Verify your wallet to use community features.', 401);
  return wallet;
}
export async function challenge(req: Request, wallet: string, purpose = 'login', detail = 'Verify your wallet for reviews and reports. No transaction or fee.') {
  const db = database();
  const recent = await db.rows('community_challenges', {wallet:`eq.${wallet}`,created_at:`gt.${new Date(Date.now()-60000).toISOString()}`,limit:'10'});
  if (recent.length >= 10) throw new CommunityError('Too many wallet challenges. Wait one minute.',429);
  const id = randomUUID();
  const expires = new Date(Date.now() + 5 * 60000).toISOString();
  const origin = new URL(req.url).origin;
  const message = `TrustBazaar\n${detail}\nOrigin: ${origin}\nNetwork: stellar:testnet\nNamespace: ${db.namespace}\nWallet: ${wallet}\nPurpose: ${purpose}\nNonce: ${id}\nExpires: ${expires}`;
  await db.insert('community_challenges', { id, wallet, origin, purpose, message, expires_at: expires });
  return { id, message, expires };
}
export async function consumeChallenge(req: Request, id: string, signature: string, purpose: string, expectedWallet?: string) {
  const db = database();
  const origin = new URL(req.url).origin;
  const [row] = await db.rows<{wallet:string; message:string; purpose:string; origin:string; expires_at:string; used_at:string|null}>('community_challenges', { id: `eq.${id}`, limit: '1' });
  if (!row || row.purpose !== purpose || row.origin !== origin || row.used_at || Date.parse(row.expires_at) <= Date.now() || (expectedWallet && row.wallet !== expectedWallet) || !verifyWalletMessage(row.wallet, row.message, signature)) throw new CommunityError('Invalid, expired or already used wallet signature.', 401);
  const used = await db.patch('community_challenges', { id: `eq.${id}`, used_at: 'is.null', expires_at: `gt.${new Date().toISOString()}` }, { used_at: new Date().toISOString() });
  if (used.length !== 1) throw new CommunityError('This signature was already used.', 401);
  return row.wallet;
}
export async function createSession(req: Request, wallet: string) {
  const token = randomBytes(32).toString('hex');
  await database().insert('community_sessions', { token_hash: hashText(token), wallet, expires_at: new Date(Date.now() + 12 * 3600000).toISOString() });
  return `${SESSION}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export function communityError(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : 'Community request failed.' }, { status: error instanceof CommunityError ? error.status : 503 });
}
