'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectWallet } from './ConnectWallet.tsx';

const TILES = [
  { href: '/', label: 'Catalog', short: 'Catalog', tone: 'white' },
  { href: '/list', label: 'List an endpoint', short: 'List', tone: 'lime' },
  { href: '/audits', label: 'Audit log', short: 'Audits', tone: 'grey' },
  { href: '/dashboard', label: 'Dashboard', short: 'Dashboard', tone: 'dark' },
];

/** Navigation as a column of colour tiles beside the stage (a row of tiles on a phone). */
export function Nav() {
  const path = usePathname();
  return (
    <nav className="tiles" aria-label="Main">
      {TILES.map((t) => (
        <Link key={t.href} href={t.href} className={`tile tile--${t.tone} ${path === t.href ? 'is-active' : ''}`} aria-current={path === t.href ? 'page' : undefined}>
          <span className="tile__long">{t.label}</span>
          <span className="tile__short">{t.short}</span>
        </Link>
      ))}
      <div className="tile tile--ink tile--wallet">
        <span className="tile__long">Wallet</span>
        <ConnectWallet />
      </div>
    </nav>
  );
}
