import { ListForm } from '../../components/ListForm.tsx';
import { MODELS, PAYMENT } from '../../lib/server.ts';

export default function ListPage() {
  return (
    <section className="stage">
      <p className="wordmark">TrustBazaar <span>Stellar Testnet</span></p>
      <header className="page-head">
        <h1 className="display display--left">Open a stall</h1>
        <p className="page-head__sub">Stake USDC on what you serve. The auditor buys from you like any customer, and a false claim costs the stake.</p>
      </header>
      <ListForm models={MODELS.map(({ id, label }) => ({ id, label }))} payment={PAYMENT} />
    </section>
  );
}
