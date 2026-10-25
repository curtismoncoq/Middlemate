import { createRegistryClient } from '@tb/registry-client';
import { CommunityError, createCommunityStore, reputation, type CommunityCall, type Review, type Report, type Decision } from '@tb/community';
import { challenge, communityConfig as cfg, communityError, consumeChallenge, createSession, database, isModerator, requireWallet, sameOrigin, sessionWallet, text, uuid, walletAddress } from '../../../lib/community-server.ts';
import { recoverReceipt } from '@tb/community/receipts';

export const dynamic = 'force-dynamic';
const registry = createRegistryClient(cfg);
const reasons = ['technical','accuracy','missing_fields','value','other'];
const reason = (value: unknown) => { const result = text(value, 'Reason', 1, 40); if (!reasons.includes(result)) throw new CommunityError('Choose a reason.'); return result; };
const eq = (id: string) => `eq.${id}`;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('view') === 'session') {
      const enabled = !!createCommunityStore(cfg);
      const wallet = enabled ? await sessionWallet(req) : null;
      return Response.json({ enabled, wallet, moderator: wallet ? isModerator(wallet) : false });
    }
    const db = database();
    if (url.searchParams.get('view') === 'listing') {
      const id = text(url.searchParams.get('listingId'), 'Listing ID', 1, 128);
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new CommunityError('Invalid listing ID.');
      const [reviews, calls, decisions] = await Promise.all([
        db.all<Review>('community_reviews', { listing_id: eq(id), order: 'updated_at.desc' }),
        db.all<CommunityCall>('community_calls', { listing_id: eq(id) }),
        db.all<Decision>('community_decisions', { listing_id: eq(id), status: 'eq.completed', order: 'created_at.desc' }),
      ]);
      return Response.json(reputation(reviews, calls, decisions));
    }
    const wallet = await requireWallet(req);
    const moderator = isModerator(wallet);
    const party = { or: `(buyer.eq.${wallet},provider.eq.${wallet})` };
    const [calls, reviews, reports] = await Promise.all([
      db.all<CommunityCall>('community_calls', { ...party, order: 'at.desc' }),
      db.all<Review>('community_reviews', { ...party, order: 'updated_at.desc' }),
      db.all<Report>('community_reports', { ...(moderator ? {} : party), order: 'created_at.desc' }),
    ]);
    const decisions = reports.length ? await db.all<Decision>('community_decisions', { report_id: `in.(${reports.map((report) => report.id).join(',')})`, order: 'created_at.desc' }) : [];
    return Response.json({ enabled: true, wallet, moderator, calls, reviews, reports, decisions });
  } catch (error) { return communityError(error); }
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const db = database();
    const body = await req.json();
    if (body.action === 'challenge') return Response.json(await challenge(req, walletAddress(body.wallet)));
    if (body.action === 'verify') {
      const wallet = await consumeChallenge(req, uuid(body.id), text(body.signature, 'Signature', 64, 180), 'login');
      return Response.json({ wallet }, { headers: { 'set-cookie': await createSession(req, wallet) } });
    }
    if (body.action === 'recover_receipt') return Response.json(await recoverReceipt(db,cfg,text(body.proof,'Receipt proof',1,16000)));
    const wallet = await requireWallet(req);
    if (body.action === 'review') {
      if (![1,-1].includes(body.vote)) throw new CommunityError('Choose a green or red thumb.');
      return Response.json(await db.rpc('community_save_review', { p_wallet: wallet, p_call_id: uuid(body.callId), p_vote: body.vote, p_reason: body.vote === -1 ? reason(body.reason) : '', p_comment: text(body.comment ?? '', 'Comment', 0, 1000) }));
    }
    if (body.action === 'report') {
      if (!Number.isInteger(cfg.moderationResponseSeconds) || cfg.moderationResponseSeconds < 0 || cfg.moderationResponseSeconds > 604800) throw new CommunityError('Invalid MODERATION_RESPONSE_SECONDS.', 503);
      return Response.json(await db.rpc('community_create_report', { p_wallet: wallet, p_call_id: uuid(body.callId), p_reason: reason(body.reason), p_description: text(body.description, 'Description', 10, 3000), p_response_seconds: cfg.moderationResponseSeconds }));
    }
    if (body.action === 'review_reply') {
      const updated = await db.patch('community_reviews', { id: eq(uuid(body.id)), provider: eq(wallet) }, { provider_reply: text(body.reply, 'Reply', 1, 1000) });
      if (!updated.length) throw new CommunityError('This review belongs to another provider.', 403);
      return Response.json({ saved: true });
    }
    if (body.action === 'report_reply') {
      const updated = await db.patch('community_reports', { id: eq(uuid(body.id)), provider: eq(wallet), status: 'in.(received,reviewing,awaiting_provider)' }, { provider_reply: text(body.reply, 'Reply', 1, 3000) });
      if (!updated.length) throw new CommunityError('This report is closed or belongs to another provider.', 403);
      return Response.json({ saved: true });
    }
    if (!isModerator(wallet)) throw new CommunityError('Moderator wallet required.', 403);
    if (body.action === 'cancel_decision') {
      await db.patch('community_decisions', {id:eq(uuid(body.id)),moderator:eq(wallet),status:'eq.prepared'}, {status:'cancelled'});
      return Response.json({saved:true});
    }
    if (body.action === 'moderate') {
      let decision: Decision;
      if (body.retryId) {
        [decision] = await db.rows<Decision>('community_decisions', { id: eq(uuid(body.retryId)), moderator: eq(wallet), status: 'in.(prepared,failed)', limit: '1' });
        if (!decision) throw new CommunityError('Failed decision not found.');
      } else {
        const [report] = await db.rows<Report>('community_reports', { id: eq(uuid(body.reportId)), limit: '1' });
        if (!report || ['confirmed','dismissed','resolved'].includes(report.status)) throw new CommunityError('Open report required.');
        if ([report.buyer,report.provider].includes(wallet)) throw new CommunityError('A moderator cannot decide their own case.', 403);
        if (!['request_response','dismiss','resolve','warning','pause','slash'].includes(body.decision)) throw new CommunityError('Unsupported moderation action.');
        if (['warning','slash'].includes(body.decision) && !report.provider_reply && Date.parse(report.response_deadline) > Date.now()) throw new CommunityError('Wait for the provider reply or the displayed response deadline.');
        const listing = (await registry.list()).find((listing) => (listing.id ?? listing.provider) === report.listing_id);
        if (!listing || !listing.claimedModel.startsWith('api:')) throw new CommunityError('Community sanctions apply to API listings only.');
        [decision] = await db.insert<Decision>('community_decisions', { report_id: report.id, listing_id: report.listing_id, provider: report.provider, moderator: wallet, action: body.decision, note: text(body.note, 'Public decision reason', 10, 2000) });
      }
      if (['pause','slash'].includes(decision.action)) {
        const approval = await challenge(req, wallet, `moderation:${decision.id}`, `Approve ${decision.action.toUpperCase()} for listing ${decision.listing_id}.\nPublic reason: ${decision.note}\nThe authorized auditor will execute this decision on Stellar Testnet.`);
        return Response.json({ decisionId: decision.id, approval });
      }
      await db.rpc('community_claim_decision', { p_id: decision.id, p_moderator: wallet });
      await db.rpc('community_complete_decision', { p_id: decision.id });
      return Response.json({ saved: true });
    }
    if (body.action === 'execute') {
      const id = uuid(body.decisionId);
      await consumeChallenge(req, uuid(body.challengeId), text(body.signature, 'Signature', 64, 180), `moderation:${id}`, wallet);
      const decision = await db.rpc<Decision>('community_claim_decision', { p_id: id, p_moderator: wallet });
      if (!['pause','slash'].includes(decision.action)) throw new CommunityError('This action does not require a chain transaction.');
      try {
        const listing = (await registry.list()).find((listing) => (listing.id ?? listing.provider) === decision.listing_id);
        if (!listing || listing.provider !== decision.provider || !listing.claimedModel.startsWith('api:')) throw new Error('The registered provider no longer matches this API case.');
        const secret = cfg.keys.auditor.secret;
        if (decision.action === 'slash' && !decision.slash_tx) {
          const slashed = listing.id ? await registry.slashEndpoint(secret, listing.id) : await registry.slash(secret, listing.provider);
          decision.slash_tx = slashed.hash;
          await db.patch('community_decisions', { id: eq(id) }, { slash_tx: slashed.hash });
        }
        if (!decision.pause_tx) {
          const paused = listing.id ? await registry.pauseEndpoint(secret, listing.id) : await registry.pauseListing(secret, listing.provider);
          decision.pause_tx = paused.hash;
          await db.patch('community_decisions', { id: eq(id) }, { pause_tx: paused.hash });
        }
        await db.rpc('community_complete_decision', { p_id: id });
        return Response.json({ saved: true, slashTx: decision.slash_tx, pauseTx: decision.pause_tx });
      } catch (error) {
        await db.patch('community_decisions', { id: eq(id) }, { status: 'failed', error: error instanceof Error ? error.message.slice(0,500) : 'Chain action failed' });
        throw error;
      }
    }
    throw new CommunityError('Unknown community action.');
  } catch (error) { return communityError(error); }
}
