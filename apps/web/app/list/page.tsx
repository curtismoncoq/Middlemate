import { ListForm } from '../../components/ListForm.tsx';

export default function ListPage() {
  return (
    <section className="narrow">
      <h1>List your endpoint</h1>
      <p className="muted">
        Declare what you serve and lock a stake in the Soroban registry. The auditor will buy from you like any customer. If your answers
        don&apos;t match the model you claim, your stake is slashed and the listing is removed.
      </p>
      <ListForm />
    </section>
  );
}
