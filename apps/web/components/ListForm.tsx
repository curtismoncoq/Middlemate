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
  const [extraFields, setExtraFields] = useState<string[]>([]);
  const [extraFieldDraft, setExtraFieldDraft] = useState('');

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
    if (category === 'weather' && supportedFields.length === 0 && extraFields.length === 0) {
      setFail('Select at least one MET Norway field or declare an additional field.');
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
        if (JSON.stringify([...(manifest.extraFields ?? [])].sort()) !== JSON.stringify([...extraFields].sort())) {
          throw new Error('The extra fields you entered must exactly match the provider capability manifest. Update the manifest and try again.');
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
    <>
    <header className="page-head">
      <h1 className="display display--left">Open a stall</h1>
      <p className="page-head__sub">{category === 'weather'
        ? 'Stake USDC to list your weather API. Verified customer reviews and MET Norway comparisons provide the evidence. You can respond and correct problems during the review period; a moderator decides whether slashing is justified.'
        : 'Stake USDC on what you serve. The auditor buys from you like any customer, and a false claim costs the stake.'}</p>
    </header>
    <div className="listing-layout">
    <form className="listform" onSubmit={submit}>
      <fieldset className="segmented">
        <legend>What are you listing?</legend>
        <label><input type="radio" name="category" checked={category === 'inference'} onChange={() => { setCategory('inference'); setForm({ ...form, claimedModel: choice === OTHER ? '' : choice }); }} /> <span>Inference model</span></label>
        <label><input type="radio" name="category" checked={category === 'weather'} onChange={() => { setCategory('weather'); setForm({ ...form, claimedModel: WEATHER_SCHEMA_ID }); }} /> <span>Weather API</span></label>
      </fieldset>
      {field('name', 'Listing name', category === 'weather' ? 'My weather API' : 'My Llama endpoint')}
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
        <p className="muted">Select the normalized fields your endpoint reliably returns. TrustBazaar checks them against <a href="https://api.met.no/weatherapi/locationforecast/2.0/" target="_blank" rel="noreferrer">MET Norway Locationforecast</a>. Publish the declaration from public <code>GET /weather/v1/capabilities</code>.</p>
        <div className="weather-field-actions"><button className="btn btn--outline" type="button" onClick={() => setSupportedFields(weatherResponseFields.map((f) => f.id))}>Select all fields</button></div>
        {weatherResponseFields.map((f) => <label key={f.id} title={f.description}><input type="checkbox" checked={supportedFields.includes(f.id)} onChange={(e) => setSupportedFields(e.target.checked ? [...supportedFields, f.id] : supportedFields.filter((id) => id !== f.id))} /><span>{f.label}</span>{f.unit && <small>{f.unit}</small>}</label>)}
        <div className="weather-extra-fields">
          <h3>Additional fields</h3>
          <p className="muted">Fields outside MET Norway may still be sold and displayed. They are not checked against MET Norway and cannot trigger a warning or slashing.</p>
          <div className="weather-extra-fields__add">
            <label className="field"><span>Additional field name</span><input value={extraFieldDraft} placeholder="e.g. pollenRisk" onChange={(event) => setExtraFieldDraft(event.target.value)} /></label>
            <button className="btn btn--outline" type="button" onClick={() => {
              try {
                const next = validateWeatherCapabilities({ schema: WEATHER_SCHEMA_ID, availableFields: supportedFields, extraFields: [...extraFields, extraFieldDraft] });
                setExtraFields(next.extraFields ?? []); setExtraFieldDraft(''); setFail(null);
              } catch (error) { setFail((error as Error).message); }
            }}>Add extra field</button>
          </div>
          {!!extraFields.length && <ul className="weather-extra-fields__list">{extraFields.map((name) => <li key={name}><code>{name}</code><span>Unverified extra</span><button type="button" aria-label={`Remove ${name}`} onClick={() => setExtraFields(extraFields.filter((fieldName) => fieldName !== name))}>×</button></li>)}</ul>}
        </div>
        <pre className="capability-json">{JSON.stringify({ schema: WEATHER_SCHEMA_ID, availableFields: supportedFields, ...(extraFields.length ? { extraFields } : {}) }, null, 2)}</pre>
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
        <p className="atrisk"><span className="num">{`${stake.toLocaleString('en-US')} USDC`}</span>{category === 'weather' ? ' locked for this listing. Any slashing requires evidence and a moderator’s decision.' : <> at stake if your answers don&apos;t match the model you claim.</>}</p>
        <ol className="track">
          <li className={stepState(signed)}>
            <b>{`Register & stake ${stake.toLocaleString('en-US')} USDC`}</b>
            <span>{signed?.hash ? txLink(signed) : signed ? 'Waiting for your wallet…' : 'One signature in your wallet; the stake is locked in the Soroban registry.'}</span>
          </li>
          <li className={signed?.hash ? 'is-waiting' : ''}>
            <b>{category === 'weather' ? 'Compare with MET Norway' : 'Audit on entry'}</b>
            <span>{category === 'weather' ? 'The auditor compares forecasts with MET Norway and publishes the evidence. Disagreement does not automatically slash your stake.' : 'The auditor buys hidden probes at your price and fingerprints the answers. You show as Under review until it finishes.'}</span>
          </li>
          <li>
            <b>{category === 'weather' ? 'Reputation, evidence & human review' : `Trust ${SLASH_LINE} or more: listed`}</b>
            <span>{category === 'weather' ? 'Paid customers can review your API and report problems. You can respond and correct your API during the review period. A moderator considers the evidence, your response and any corrections before deciding on a sanction. Votes never slash your stake automatically.' : 'Below the line, the stake goes to the treasury and the listing is removed.'}</span>
          </li>
        </ol>
      </section>
    </aside>
    </div>
    </>
  );
}
