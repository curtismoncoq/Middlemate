import type { Express, RequestHandler } from 'express';
import { MET_NORWAY_FIELD_IDS, validateWeatherCapabilities, WEATHER_SCHEMA_ID } from '@tb/weather-contract';
import { paywall } from './paywall.ts';
import type { Config } from '@tb/config';

export type WeatherRequest = { latitude: number; longitude: number; forecastHours: number };
export type WeatherData = { location: Record<string, unknown>; forecast: Record<string, unknown>; extras?: Record<string, unknown> };
export type WeatherBackend = (request: WeatherRequest) => Promise<WeatherData>;

export type WeatherProviderOptions = {
  paymentsMode: Config['paymentsMode'];
  priceUsd: string;
  payTo: string;
  provider?: string;
  name?: string;
  availableFields: string[];
  extraFields?: string[];
  backend: WeatherBackend;
  paymentMiddleware?: RequestHandler;
};

/** Mounts the shared weather contract. The capability document is public; forecasts use x402. */
export function mountWeatherProvider(app: Express, opts: WeatherProviderOptions) {
  const manifest = validateWeatherCapabilities({ schema: WEATHER_SCHEMA_ID, availableFields: opts.availableFields, extraFields: opts.extraFields });
  const route = '/weather/v1/forecast';
  app.get('/weather/v1/capabilities', (_req, res) => res.json(manifest));
  app.post(route, opts.paymentMiddleware ?? paywall(route, `$${opts.priceUsd}`, opts.payTo, { paymentsMode: opts.paymentsMode }), async (req, res) => {
    const latitude = req.body?.latitude;
    const longitude = req.body?.longitude;
    const forecastHours = req.body?.forecastHours ?? 1;
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
        !Number.isInteger(forecastHours) || forecastHours < 1 || forecastHours > 48 ||
        Object.keys(req.body ?? {}).some((key) => !['latitude', 'longitude', 'forecastHours'].includes(key))) {
      res.status(400).json({ error: 'Expected latitude, longitude, and optional forecastHours (1–48).' });
      return;
    }
    try {
      const data = await opts.backend({ latitude, longitude, forecastHours });
      const location = { ...data.location };
      const forecast = { ...data.forecast };
      for (const id of MET_NORWAY_FIELD_IDS) {
        if (manifest.availableFields.includes(id)) continue;
        const [group, key] = id.split('.');
        if (group === 'location') delete location[key]; else delete forecast[key];
      }
      const extras = Object.fromEntries((manifest.extraFields ?? []).filter((name) => data.extras?.[name] !== undefined).map((name) => [name, data.extras![name]]));
      res.json({ ...manifest, location, forecast, ...(manifest.extraFields?.length ? { extras } : {}) });
    } catch (error) {
      res.status(502).json({ error: `weather upstream failed: ${(error as Error).message}` });
    }
  });
}
