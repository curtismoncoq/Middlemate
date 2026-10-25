'use client';
import { useWallet } from './WalletContext.tsx';

export function ConnectWallet() {
  const w = useWallet();
  if (w.address) {
    return (
      <button className="wallet__btn mono" onClick={w.disconnect} title="Disconnect">
        {w.address.slice(0, 4)}…{w.address.slice(-4)}
      </button>
    );
  }
  return (
    <span className="wallet">
      <button className="wallet__btn" onClick={w.connect}>Connect</button>
      {w.error && <span className="wallet__error">{w.error}</span>}
    </span>
  );
}
