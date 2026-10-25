'use client';
import { useEffect, useState } from 'react';
import { capabilitiesUrl, validateWeatherCapabilities, WEATHER_FIELDS, WEATHER_SCHEMA_ID } from '@tb/weather-contract';
import type { ApiListing } from '../lib/types.ts';

type State = { status: 'idle' | 'loading' } | { status: 'ok'; fields: Set<string> } | { status: 'error'; message: string };

export function WeatherFieldMatrix({ listing }: { listing: ApiListing }) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetch(capabilitiesUrl(listing.endpoint), { signal: controller.signal, mode: 'cors' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return validateWeatherCapabilities(await response.json());
      })
      .then((manifest) => setState({ status: 'ok', fields: new Set(manifest.availableFields) }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: (error as Error).message });
      });
    return () => controller.abort();
  }, [listing.endpoint, open]);

  const outputs = WEATHER_FIELDS.filter((field) => field.group === 'response');
  const inputs = WEATHER_FIELDS.filter((field) => field.group === 'request');
  const provided = state.status === 'ok' ? outputs.filter((field) => state.fields.has(field.id)).length : null;

  return (
    <section className="weather-capabilities" aria-label="Weather data capabilities">
      <button className="weather-capabilities__toggle" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>Weather data fields</span>
        <span className="muted">{provided === null ? (state.status === 'error' ? 'Capabilities unavailable' : state.status === 'idle' ? 'Show supported fields' : 'Loading capabilities…') : `${provided} of ${outputs.length} provided`}</span>
      </button>
      {open && (
        <div className="weather-capabilities__body">
          <p className="muted">Contract <code>{WEATHER_SCHEMA_ID}</code> · <a href="/api/schemas/weather/v1" target="_blank" rel="noreferrer">View OpenAPI schema</a></p>
          <h4>Request inputs</h4>
          <ul className="weather-fields weather-fields--inputs">
            {inputs.map((field) => <li key={field.id} title={field.description}><span className="field-mark field-mark--input" aria-hidden="true">↗</span><span>{field.label}</span><small>{field.unit}</small><b>Input</b></li>)}
          </ul>
          <h4>Data returned</h4>
          {state.status === 'error' ? <p className="empty--error">Could not read provider capabilities: {state.message}</p> : state.status !== 'ok' ? <p className="muted">{state.status === 'idle' ? 'Open this section to load provider capabilities.' : 'Loading provider declaration…'}</p> : null}
          {state.status === 'ok' && (
            <ul className="weather-fields">
              {outputs.map((field) => {
                const yes = state.fields.has(field.id);
                return <li key={field.id} title={field.description}><span className={`field-mark ${yes ? 'field-mark--yes' : 'field-mark--no'}`} aria-hidden="true">{yes ? '✓' : '⊘'}</span><span>{field.label}</span><small>{field.unit}</small><b>{yes ? 'Provided' : 'Not provided'}</b></li>;
              })}
            </ul>
          )}
          <p className="muted">These are provider-declared capabilities. Audit results show whether checked fields were verified.</p>
        </div>
      )}
    </section>
  );
}
