'use client';
import { useWallet } from './WalletContext.tsx';

export function ConnectWallet() {
  const w = useWallet();
  if (w.address) {
    return (
      <button className="btn btn--ghost mono" onClick={w.disconnect} title="Disconnect">
        {w.address.slice(0, 4)}…{w.address.slice(-4)}
      </button>
    );
  }
  return (
    <span className="wallet">
      <button className="btn btn--ghost" onClick={w.connect}>Connect wallet</button>
      {w.error && <span className="empty--error muted"> {w.error}</span>}
    </span>
  );
}
