import { ListForm } from '../../components/ListForm.tsx';
import { MODELS } from '../../lib/server.ts';

export default function ListPage() {
  return (
    <section className="stage">
      <p className="wordmark">TrustBazaar <span>Stellar Testnet</span></p>
      <ListForm models={MODELS.map(({ id, label }) => ({ id, label }))} />
    </section>
  );
}
