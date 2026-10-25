'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from './WalletContext.tsx';
import { signTransaction } from '../lib/wallet.ts';
import { validateListing, type ListingInput } from '../lib/listForm.ts';
import { txUrl } from '../lib/types.ts';
import { capabilitiesUrl, validateWeatherCapabilities, WEATHER_FIELDS, WEATHER_SCHEMA_ID } from '@tb/weather-contract';

type Step = { label: string; hash?: string };
const localWeatherDemo = process.env.NEXT_PUBLIC_WEATHER_DEMO === '1';
const weatherResponseFields = WEATHER_FIELDS.filter((f) => f.group === 'response');

async function api(body: unknown) {
  const r = await fetch('/api/tx', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

export function ListForm() {
  const w = useWallet();
  const router = useRouter();
  const [form, setForm] = useState<ListingInput>({ name: '', endpoint: '', claimedModel: '', priceUsd: '0.005', stakeUsdc: '5' });
  const [errors, setErrors] = useState<Partial<Record<keyof ListingInput, string>>>({});
  const [steps, setSteps] = useState<Step[]>([]);
  const [fail, setFail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<'inference' | 'weather'>('inference');
  const [supportedFields, setSupportedFields] = useState<string[]>(['forecast.temperatureC']);

  const field = (k: keyof ListingInput, label: string, placeholder: string) => (
    <label className="field">
      <span>{label}</span>
      <input value={form[k]} placeholder={placeholder} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
      {errors[k] && <small className="empty--error">{errors[k]}</small>}
    </label>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (category === 'weather' && supportedFields.length === 0) {
      setFail('Select at least one weather response field your API reliably provides.');
      return;
    }
    const v = validateListing(form);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    if (!w.address) return setFail('Connect your wallet first.');
    setBusy(true);
    setFail(null);
    setSteps([]);
    try {
      if (category === 'weather') {
        const response = await fetch(capabilitiesUrl(form.endpoint));
        if (!response.ok) throw new Error(`Could not read the public weather capabilities endpoint (HTTP ${response.status}). Publish the api:weather@1 manifest first.`);
        const manifest = validateWeatherCapabilities(await response.json());
        const selected = [...new Set(supportedFields)].sort();
        if (JSON.stringify([...manifest.availableFields].sort()) !== JSON.stringify(selected)) {
          throw new Error('The fields you selected must exactly match the provider capability manifest. Update the manifest and try again.');
        }
      }
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
      <fieldset className="category-picker">
        <legend>What are you listing?</legend>
        <label><input type="radio" name="category" checked={category === 'inference'} onChange={() => { setCategory('inference'); if (form.claimedModel === WEATHER_SCHEMA_ID) setForm({ ...form, claimedModel: '' }); }} /> Inference model</label>
        <label><input type="radio" name="category" checked={category === 'weather'} onChange={() => { setCategory('weather'); setForm({ ...form, claimedModel: WEATHER_SCHEMA_ID }); }} /> Weather API</label>
      </fieldset>
      {field('name', 'Listing name', 'My Llama endpoint')}
      {field('endpoint', category === 'weather' ? 'Paid weather endpoint (POST /weather/v1/forecast)' : 'Endpoint URL (OpenAI-compatible chat completions, behind x402)', category === 'weather' ? 'https://…/weather/v1/forecast' : 'https://…/v1/chat/completions')}
      {category === 'inference' ? field('claimedModel', 'Model you serve', 'llama3.2:3b') : <div className="schema-lock">Schema: <code>{WEATHER_SCHEMA_ID}</code> · <a href="/api/schemas/weather/v1" target="_blank" rel="noreferrer">OpenAPI contract</a></div>}
      {category === 'weather' && <fieldset className="weather-provider-fields">
        <legend>Which data fields does your API provide?</legend>
        <p className="muted">Select fields your endpoint reliably returns. Publish this JSON from public <code>GET /weather/v1/capabilities</code>; the marketplace checks it before registration.</p>
        <div className="weather-field-actions"><button className="btn btn--ghost" type="button" onClick={() => setSupportedFields(weatherResponseFields.map((f) => f.id))}>Select all fields</button></div>
        {weatherResponseFields.map((f) => <label key={f.id} title={f.description}><input type="checkbox" checked={supportedFields.includes(f.id)} onChange={(e) => setSupportedFields(e.target.checked ? [...supportedFields, f.id] : supportedFields.filter((id) => id !== f.id))} /><span>{f.label}</span>{f.unit && <small>{f.unit}</small>}</label>)}
        <pre className="capability-json">{JSON.stringify({ schema: WEATHER_SCHEMA_ID, availableFields: supportedFields }, null, 2)}</pre>
      </fieldset>}
      <div className="listform__row">
        {field('priceUsd', 'Price per request (USD)', '0.005')}
        {field('stakeUsdc', 'Stake (USDC)', '5')}
      </div>
      <button className="btn" disabled={busy}>{busy ? 'Signing…' : w.address ? 'Register & stake' : 'Connect wallet to list'}</button>
      <p className="muted">{localWeatherDemo ? 'The weather endpoint is a local fixture. Registration and stake are submitted to the Stellar Testnet registry and require wallet approval.' : 'Stake is locked in the registry. The deployed registry has no unstake operation.'}</p>
      {steps.map((s, i) => (
        <p key={i} className="muted">
          {s.hash ? '✔' : '…'} {s.label} {s.hash && <a href={txUrl(s.hash)} target="_blank" rel="noreferrer">tx {s.hash.slice(0, 6)}…</a>}
        </p>
      ))}
      {fail && <p className="empty--error">{fail}</p>}
    </form>
  );
}
