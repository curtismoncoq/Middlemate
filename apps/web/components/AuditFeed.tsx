import type { AuditStatus } from '../lib/types.ts';

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour12: false });

/** Live strip of the auditor's latest probe lines (newest first). Renders nothing when idle and empty. */
export function AuditFeed({ status }: { status: AuditStatus }) {
  if (!status.running && status.feed.length === 0) return null;
  const lines = [...status.feed].reverse().slice(0, 6);
  return (
    <section className="panel feed" aria-live="polite">
      <header className="panel__head">
        <h2>
          {status.current ? (
            <>
              <span className="pulse" aria-hidden="true" /> Auditing {status.current.name} · probe {status.current.probe}/{status.current.total}
            </>
          ) : (
            'Last audit'
          )}
        </h2>
        <span className="muted">Hidden probes, paid over x402 like any customer</span>
      </header>
      <ul>
        {lines.map((f) => (
          <li key={f.at + f.line} className={/FAIL|slashed|delisted/.test(f.line) ? 'feed--bad' : /PASS/.test(f.line) ? 'feed--good' : ''}>
            <b>{f.name}</b> <code>{f.line}</code>
            <time dateTime={f.at}>{clock(f.at)}</time>
          </li>
        ))}
      </ul>
    </section>
  );
}
