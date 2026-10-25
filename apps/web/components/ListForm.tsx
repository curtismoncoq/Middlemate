'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from './WalletContext.tsx';
import { signTransaction } from '../lib/wallet.ts';
import { draftListing, validateListing, type ListingInput } from '../lib/listForm.ts';
import { SLASH_LINE } from './ListingCard.tsx';
import { Stall } from './Stall.tsx';
import { txUrl } from '../lib/types.ts';
import { capabilitiesUrl, validateWeatherCapabilities, WEATHER_FIELDS, WEATHER_SCHEMA_ID } from '@tb/weather-contract';

type Step = { label: string; hash?: string };
const weatherResponseFields = WEATHER_FIELDS.filter((f) => f.group === 'response');

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
  const [category, setCategory] = useState<'inference' | 'weather'>('inference');
  const [supportedFields, setSupportedFields] = useState<string[]>(['forecast.temperatureC']);

  const field = (k: Exclude<keyof ListingInput, 'allowUnverifiable'>, label: string, placeholder: string, help?: string) => (
    <div className="field">
      <label htmlFor={`field-${k}`}>{label}</label>
      <input id={`field-${k}`} value={form[k]} placeholder={placeholder} aria-describedby={help ? `${k}-help` : undefined} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
      {help && <small id={`${k}-help`} className="field__help">{help}</small>}
      {errors[k] && <small className="field__error">{errors[k]}</small>}
    </div>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (category === 'weather' && supportedFields.length === 0) {
      setFail('Select at least one weather response field your API reliably provides.');
      return;
    }
    // Weather listings declare a schema, not a model; inference listings must pick a verifiable model (or opt out).
    const v = validateListing(form, category === 'weather' ? [WEATHER_SCHEMA_ID] : models.map((m) => m.id));
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
      const id = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
      await run(`Registered & staked ${form.stakeUsdc} USDC`, { method: 'registerEndpoint', args: { ...listing, id, amountAtomic: stakeAtomic } });
      setTimeout(() => router.push('/'), 1500);
    } catch (err) {
      setFail((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verifiable = category === 'inference' && choice !== OTHER;
  const draft = draftListing(form, verifiable);
  const stake = Number(form.stakeUsdc) > 0 ? Number(form.stakeUsdc) : 0;
  const signed = steps[0];
  const stepState = (s?: Step) => (s?.hash ? 'is-done' : s ? 'is-waiting' : '');
  const txLink = (s?: Step) => s?.hash && <a href={txUrl(s.hash)} target="_blank" rel="noreferrer">tx {s.hash.slice(0, 6)}…</a>;

  return (
    <div className="listing-layout">
    <form className="listform" onSubmit={submit}>
      <fieldset className="segmented">
        <legend>What are you listing?</legend>
        <label><input type="radio" name="category" checked={category === 'inference'} onChange={() => { setCategory('inference'); setForm({ ...form, claimedModel: choice === OTHER ? '' : choice }); }} /> <span>Inference model</span></label>
        <label><input type="radio" name="category" checked={category === 'weather'} onChange={() => { setCategory('weather'); setForm({ ...form, claimedModel: WEATHER_SCHEMA_ID }); }} /> <span>Weather API</span></label>
      </fieldset>
      {field('name', 'Listing name', 'My Llama endpoint')}
      {field('endpoint', 'Endpoint URL', category === 'weather' ? 'https://…/weather/v1/forecast' : 'https://…/v1/chat/completions', category === 'weather' ? 'POST /weather/v1/forecast, paid over x402.' : 'OpenAI-compatible chat completions, paid over x402.')}
      {category === 'inference' ? (
        <>
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
        {choice !== OTHER && errors.claimedModel && <small className="field__error">{errors.claimedModel}</small>}
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
        </>
      ) : (
        <p className="schema-lock">Contract <code>{WEATHER_SCHEMA_ID}</code> · <a href="/api/schemas/weather/v1" target="_blank" rel="noreferrer">OpenAPI contract</a></p>
      )}
      {category === 'weather' && <fieldset className="weather-provider-fields">
        <legend>Which data fields does your API provide?</legend>
        <p className="muted">Select fields your endpoint reliably returns. Publish this JSON from public <code>GET /weather/v1/capabilities</code>; the marketplace checks it before registration.</p>
        <div className="weather-field-actions"><button className="btn btn--outline" type="button" onClick={() => setSupportedFields(weatherResponseFields.map((f) => f.id))}>Select all fields</button></div>
        {weatherResponseFields.map((f) => <label key={f.id} title={f.description}><input type="checkbox" checked={supportedFields.includes(f.id)} onChange={(e) => setSupportedFields(e.target.checked ? [...supportedFields, f.id] : supportedFields.filter((id) => id !== f.id))} /><span>{f.label}</span>{f.unit && <small>{f.unit}</small>}</label>)}
        <pre className="capability-json">{JSON.stringify({ schema: WEATHER_SCHEMA_ID, availableFields: supportedFields }, null, 2)}</pre>
      </fieldset>}
      <div className="listform__row">
        {field('priceUsd', 'Price per request (USD)', '0.005')}
        {field('stakeUsdc', 'Stake (USDC)', '5')}
      </div>
      <div className="listform__submit">
        <button className="btn btn--lime" disabled={busy || w.restoring}>{w.restoring ? 'Reconnecting…' : busy ? 'Signing…' : w.address ? 'Register & stake' : 'Connect wallet to list'}</button>
        <p className="muted">One wallet signature registers the listing and locks its stake. One wallet can list several endpoints; remove one from Dashboard, then withdraw after the onchain grace period.</p>
      </div>
      {fail && <p className="field__error" role="alert">{fail}</p>}
    </form>

    <aside className="listing-rail">
      <section className="rail-stall">
        <h2>Your stall on the street</h2>
        <Stall listing={draft} />
      </section>
      <section className="rail-next">
        <h2>After you submit</h2>
        <p className="atrisk"><span className="num">{`${stake.toLocaleString('en-US')} USDC`}</span> at stake if your answers don&apos;t match {category === 'weather' ? 'your contract' : 'the model you claim'}.</p>
        <ol className="track">
          <li className={stepState(signed)}>
            <b>{`Register & stake ${stake.toLocaleString('en-US')} USDC`}</b>
            <span>{signed?.hash ? txLink(signed) : signed ? 'Waiting for your wallet…' : 'One signature in your wallet; the stake is locked in the Soroban registry.'}</span>
          </li>
          <li className={signed?.hash ? 'is-waiting' : ''}>
            <b>Audit on entry</b>
            <span>{category === 'weather' ? 'API listings show their declared schema; their data audit is future work.' : 'The auditor buys hidden probes at your price and fingerprints the answers. You show as Under review until it finishes.'}</span>
          </li>
          <li>
            <b>{`Trust ${SLASH_LINE} or more: listed`}</b>
            <span>Below the line, the stake goes to the treasury and the listing is removed.</span>
          </li>
        </ol>
      </section>
    </aside>
    </div>
  );
}
