import express, { type Express, type RequestHandler } from 'express';
import type { Config, Role } from '@tb/config';
import { createMetNorwayClient, WEATHER_LISTING_HEADER, WEATHER_SCHEMA_ID } from '@tb/weather-contract';
import { listingKey, type RegistryClient } from '@tb/registry-client';
import { mountWeatherProvider, type WeatherBackend, type WeatherData, type WeatherProviderOptions } from './weather.ts';
import { buyerCors } from './cors.ts';
import { paywall } from './paywall.ts';

export type WeatherDemoProfile = Pick<WeatherProviderOptions, 'priceUsd' | 'availableFields' | 'extraFields'> & {
  id: string; name: string; port: number;
  behaviour: 'exact' | 'tolerant' | 'dishonest' | 'extras';
  transform: (data: WeatherData) => WeatherData;
  /** testnet identity (TB_<ROLE>_* in .env, created by scripts/setup-keys.sh) that receives this API's payments */
  role: Extract<Role, 'weatherAtlas' | 'weatherThermo' | 'weatherRainwind'>;
};

const copy = (data: WeatherData) => structuredClone(data);
const shifted = (data: WeatherData, changes: Record<string, number>) => {
  const out = copy(data);
  for (const [key, delta] of Object.entries(changes)) {
    const value = out.forecast[key];
    if (typeof value === 'number') out.forecast[key] = value + delta;
  }
  return out;
};
const coreFields = ['location.latitude', 'location.longitude', 'forecast.validAt', 'forecast.updatedAt', 'forecast.temperatureC', 'forecast.apparentTemperatureC', 'forecast.humidityPct', 'forecast.windSpeedKmh', 'forecast.windDirectionDeg', 'forecast.cloudCoverPct', 'forecast.pressureHpa'];
const tolerantFields = ['location.latitude', 'location.longitude', 'forecast.validAt', 'forecast.temperatureC', 'forecast.apparentTemperatureC', 'forecast.humidityPct', 'forecast.windSpeedKmh'];
const dishonestFields = ['location.latitude', 'location.longitude', 'forecast.validAt', 'forecast.temperatureC', 'forecast.humidityPct', 'forecast.precipitationMm', 'forecast.windSpeedKmh', 'forecast.cloudCoverPct', 'forecast.pressureHpa'];

export const WEATHER_DEMO_PROFILES: WeatherDemoProfile[] = [
  // Keep demo asks at the List form's default price so a fresh listing can be audited without a cap mismatch.
  { id: 'met-exact-demo', name: 'MET Exact Demo', port: 4003, role: 'weatherAtlas', behaviour: 'exact', priceUsd: '0.005', availableFields: coreFields, transform: copy },
  { id: 'nearcast-demo', name: 'NearCast Demo', port: 4004, role: 'weatherThermo', behaviour: 'tolerant', priceUsd: '0.005', availableFields: tolerantFields, transform: (data) => {
    const out = shifted(data, { temperatureC: 1, apparentTemperatureC: 1, humidityPct: 7, windSpeedKmh: 5 });
    if (typeof out.forecast.humidityPct === 'number') out.forecast.humidityPct = Math.min(100, Math.max(0, out.forecast.humidityPct));
    return out;
  } },
  { id: 'false-front-demo', name: 'False Front Demo', port: 4005, role: 'weatherRainwind', behaviour: 'dishonest', priceUsd: '0.005', availableFields: dishonestFields, transform: (data) => shifted(data, { temperatureC: 25, humidityPct: -45, precipitationMm: 20, windSpeedKmh: 70, cloudCoverPct: 60, pressureHpa: -65 }) },
  { id: 'met-plus-demo', name: 'MET Plus Demo', port: 4006, role: 'weatherAtlas', behaviour: 'extras', priceUsd: '0.005', availableFields: coreFields, extraFields: ['pollenRisk', 'outdoorRecommendation'], transform: (data) => ({ ...copy(data), extras: { pollenRisk: 'low', outdoorRecommendation: 'Good conditions for outdoor activity' } }) },
];

const metNorway = createMetNorwayClient();

export function createWeatherDemoApp(profile: WeatherDemoProfile, opts: { paymentsMode: Config['paymentsMode']; payTo: string; reference?: WeatherBackend; registry?: Pick<RegistryClient, 'list'> }): Express {
  const app = express();
  app.use(buyerCors);
  app.use(express.json());
  const reference = opts.reference ?? metNorway.forecast;
  const walls = new Map<string, RequestHandler>();
  const paymentMiddleware: RequestHandler | undefined = opts.registry ? async (req, res, next) => {
    try {
      const id = req.header(WEATHER_LISTING_HEADER);
      const registrations = await opts.registry!.list();
      const matchesEndpoint = (endpoint: string) => {
        try {
          const url = new URL(endpoint);
          return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && Number(url.port) === profile.port && url.pathname === '/weather/v1/forecast';
        } catch { return false; }
      };
      const candidates = registrations.filter((listing) => id ? listingKey(listing) === id : matchesEndpoint(listing.endpoint));
      if (id && candidates.length !== 1) { res.status(404).json({ error: 'Weather listing not found.' }); return; }
      const active = candidates.filter((listing) => matchesEndpoint(listing.endpoint) && listing.claimedModel === WEATHER_SCHEMA_ID && listing.active && !listing.retired && listing.stakeAtomic > 0n && (!listing.exitAt || listing.exitAt > Date.now() / 1000));
      if (candidates.length && active.length === 0) { res.status(409).json({ error: 'This weather listing is inactive or belongs to another endpoint.' }); return; }
      if (active.length > 1) { res.status(400).json({ error: `Select a listing with the ${WEATHER_LISTING_HEADER} header.` }); return; }
      const listing = active[0];
      const recipient = listing?.provider ?? opts.payTo;
      const amount = listing?.priceAtomic;
      const priceUsd = amount === undefined ? profile.priceUsd : `${amount / 10000000n}.${String(amount % 10000000n).padStart(7, '0')}`.replace(/0+$/, '').replace(/\.$/, '');
      const key = `${recipient}:${priceUsd}`;
      let wall = walls.get(key);
      if (!wall) { wall = paywall('/weather/v1/forecast', `$${priceUsd}`, recipient, { paymentsMode: opts.paymentsMode }); walls.set(key, wall); }
      return wall(req, res, next);
    } catch {
      res.status(503).json({ error: 'Could not verify the weather listing payout wallet. No payment requested.' });
    }
  } : undefined;
  mountWeatherProvider(app, { ...opts, ...profile, paymentMiddleware, provider: opts.payTo, name: profile.name, backend: async (request) => profile.transform(await reference(request)) });
  return app;
}
