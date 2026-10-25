'use client';
import { useState } from 'react';
import { price, txUrl, type ApiListing } from '../lib/types.ts';
import { CallActions } from './Community.tsx';

export type BrowserPay = (url: string, init: RequestInit) => Promise<Response & { payment?: { txHash: string } }>;
type Msg = { role: 'user' | 'assistant'; content: string; txHash?: string; callId?: string; receiptError?: string; receiptProof?: string };
export type TryItProps = { listing: ApiListing; pay: BrowserPay | null; onClose: () => void };
type Props = TryItProps;

export function TryItPanel({ listing, pay, onClose }: Props) {
  const [draft, setDraft] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cost = price(listing.priceAtomic);

  const send = async () => {
    if (!pay || !draft.trim()) return;
    const history: Msg[] = [...msgs, { role: 'user', content: draft.trim() }];
    setBusy(true);
    setError(null);
    try {
      const res = await pay(listing.communityEnabled ? `/api/invoke/${listing.id ?? listing.provider}` : listing.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { choices: { message: { content: string } }[] };
      setMsgs([...history, { role: 'assistant', content: j.choices[0].message.content, txHash: res.payment?.txHash, callId: res.headers.get('x-tb-call-id') ?? undefined, receiptError: res.headers.get('x-tb-receipt-error') ?? undefined, receiptProof: res.headers.get('x-tb-receipt-proof') ?? undefined }]);
      setDraft('');
    } catch (e) {
      setError(`Payment failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="tryit" role="dialog" aria-label={`Try ${listing.name}`}>
      <header className="tryit__head">
        <div>
          <b>{listing.name}</b> · <code>{listing.claimedModel}</code>
          <div className="muted">{cost} per message, paid over x402 from your wallet</div>
        </div>
        <button className="btn btn--ghost" onClick={onClose} aria-label="Close">✕</button>
      </header>
      <div className="tryit__msgs">
        {msgs.map((m, i) => (
          <div key={i} className={`bubble bubble--${m.role}`}>
            <p>{m.content}</p>
            {m.txHash && m.txHash !== 'simulated' && (
              <a href={txUrl(m.txHash)} target="_blank" rel="noreferrer">paid {cost} · tx {m.txHash.slice(0, 6)}…</a>
            )}
            {(m.callId || m.receiptError) && <CallActions callId={m.callId} receiptError={m.receiptError} proof={m.receiptProof} />}
          </div>
        ))}
        {busy && <div className="bubble bubble--assistant muted">Waiting for your wallet signature and settlement…</div>}
        {error && <p className="empty--error">{error}</p>}
      </div>
      <div className="tryit__compose">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Ask ${listing.name} anything`} rows={2} disabled={busy} />
        <button className="btn" onClick={send} disabled={busy || !pay || !draft.trim()}>
          {pay ? `Pay ${cost} & send` : 'Connect wallet first'}
        </button>
      </div>
    </aside>
  );
}
