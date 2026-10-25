'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectWallet } from './ConnectWallet.tsx';

const LINKS = [
  { href: '/', label: 'Catalog' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/list', label: 'List an endpoint' },
  { href: '/audits', label: 'Audit log' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      <Link href="/" className="nav__brand">
        <span className="nav__mark">◆</span> TrustBazaar
        <span className="nav__net">testnet</span>
      </Link>
      <div className="nav__links">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={path === l.href ? 'is-active' : ''}>
            {l.label}
          </Link>
        ))}
      </div>
      <ConnectWallet />
    </nav>
  );
}
