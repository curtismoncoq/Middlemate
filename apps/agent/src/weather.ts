import type { Listing, RegistryClient } from '@tb/registry-client';
import type { PayingFetch } from '@tb/x402-client';
import { capabilitiesUrl, validateWeatherCapabilities, WEATHER_SCHEMA_ID } from '@tb/weather-contract';
import { BudgetGuard, usd } from './budget.ts';

export type WeatherRequest = { latitude: number; longitude: number; forecastHours?: number };
type WeatherDeps = {
  registry: Pick<RegistryClient, 'list' | 'isActive'>;
  pay: PayingFetch;
  log: (line: string) => void;
  guard: BudgetGuard;
  schemaUrl?: string;
};

/** Finds and pays the cheapest active weather listing, following the shared OpenAPI contract. */
export async function runWeatherRequest(deps: WeatherDeps, request: WeatherRequest) {
  if (!Number.isFinite(request.latitude) || request.latitude < -90 || request.latitude > 90) throw new Error('latitude must be between -90 and 90');
  if (!Number.isFinite(request.longitude) || request.longitude < -180 || request.longitude > 180) throw new Error('longitude must be between -180 and 180');
  const forecastHours = request.forecastHours ?? 1;
  if (!Number.isInteger(forecastHours) || forecastHours < 1 || forecastHours > 48) throw new Error('forecastHours must be an integer from 1 to 48');
  const schemaResponse = await fetch(deps.schemaUrl ?? 'http://localhost:3000/api/schemas/weather/v1', { signal: AbortSignal.timeout(5000) });
  if (!schemaResponse.ok) throw new Error(`could not retrieve weather contract (HTTP ${schemaResponse.status})`);
  const openapi = await schemaResponse.json() as { openapi?: string; info?: { version?: string }; paths?: Record<string, unknown> };
  if (openapi.openapi !== '3.1.0' || openapi.info?.version !== '1' || !openapi.paths?.['/weather/v1/forecast']) throw new Error('marketplace returned an unsupported weather contract');

  const excluded = new Set<string>();
  for (;;) {
    const listing = (await deps.registry.list())
      .filter((candidate: Listing) => candidate.active && candidate.stakeAtomic > 0n && candidate.claimedModel === WEATHER_SCHEMA_ID && !excluded.has(candidate.provider))
      .sort((a, b) => a.priceAtomic < b.priceAtomic ? -1 : a.priceAtomic > b.priceAtomic ? 1 : 0)[0];
    if (!listing) {
      deps.log(`[agent] no active provider for ${WEATHER_SCHEMA_ID}`);
      return { paidTo: null as string | null };
    }
    if (!(await deps.registry.isActive(listing.provider))) { excluded.add(listing.provider); continue; }
    if (!deps.guard.canSpend(listing.priceAtomic)) {
      deps.log(`[agent] REJECTED: payment ${usd(listing.priceAtomic)} exceeds remaining budget ${usd(deps.guard.remaining())}`);
      return { paidTo: null as string | null };
    }

    try {
      const capabilitiesResponse = await fetch(capabilitiesUrl(listing.endpoint), { signal: AbortSignal.timeout(5000) });
      if (!capabilitiesResponse.ok) throw new Error(`capabilities HTTP ${capabilitiesResponse.status}`);
      const capabilities = validateWeatherCapabilities(await capabilitiesResponse.json());
      if (!capabilities.availableFields.includes('forecast.temperatureC')) throw new Error('provider does not offer forecast.temperatureC');
      const response = await deps.pay(
        listing.endpoint,
        {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ latitude: request.latitude, longitude: request.longitude, forecastHours }),
          signal: AbortSignal.timeout(45_000),
        },
        { maxAmountAtomic: listing.priceAtomic }, // never pay more than the registered price
      );
      if (response.ok || response.payment?.txHash) deps.guard.record(listing.priceAtomic);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json() as { schema?: string; availableFields?: string[]; forecast?: unknown; location?: unknown };
      if (result.schema !== WEATHER_SCHEMA_ID || !result.forecast || !result.location || !Array.isArray(result.availableFields)) throw new Error('provider response does not match api:weather@1');
      const returned = validateWeatherCapabilities({ schema: result.schema, availableFields: result.availableFields });
      if ([...returned.availableFields].sort().join('|') !== [...capabilities.availableFields].sort().join('|')) throw new Error('response capability declaration changed');
      deps.log(`[agent] paid ${usd(listing.priceAtomic)} → ${listing.name} · tx ${response.payment?.txHash ?? '?'}`);
      deps.log(JSON.stringify(result, null, 2));
      return { paidTo: listing.name, result, txHash: response.payment?.txHash };
    } catch (error) {
      deps.log(`[agent] ${listing.name} failed (${(error as Error).message}) → trying the next provider`);
      excluded.add(listing.provider);
    }
  }
}
