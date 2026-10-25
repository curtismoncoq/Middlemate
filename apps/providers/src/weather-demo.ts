import express, { type Express } from 'express';
import type { Config, Role } from '@tb/config';
import { WEATHER_FIELDS } from '@tb/weather-contract';
import { mountWeatherProvider, type WeatherProviderOptions } from './weather.ts';
import { buyerCors } from './cors.ts';

const allFields = WEATHER_FIELDS.filter((field) => field.group === 'response').map((field) => field.id);

export type WeatherDemoProfile = Pick<WeatherProviderOptions, 'priceUsd' | 'availableFields' | 'backend'> & {
  id: string; name: string; port: number;
  /** testnet identity (TB_<ROLE>_* in .env, created by scripts/setup-keys.sh) that receives this API's payments */
  role: Extract<Role, 'weatherAtlas' | 'weatherThermo' | 'weatherRainwind'>;
};


const complete = (request: { latitude: number; longitude: number; forecastHours: number }) => ({
  location: { name: `Demo location (${request.latitude.toFixed(2)}, ${request.longitude.toFixed(2)})`, latitude: request.latitude, longitude: request.longitude },
  forecast: {
    validAt: new Date(Date.UTC(2026, 0, 1, request.forecastHours)).toISOString(), temperatureC: 18.4,
    feelsLikeC: 17.8, humidityPct: 64, precipitationMm: 0.2, precipitationProbabilityPct: 15,
    windSpeedKmh: 12, windDirectionDeg: 245, cloudCoverPct: 28, pressureHpa: 1014,
    uvIndex: 3, weatherCode: 2, summary: 'Partly cloudy (synthetic demo data)',
  },
});

export const WEATHER_DEMO_PROFILES: WeatherDemoProfile[] = [
  { id: 'weather-atlas-demo', name: 'Weather Atlas Demo', port: 4003, role: 'weatherAtlas', priceUsd: '0.01', availableFields: allFields, backend: async (r) => complete(r) },
  { id: 'thermo-simple-demo', name: 'Thermo Simple Demo', port: 4004, role: 'weatherThermo', priceUsd: '0.005', availableFields: ['location.name', 'forecast.validAt', 'forecast.temperatureC', 'forecast.feelsLikeC', 'forecast.humidityPct', 'forecast.summary'], backend: async (r) => { const d = complete(r); d.forecast.temperatureC = 21.2; d.forecast.feelsLikeC = 22.1; d.forecast.humidityPct = 57; d.forecast.summary = 'Warm and mostly clear (synthetic demo data)'; return d; } },
  { id: 'rain-wind-demo', name: 'Rain & Wind Demo', port: 4005, role: 'weatherRainwind', priceUsd: '0.007', availableFields: ['location.latitude', 'location.longitude', 'forecast.validAt', 'forecast.precipitationMm', 'forecast.precipitationProbabilityPct', 'forecast.windSpeedKmh', 'forecast.windDirectionDeg', 'forecast.cloudCoverPct', 'forecast.weatherCode'], backend: async (r) => { const d = complete(r); d.forecast.precipitationMm = 4.6; d.forecast.precipitationProbabilityPct = 82; d.forecast.windSpeedKmh = 31; d.forecast.windDirectionDeg = 190; d.forecast.cloudCoverPct = 91; d.forecast.weatherCode = 61; return d; } },
];

export function createWeatherDemoApp(profile: WeatherDemoProfile, opts: { paymentsMode: Config['paymentsMode']; payTo: string }): Express {
  const app = express();
  app.use(buyerCors);
  app.use(express.json());
  mountWeatherProvider(app, { ...opts, ...profile, provider: opts.payTo, name: profile.name });
  return app;
}
