import { price, usdc, SLASHED_VISIBLE_MS, type ApiListing, type AuditStatus } from './types.ts';

export type StallState = 'open' | 'review' | 'auditing' | 'slashed' | 'unverifiable' | 'api';
export type StallView = {
  sign: string;
  kind: 'INFERENCE' | 'WEATHER API';
  window: string;
  price: string;
  state: StallState;
  /** two short lines on the door placard */
  placard: [string, string];
  /** red tape across the shutter of a slashed stall */
  tape?: string;
  /** what a screen reader hears */
  label: string;
};

const SIGN_MAX = 16;
const fit = (s: string, max: number) => (s.length > max ? `${s.slice(0, max).trimEnd()}…` : s);

/** How one listing looks as a stall on the street. */
export function stallView(l: ApiListing, auditing?: { probe: number; total: number }): StallView {
  const a = l.lastAudit;
  const isApi = l.claimedModel.startsWith('api:');
  const common = {
    sign: fit(l.name.toUpperCase(), SIGN_MAX),
    kind: isApi ? ('WEATHER API' as const) : ('INFERENCE' as const),
    window: fit((l.claimedModel || '—').toUpperCase(), 22),
    price: price(l.priceAtomic),
  };
  const say = (what: string) => `${l.name}: serves ${l.claimedModel || 'an unnamed model'}, ${common.price} per request, ${what}`;

  if (a && !a.pass && a.slashTx) {
    const lost = usdc(a.slashedAtomic ?? '0');
    return { ...common, state: 'slashed', placard: ['TRUST', String(a.score)], tape: `SLASHED · STAKE ${lost} → 0`, label: say(`slashed, stake ${lost} → 0 USDC, actually matched ${a.matchedModel}`) };
  }
  if (auditing) return { ...common, state: 'auditing', placard: ['PROBE', `${auditing.probe}/${auditing.total}`], label: say(`being audited, probe ${auditing.probe} of ${auditing.total}`) };
  if (isApi) return { ...common, state: 'api', placard: ['SCHEMA', 'DECLARED'], label: say('schema declared') };
  if (l.verifiable === false || a?.unverifiable) return { ...common, state: 'unverifiable', placard: ['NOT', 'VERIFIED'], label: say('model not verifiable') };
  if (!a) return { ...common, state: 'review', placard: ['UNDER', 'REVIEW'], label: say('under review') };
  return { ...common, state: 'open', placard: ['TRUST', String(a.score)], label: say(`trust ${a.score}`) };
}

const stalls = (n: number) => `${n} ${n === 1 ? 'stall' : 'stalls'}`;

/** The one sentence under the headline: what is happening on the street right now. */
export function streetStatus(listings: ApiListing[], audit: AuditStatus, now: number): string {
  if (audit.current) return `Auditing ${audit.current.name} now, probe ${audit.current.probe} of ${audit.current.total}.`;
  const slashed = listings.find((l) => l.lastAudit?.slashTx && now - Date.parse(l.lastAudit.at) < SLASHED_VISIBLE_MS);
  if (slashed) return `${slashed.name} was just slashed.`;
  const live = listings.filter((l) => l.active && BigInt(l.stakeAtomic) > 0n);
  if (live.length === 0) return 'The street is empty.';
  const review = live.filter((l) => stallView(l).state === 'review').length;
  if (review > 0) return `${stalls(review)} under review.`;
  const audited = live.filter((l) => stallView(l).state === 'open').length;
  return audited === live.length ? `All ${stalls(live.length)} audited.` : `${audited} of ${stalls(live.length)} audited.`;
}
