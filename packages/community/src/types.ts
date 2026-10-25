export type CommunityCall = {
  id: string; namespace: string; listing_id: string; listing_name: string; provider: string; buyer: string;
  endpoint: string; tx_hash: string; amount_atomic: string; source: 'human' | 'agent' | 'audit';
  response_ok: boolean; schema_valid: boolean | null; fields_present: boolean | null; status_code: number;
  request_hash: string; at: string;
};
export type Review = {
  id: string; listing_id: string; buyer: string; provider: string; call_id: string; vote: 1 | -1;
  reason: string; comment: string; provider_reply: string; created_at: string; updated_at: string;
};
export type Report = {
  id: string; listing_id: string; listing_name: string; buyer: string; provider: string; call_id: string | null; origin?: 'buyer'|'audit'; audit_id?: string;
  reason: string; description: string; status: string; provider_reply: string; response_deadline: string; created_at: string;
};
export type Decision = {
  id: string; report_id: string; listing_id: string; provider: string; moderator: string;
  action: 'request_response' | 'dismiss' | 'resolve' | 'warning' | 'pause' | 'slash'; note: string;
  status: 'prepared' | 'executing' | 'completed' | 'failed' | 'cancelled'; slash_tx?: string; pause_tx?: string; error?: string; created_at: string;
};
export type Reputation = {
  positive: number; negative: number; total: number; positivePct: number | null;
  samples: number; responseSuccessPct: number | null; schemaValidPct: number | null; fieldsPresentPct: number | null;
  reviews: Review[]; decisions: Decision[];
};
export type Workspace = { enabled: boolean; wallet: string; moderator: boolean; calls: CommunityCall[]; reviews: Review[]; reports: Report[]; decisions: Decision[] };
