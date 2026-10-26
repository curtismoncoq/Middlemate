import { createHash } from 'node:crypto';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { loadConfig, type Config } from '@tb/config';
import type { CommunityCall, Decision, Reputation, Review } from './types.ts';
export type * from './types.ts';
export { providerEventKeys } from './notifications.ts';

export class CommunityError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const hashText = (text: string) => createHash('sha256').update(text).digest('hex');
export function verifyWalletMessage(wallet: string, message: string, signature: string): boolean {
  try {
    if (!StrKey.isValidEd25519PublicKey(wallet)) return false;
    const bytes = Buffer.from(signature, /^[0-9a-f]{128}$/i.test(signature) ? 'hex' : 'base64');
    return bytes.length === 64 && Keypair.fromPublicKey(wallet).verify(createHash('sha256').update(`Stellar Signed Message:\n${message}`).digest(), bytes);
  } catch { return false; }
}

type Table = 'community_reads' | 'community_calls' | 'community_reviews' | 'community_reports' | 'community_decisions' | 'community_audits' | 'community_challenges' | 'community_sessions';
export function createCommunityStore(cfg: Config = loadConfig()) {
  if (!cfg.supabaseUrl && !cfg.supabaseSecretKey) return null;
  if (!cfg.supabaseUrl || !cfg.supabaseSecretKey) throw new CommunityError('Set both SUPABASE_URL and SUPABASE_SECRET_KEY on the server.', 503);
  const url = new URL(cfg.supabaseUrl);
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new CommunityError('Supabase requires HTTPS.', 503);
  const key = cfg.supabaseSecretKey;
  const namespace = cfg.communityNamespace;
  if (!/^[a-zA-Z0-9:_-]{1,200}$/.test(namespace)) throw new CommunityError('Invalid COMMUNITY_NAMESPACE.', 503);
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('apikey', key);
    if (key.startsWith('eyJ')) headers.set('authorization', `Bearer ${key}`);
    headers.set('content-type', 'application/json');
    const response = await fetch(`${url.origin}/rest/v1/${path}`, { ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string; code?: string };
      if (response.status === 401 || response.status === 403) throw new CommunityError('Supabase rejected the server key or table grants. Check the setup guide.', 503);
      if (['42P01','PGRST205'].includes(body.code ?? '') && path.startsWith('community_reads')) throw new CommunityError('Run supabase/migrations/202610260002_community_reads.sql to enable persistent notifications.', 503);
      if (['42P01','PGRST205','PGRST202'].includes(body.code ?? '')) throw new CommunityError('Supabase migration is missing. Run supabase/migrations/202610250001_community_trust.sql.', 503);
      throw new CommunityError(body.message?.slice(0, 500) ?? `Database HTTP ${response.status}`, response.status >= 500 ? 503 : 409);
    }
    return response.status === 204 ? undefined as T : await response.json() as T;
  }
  const query = (filters: Record<string,string>) => new URLSearchParams({ ...filters, namespace: `eq.${namespace}` }).toString();
  return {
    namespace,
    async rows<T>(table: Table, filters: Record<string,string> = {}): Promise<T[]> { return request(`${table}?${query(filters)}`); },
    async all<T>(table: Table, filters: Record<string,string> = {}): Promise<T[]> {
      const rows: T[] = [];
      for (let offset = 0; offset < 10000; offset += 1000) {
        const page = await request<T[]>(`${table}?${query({ ...filters, limit: '1000', offset: String(offset) })}`);
        rows.push(...page);
        if (page.length < 1000) return rows;
      }
      throw new CommunityError('Community history exceeds the current query limit.', 503);
    },
    async insert<T>(table: Table, value: Record<string,unknown> | Record<string,unknown>[], conflict?: string): Promise<T[]> {
      const values = (Array.isArray(value) ? value : [value]).map((row) => ({ ...row, namespace }));
      return request(`${table}${conflict ? `?on_conflict=${encodeURIComponent(conflict)}` : ''}`, { method: 'POST', headers: { prefer: `return=representation${conflict ? ',resolution=ignore-duplicates' : ''}` }, body: JSON.stringify(values) });
    },
    async patch<T>(table: Table, filters: Record<string,string>, values: Record<string,unknown>): Promise<T[]> {
      return request(`${table}?${query(filters)}`, { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(values) });
    },
    async rpc<T>(name: string, values: Record<string,unknown>): Promise<T> {
      return request(`rpc/${name}`, { method: 'POST', body: JSON.stringify({ ...values, p_namespace: namespace }) });
    },
  };
}
export type CommunityStore = NonNullable<ReturnType<typeof createCommunityStore>>;

export function reputation(reviews: Review[], calls: CommunityCall[], decisions: Decision[]): Reputation {
  const positive = reviews.filter((review) => review.vote === 1).length;
  const ratio = (values: boolean[]) => values.length ? Math.round(1000 * values.filter(Boolean).length / values.length) / 10 : null;
  return {
    positive, negative: reviews.length - positive, total: reviews.length, positivePct: ratio(reviews.map((review) => review.vote === 1)),
    samples: calls.length, responseSuccessPct: ratio(calls.map((call) => call.response_ok)),
    schemaValidPct: ratio(calls.flatMap((call) => call.schema_valid === null ? [] : [call.schema_valid])),
    fieldsPresentPct: ratio(calls.flatMap((call) => call.fields_present === null ? [] : [call.fields_present])),
    reviews, decisions,
  };
}
