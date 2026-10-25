import type { Metadata } from 'next';
import { Barlow, Barlow_Condensed, Geist_Mono } from 'next/font/google';
import { Nav } from '../components/Nav.tsx';
import { WalletProvider } from '../components/WalletContext.tsx';
import './globals.css';

const sans = Barlow({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' });
const display = Barlow_Condensed({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-display' });
const mono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'TrustBazaar',
  description: 'Pay-per-request AI endpoints on Stellar, where providers stake and liars get slashed.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>
        <WalletProvider>
          <div className="frame">
            <Nav />
            <main className="stage-col">{children}</main>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
