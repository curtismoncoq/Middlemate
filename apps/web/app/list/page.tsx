import { ListForm } from '../../components/ListForm.tsx';
import { MODELS, PAYMENT } from '../../lib/server.ts';

export default function ListPage() {
  return (
    <section className="stage">
      <p className="wordmark">Middlemate <span>Stellar Testnet</span></p>
      <ListForm models={MODELS.map(({ id, label }) => ({ id, label }))} payment={PAYMENT} />
    </section>
  );
}
