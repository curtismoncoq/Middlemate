'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from './WalletContext.tsx';
import { signTransaction } from '../lib/wallet.ts';
import { validateListing, type ListingInput } from '../lib/listForm.ts';
import { txUrl } from '../lib/types.ts';

type Step = { label: string; hash?: string };

async function api(body: unknown) {
  const r = await fetch('/api/tx', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

export type ModelOption = { id: string; label: string };
const OTHER = '__other__';

export function ListForm({ models }: { models: ModelOption[] }) {
  const w = useWallet();
  const router = useRouter();
  const [form, setForm] = useState<ListingInput>({ name: '', endpoint: '', claimedModel: models[0]?.id ?? '', priceUsd: '0.005', stakeUsdc: '5' });
  const [choice, setChoice] = useState(models[0]?.id ?? OTHER);
  const [errors, setErrors] = useState<Partial<Record<keyof ListingInput, string>>>({});
  const [steps, setSteps] = useState<Step[]>([]);
  const [fail, setFail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const field = (k: Exclude<keyof ListingInput, 'allowUnverifiable'>, label: string, placeholder: string) => (
    <label className="field">
      <span>{label}</span>
      <input value={form[k]} placeholder={placeholder} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
      {errors[k] && <small className="empty--error">{errors[k]}</small>}
    </label>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validateListing(form, models.map((m) => m.id));
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    if (!w.address) return setFail('Connect your wallet first.');
    setBusy(true);
    setFail(null);
    setSteps([]);
    try {
      const run = async (label: string, call: unknown) => {
        setSteps((s) => [...s, { label: `${label}: waiting for wallet…` }]);
        const { xdr } = await api({ action: 'build', publicKey: w.address, call });
        const signed = await signTransaction(xdr, w.address!);
        const { hash } = await api({ action: 'submit', xdr: signed });
        setSteps((s) => [...s.slice(0, -1), { label, hash }]);
      };
      const { stakeAtomic, ...listing } = v.value;
      await run('Registered', { method: 'register', args: listing });
      await run(`Staked ${form.stakeUsdc} USDC`, { method: 'stake', args: { amountAtomic: stakeAtomic } });
      setTimeout(() => router.push('/'), 1500);
    } catch (err) {
      setFail((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="listform" onSubmit={submit}>
      {field('name', 'Listing name', 'My Llama endpoint')}
      {field('endpoint', 'Endpoint URL (OpenAI-compatible chat completions, behind x402)', 'https://…/v1/chat/completions')}
      <label className="field">
        <span>Model you serve</span>
        <select
          value={choice}
          onChange={(e) => {
            setChoice(e.target.value);
            setForm({ ...form, claimedModel: e.target.value === OTHER ? '' : e.target.value, allowUnverifiable: false });
          }}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} ({m.id}) — verifiable
            </option>
          ))}
          <option value={OTHER}>Other model (unverifiable)…</option>
        </select>
        {choice !== OTHER && errors.claimedModel && <small className="empty--error">{errors.claimedModel}</small>}
      </label>
      {choice === OTHER && (
        <>
          {field('claimedModel', 'Model name', 'e.g. my-finetune-7b')}
          <label className="check">
            <input type="checkbox" checked={!!form.allowUnverifiable} onChange={(e) => setForm({ ...form, allowUnverifiable: e.target.checked })} />
            I understand the auditor can&apos;t verify this model: the listing gets a warning badge, no trust score, and agents skip it by default.
          </label>
        </>
      )}
      <div className="listform__row">
        {field('priceUsd', 'Price per request (USD)', '0.005')}
        {field('stakeUsdc', 'Stake (USDC)', '5')}
      </div>
      <button className="btn" disabled={busy}>{busy ? 'Signing…' : w.address ? 'Register & stake' : 'Connect wallet to list'}</button>
      {steps.map((s, i) => (
        <p key={i} className="muted">
          {s.hash ? '✔' : '…'} {s.label} {s.hash && <a href={txUrl(s.hash)} target="_blank" rel="noreferrer">tx {s.hash.slice(0, 6)}…</a>}
        </p>
      ))}
      {fail && <p className="empty--error">{fail}</p>}
    </form>
  );
}
