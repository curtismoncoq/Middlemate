import { capabilitiesUrl, validateWeatherCapabilities, WEATHER_SCHEMA_ID, WEATHER_LISTING_HEADER, type NormalizedWeatherData, type NormalizedWeatherRequest, type WeatherCapabilityManifest } from '@tb/weather-contract';
import type { Listing } from '@tb/registry-client';
import type { PayingFetch } from '@tb/x402-client';
import { MIN_SCORED, type ProbeResult, type Verdict } from './scoring.ts';

export type WeatherAuditProbe = NormalizedWeatherRequest & { id: string };
export type WeatherFieldEvidence = {
  id: string;
  providerValue?: unknown;
  referenceValue?: unknown;
  tolerance: number | 'exact';
  delta?: number;
  pass: boolean;
  score: number;
  reason?: string;
};
export type WeatherProbeEvidence = {
  id: string;
  request: NormalizedWeatherRequest;
  status: 'ok' | 'error';
  fields: WeatherFieldEvidence[];
  error?: string;
  txHash?: string;
};
export type WeatherAuditEvidence = {
  scoringVersion?: 'distance-v1';
  source: 'MET Norway';
  referenceUrl: string;
  extraFields: string[];
  probes: WeatherProbeEvidence[];
};

export const WEATHER_PROBES: WeatherAuditProbe[] = [
  { id: 'oslo-1h', latitude: 59.9139, longitude: 10.7522, forecastHours: 1 },
  { id: 'lisbon-3h', latitude: 38.7223, longitude: -9.1393, forecastHours: 3 },
  { id: 'new-york-6h', latitude: 40.7128, longitude: -74.006, forecastHours: 6 },
  { id: 'tokyo-12h', latitude: 35.6762, longitude: 139.6503, forecastHours: 12 },
  { id: 'sydney-24h', latitude: -33.8688, longitude: 151.2093, forecastHours: 24 },
];

export const WEATHER_TOLERANCES: Record<string, number | 'exact'> = {
  'location.latitude': 0.01,
  'location.longitude': 0.01,
  'forecast.validAt': 3_600,
  'forecast.updatedAt': 21_600,
  'forecast.temperatureC': 2,
  'forecast.apparentTemperatureC': 2.5,
  'forecast.humidityPct': 12,
  'forecast.dewPointC': 3,
  'forecast.precipitationMm': 2,
  'forecast.windSpeedKmh': 8,
  'forecast.windDirectionDeg': 45,
  'forecast.cloudCoverPct': 25,
  'forecast.cloudCoverLowPct': 25,
  'forecast.cloudCoverMediumPct': 25,
  'forecast.cloudCoverHighPct': 25,
  'forecast.pressureHpa': 8,
  'forecast.uvIndexClearSky': 2,
  'forecast.fogPct': 25,
  'forecast.symbolCode': 'exact',
};

export const WEATHER_TRUST_THRESHOLD = Number(process.env.WEATHER_TRUST_THRESHOLD ?? 80);
if (!Number.isInteger(WEATHER_TRUST_THRESHOLD) || WEATHER_TRUST_THRESHOLD < 0 || WEATHER_TRUST_THRESHOLD > 100) throw new Error('WEATHER_TRUST_THRESHOLD must be an integer from 0 to 100');

const valueAt = (data: NormalizedWeatherData, id: string) => {
  const [group, key] = id.split('.');
  return group === 'location' ? data.location?.[key] : data.forecast?.[key];
};
const sorted = (values: string[]) => [...values].sort();
const same = (left: string[], right: string[]) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  let error: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await fn(); } catch (caught) { error = caught; }
  }
  throw error;
}

export async function fetchWeatherCapabilities(endpoint: string): Promise<WeatherCapabilityManifest> {
  const response = await fetch(capabilitiesUrl(endpoint), { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`capabilities HTTP ${response.status}`);
  return validateWeatherCapabilities(await response.json());
}

const FIELD_RANGES: Record<string, [number, number]> = {
  'location.latitude': [-90, 90], 'location.longitude': [-180, 180],
  ...Object.fromEntries(['humidityPct', 'cloudCoverPct', 'cloudCoverLowPct', 'cloudCoverMediumPct', 'cloudCoverHighPct', 'fogPct'].map((field) => [`forecast.${field}`, [0, 100] as [number, number]])),
  'forecast.windDirectionDeg': [0, 360], 'forecast.windSpeedKmh': [0, Infinity],
  'forecast.precipitationMm': [0, Infinity], 'forecast.pressureHpa': [0, Infinity], 'forecast.uvIndexClearSky': [0, Infinity],
};

/** Exact values earn 100; one tolerance unit of error earns 80; five or more earns 0. */
export function compareWeatherField(id: string, providerValue: unknown, referenceValue: unknown): WeatherFieldEvidence | null {
  if (referenceValue === undefined || referenceValue === null) return null;
  const tolerance = WEATHER_TOLERANCES[id] ?? 'exact';
  const base = { id, providerValue, referenceValue, tolerance, pass: false, score: 0 };
  if (providerValue === undefined || providerValue === null) return { ...base, reason: 'Declared field is missing' };
  if (tolerance === 'exact') return { ...base, pass: providerValue === referenceValue, score: providerValue === referenceValue ? 100 : 0 };
  let delta: number;
  if (id === 'forecast.validAt' || id === 'forecast.updatedAt') {
    if (typeof providerValue !== 'string') return { ...base, reason: 'Invalid timestamp' };
    const providerTime = Date.parse(providerValue);
    const referenceTime = Date.parse(String(referenceValue));
    if (!Number.isFinite(referenceTime)) return null;
    if (!Number.isFinite(providerTime)) return { ...base, reason: 'Invalid timestamp' };
    delta = Math.abs(providerTime - referenceTime) / 1000;
  } else {
    if (typeof referenceValue !== 'number' || !Number.isFinite(referenceValue)) return null;
    const range = FIELD_RANGES[id];
    if (range && (referenceValue < range[0] || referenceValue > range[1])) return null;
    if (typeof providerValue !== 'number' || !Number.isFinite(providerValue)) return { ...base, reason: 'Expected a finite number' };
    if (range && (providerValue < range[0] || providerValue > range[1])) return { ...base, reason: `Outside valid range ${range[0]}–${range[1]}` };
    delta = Math.abs(providerValue - referenceValue);
    if (id === 'forecast.windDirectionDeg') delta = Math.min(delta, 360 - delta);
  }
  return { ...base, delta: Math.round(delta * 100) / 100, pass: delta <= tolerance, score: Math.round(Math.max(0, 100 - 20 * delta / tolerance) * 100) / 100 };
}

type WeatherAuditDeps = {
  pay: PayingFetch;
  reference: (request: NormalizedWeatherRequest) => Promise<NormalizedWeatherData>;
  capabilities?: (endpoint: string) => Promise<WeatherCapabilityManifest>;
  probes?: WeatherAuditProbe[];
  onProgress?: (probe: WeatherAuditProbe, result: WeatherProbeEvidence) => void;
};

export async function auditWeatherListing(listing: Listing, deps: WeatherAuditDeps): Promise<{ verdict: Verdict; probes: ProbeResult[]; weather: WeatherAuditEvidence; spentAtomic: string }> {
  const auditProbes = deps.probes ?? WEATHER_PROBES;
  let manifest: WeatherCapabilityManifest;
  try {
    manifest = await retry(() => (deps.capabilities ?? fetchWeatherCapabilities)(listing.endpoint));
  } catch (error) {
    const message = `capabilities failed: ${(error as Error).message}`;
    const evidence = auditProbes.map((probe) => ({ id: probe.id, request: probe, status: 'error' as const, fields: [], error: message }));
    return { verdict: { score: 0, matchedModel: 'MET Norway', confidence: 0, scored: 0, inconclusive: true, pass: true }, probes: evidence.map((item) => ({ probeId: item.id, kind: 'checkable', status: 'error', error: message })), weather: { scoringVersion: 'distance-v1', source: 'MET Norway', referenceUrl: 'https://api.met.no/weatherapi/locationforecast/2.0/', extraFields: [], probes: evidence }, spentAtomic: '0' };
  }

  if (manifest.availableFields.length === 0) {
    const message = 'This listing declares only extra fields; MET Norway has no comparable canonical fields.';
    const evidence = auditProbes.map((probe) => ({ id: probe.id, request: probe, status: 'error' as const, fields: [], error: message }));
    return {
      verdict: { score: 0, matchedModel: 'No MET Norway fields declared', confidence: 0, scored: 0, inconclusive: true, pass: true },
      probes: evidence.map((item) => ({ probeId: item.id, kind: 'checkable', status: 'error', error: message })),
      weather: { scoringVersion: 'distance-v1', source: 'MET Norway', referenceUrl: 'https://api.met.no/weatherapi/locationforecast/2.0/', extraFields: manifest.extraFields ?? [], probes: evidence },
      spentAtomic: '0',
    };
  }

  const weatherEvidence: WeatherProbeEvidence[] = [];
  const probeResults: ProbeResult[] = [];
  let paid = 0n;
  for (const probe of auditProbes) {
    let probeTxHash: string | undefined;
    let probeWasPaid = false;
    try {
      // Resolve the free official reference first so an upstream outage never costs the provider a paid probe.
      const reference = await retry(() => deps.reference(probe));
      let response: Awaited<ReturnType<PayingFetch>> | undefined;
      let lastPaymentError: unknown;
      for (let attempt = 0; attempt < 2 && !response; attempt++) {
        try {
          const candidate = await deps.pay(listing.endpoint, {
            method: 'POST', headers: { 'content-type': 'application/json', [WEATHER_LISTING_HEADER]: listing.id ?? listing.provider },
            body: JSON.stringify({ latitude: probe.latitude, longitude: probe.longitude, forecastHours: probe.forecastHours }),
            signal: AbortSignal.timeout(45_000),
          }, { maxAmountAtomic: listing.priceAtomic });
          probeTxHash = candidate.payment?.txHash;
          probeWasPaid = !!probeTxHash;
          if (candidate.ok || probeWasPaid) response = candidate;
          if (!candidate.ok && !probeWasPaid) throw new Error(`provider HTTP ${candidate.status}`);
        } catch (error) {
          lastPaymentError = error;
          if (response) break;
        }
      }
      if (!response) throw lastPaymentError ?? new Error('provider request failed');
      if (probeWasPaid || response.ok) paid += listing.priceAtomic;
      if (!response.ok) throw new Error(`provider HTTP ${response.status}`);

      let providerData: NormalizedWeatherData = { location: {}, forecast: {} };
      let responseError: string | undefined;
      try {
        const body = await response.json() as { schema?: string; availableFields?: string[]; extraFields?: string[]; location?: Record<string, unknown>; forecast?: Record<string, unknown>; extras?: Record<string, unknown> };
        if (body.schema !== WEATHER_SCHEMA_ID || !body.location || !body.forecast || !Array.isArray(body.availableFields)) {
          responseError = 'provider response does not match api:weather@1';
        } else {
          const responseManifest = validateWeatherCapabilities(body);
          if (!same(responseManifest.availableFields, manifest.availableFields) || !same(responseManifest.extraFields ?? [], manifest.extraFields ?? [])) {
            responseError = 'response capabilities differ from public manifest';
          } else {
            providerData = { location: body.location, forecast: body.forecast, extras: body.extras };
          }
        }
      } catch (error) {
        responseError = `invalid provider JSON or capability manifest: ${(error as Error).message}`;
      }
      const fields = manifest.availableFields.map((id) => compareWeatherField(id, responseError ? undefined : valueAt(providerData, id), valueAt(reference, id))).filter((field): field is WeatherFieldEvidence => !!field);
      if (!fields.length) throw new Error('MET Norway returned no comparable declared fields');
      const correct = fields.every((field) => field.pass);
      const evidence = { id: probe.id, request: { latitude: probe.latitude, longitude: probe.longitude, forecastHours: probe.forecastHours }, status: 'ok' as const, fields, ...(responseError ? { error: responseError } : {}), txHash: response.payment?.txHash };
      weatherEvidence.push(evidence);
      probeResults.push({ probeId: probe.id, kind: 'checkable', status: 'ok', answer: JSON.stringify(providerData), correct, prompt: `${probe.latitude},${probe.longitude} +${probe.forecastHours}h`, txHash: response.payment?.txHash });
      deps.onProgress?.(probe, evidence);
    } catch (error) {
      const message = (error as Error).message;
      const evidence = { id: probe.id, request: { latitude: probe.latitude, longitude: probe.longitude, forecastHours: probe.forecastHours }, status: 'error' as const, fields: [], error: message, ...(probeTxHash ? { txHash: probeTxHash } : {}) };
      weatherEvidence.push(evidence);
      probeResults.push({ probeId: probe.id, kind: 'checkable', status: 'error', error: message, prompt: `${probe.latitude},${probe.longitude} +${probe.forecastHours}h` });
      deps.onProgress?.(probe, evidence);
    }
  }
  const valid = weatherEvidence.filter((probe) => probe.status === 'ok');
  const fields = valid.flatMap((probe) => probe.fields);
  const score = fields.length ? Math.floor(fields.reduce((sum, field) => sum + field.score, 0) / fields.length + 1e-9) : 0;
  const scored = valid.length;
  const inconclusive = scored < MIN_SCORED;
  const pass = inconclusive || score >= WEATHER_TRUST_THRESHOLD;
  return {
    verdict: { score, matchedModel: pass ? 'MET Norway' : 'MET Norway contradiction', confidence: score / 100, scored, inconclusive, pass },
    probes: probeResults,
    weather: { scoringVersion: 'distance-v1', source: 'MET Norway', referenceUrl: 'https://api.met.no/weatherapi/locationforecast/2.0/', extraFields: manifest.extraFields ?? [], probes: weatherEvidence },
    spentAtomic: String(paid),
  };
}
