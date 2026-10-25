'use client';
import { useEffect, useState } from 'react';
import { ago, txUrl } from '../../lib/types.ts';

type Audit = {
  id: string; at: string; name: string; claimedModel: string; slashTx?: string; pauseTx?: string; spentAtomic?: string; slashedAtomic?: string; error?: string;
  verdict: { score: number; matchedModel: string; pass: boolean; inconclusive: boolean };
  probes: { probeId: string; kind: string; status: string; correct?: boolean; closest?: { model: string; similarity: number }; error?: string; txHash?: string }[];
};

export default function AuditsPage() {
  const [audits, setAudits] = useState<Audit[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const load = () => fetch('/api/audits', { cache: 'no-store' }).then((r) => r.json()).then((j) => { setAudits(j.audits); setNow(Date.now()); }).catch(() => setAudits([]));
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  if (!audits) return <p className="empty">Loading audit log…</p>;
  if (audits.length === 0) return <p className="empty">No audits yet. Run one from the catalog.</p>;
  return (
    <section className="log">
      <h1>Audit log</h1>
      {audits.map((a) => (
        <article key={a.id} className={`log__item ${a.verdict.pass ? '' : 'log__item--fail'}`}>
          <header>
            <b>{a.name}</b> claims <code>{a.claimedModel}</code> · score <b>{a.verdict.score}</b> · matched <code>{a.verdict.matchedModel}</code> ·{' '}
            {a.verdict.inconclusive ? 'INCONCLUSIVE' : a.verdict.pass ? 'PASS' : 'FAIL'} <span className="muted">{ago(a.at, now)}</span>
            {a.spentAtomic && (
              <div className="muted">
                Audit cost ${(Number(a.spentAtomic) / 1e7).toFixed(3)} in paid probes
                {a.slashedAtomic && <> · stake slashed ${(Number(a.slashedAtomic) / 1e7).toFixed(2)}</>}
                {a.error && <> · on-chain error: {a.error}</>}
              </div>
            )}
          </header>
          <ul>
            {a.probes.map((p, i) => (
              <li key={i}>
                <code>{p.probeId}</code>{' '}
                {p.status === 'error' ? `error: ${p.error}` : p.kind === 'checkable' ? (p.correct ? '✔ correct' : '✘ wrong') : `closest ${p.closest?.model} (${p.closest?.similarity.toFixed(3)})`}
                {p.txHash && p.txHash !== 'simulated' && (
                  <> · <a href={txUrl(p.txHash)} target="_blank" rel="noreferrer">paid</a></>
                )}
              </li>
            ))}
          </ul>
          {a.slashTx && (
            <p className="log__chain">
              <a href={txUrl(a.slashTx)} target="_blank" rel="noreferrer">slash tx</a> · {a.pauseTx && <a href={txUrl(a.pauseTx)} target="_blank" rel="noreferrer">delist tx</a>}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
