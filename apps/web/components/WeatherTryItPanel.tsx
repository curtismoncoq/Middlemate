'use client';
import { useState, type FormEvent } from 'react';
import { validateWeatherCapabilities, WEATHER_FIELDS, WEATHER_SCHEMA_ID, WEATHER_LISTING_HEADER } from '@tb/weather-contract';
import { price, txUrl } from '../lib/types.ts';
import type { TryItProps } from './TryItPanel.tsx';
import { CallActions } from './Community.tsx';

type WeatherResponse = { schema: string; availableFields: string[]; extraFields?: string[]; location?: Record<string, unknown>; forecast?: Record<string, unknown>; extras?: Record<string, unknown> };

export function WeatherTryItPanel({ listing, pay, onClose }: TryItProps) {
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [forecastHours, setForecastHours] = useState('1');
  const [result, setResult] = useState<WeatherResponse | null>(null);
  const [txHash, setTxHash] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt,setReceipt]=useState<{callId?:string;receiptError?:string;proof?:string}>({});
  const cost = price(listing.priceAtomic);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!pay) return;
    setBusy(true); setError(null); setResult(null); setTxHash(undefined); setReceipt({});
    try {
      const response = await pay(listing.communityEnabled ? `/api/invoke/${listing.id ?? listing.provider}` : listing.endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json', [WEATHER_LISTING_HEADER]: listing.id ?? listing.provider },
        body: JSON.stringify({ latitude: Number(latitude), longitude: Number(longitude), forecastHours: Number(forecastHours) }),
      });
      setReceipt({callId:response.headers.get('x-tb-call-id')??undefined,receiptError:response.headers.get('x-tb-receipt-error')??undefined,proof:response.headers.get('x-tb-receipt-proof')??undefined});
      setTxHash(response.payment?.txHash);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as WeatherResponse;
      if (body.schema !== WEATHER_SCHEMA_ID || !body.location || !body.forecast || !Array.isArray(body.availableFields)) throw new Error('Provider response does not match api:weather@1');
      validateWeatherCapabilities({ schema: body.schema, availableFields: body.availableFields, extraFields: body.extraFields });
      setResult(body); setTxHash(response.payment?.txHash);
    } catch (e) {
      setError(`Request failed: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };

  const valueAt = (fieldId: string) => {
    const [group, key] = fieldId.split('.');
    const source = group === 'location' ? result?.location : result?.forecast;
    const value = source?.[key];
    return value === undefined || value === null ? null : String(value);
  };

  return (
    <aside className="tryit" role="dialog" aria-label={`Try ${listing.name}`}>
      <header className="tryit__head"><div><b>{listing.name}</b> · <code>{WEATHER_SCHEMA_ID}</code><div className="muted">{cost} per weather request, paid over x402</div></div><button className="btn btn--ghost" onClick={onClose} aria-label="Close">✕</button></header>
      <form className="weather-tryit" onSubmit={submit}>
        <label className="field">Latitude<input type="number" min="-90" max="90" step="any" required value={latitude} onChange={(e) => setLatitude(e.target.value)} /></label>
        <label className="field">Longitude<input type="number" min="-180" max="180" step="any" required value={longitude} onChange={(e) => setLongitude(e.target.value)} /></label>
        <label className="field">Forecast horizon (hours)<input type="number" min="1" max="48" step="1" required value={forecastHours} onChange={(e) => setForecastHours(e.target.value)} /></label>
        <button className="btn" type="submit" disabled={busy || !pay}>{busy ? 'Waiting for payment…' : pay ? `Pay ${cost} & request forecast` : 'Connect wallet first'}</button>
      </form>
      <div className="tryit__msgs">
        {error && <p className="empty--error">{error}</p>}
        {result && <>
          <p><b>Weather forecast</b> · {String(result.forecast?.validAt ?? '')}</p>
          <dl className="weather-result">{WEATHER_FIELDS.filter((f) => f.group === 'response' && result.availableFields.includes(f.id)).map((field) => <div key={field.id}><dt>{field.label}{field.unit ? ` (${field.unit})` : ''}</dt><dd>{valueAt(field.id) ?? 'No value'}</dd></div>)}</dl>
          {!!result.extraFields?.length && <><h3>Additional fields <small className="muted">unverified</small></h3><dl className="weather-result">{result.extraFields.map((name) => <div key={name}><dt>{name}</dt><dd>{String(result.extras?.[name] ?? 'No value')}</dd></div>)}</dl></>}
          {txHash && txHash !== 'simulated' && <a href={txUrl(txHash)} target="_blank" rel="noreferrer">Paid {cost} · tx {txHash.slice(0, 8)}…</a>}
        </>}
        {(receipt.callId||receipt.receiptError)&&<CallActions {...receipt}/>}
      </div>
      <p className="muted weather-tryit__schema">Request and response follow <a href="/api/schemas/weather/v1" target="_blank" rel="noreferrer">the published OpenAPI contract</a>.</p>
    </aside>
  );
}
