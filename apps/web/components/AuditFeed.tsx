import type { AuditStatus } from '../lib/types.ts';

/** Live strip of the auditor's latest probe lines (newest first). Renders nothing when idle and empty. */
export function AuditFeed({ status }: { status: AuditStatus }) {
  if (!status.running && status.feed.length === 0) return null;
  const lines = [...status.feed].reverse().slice(0, 6);
  return (
    <section className="feed" aria-live="polite">
      <header>
        {status.current ? (
          <>
            <span className="pulse" /> Auditing {status.current.name} · probe {status.current.probe}/{status.current.total}
          </>
        ) : (
          'Last audit'
        )}
      </header>
      <ul>
        {lines.map((f) => (
          <li key={f.at + f.line} className={/FAIL|slashed|delisted/.test(f.line) ? 'feed--bad' : /PASS/.test(f.line) ? 'feed--good' : ''}>
            <b>{f.name}</b> <code>{f.line}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}
