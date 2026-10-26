export type NormalizedWeatherRequest = { latitude: number; longitude: number; forecastHours: number };
export type NormalizedWeatherData = { location: Record<string, unknown>; forecast: Record<string, unknown>; extras?: Record<string, unknown> };

type MetTimeseries = {
  time?: string;
  data?: {
    instant?: { details?: Record<string, unknown> };
    next_1_hours?: { summary?: { symbol_code?: unknown }; details?: Record<string, unknown> };
  };
};

type MetPayload = {
  geometry?: { coordinates?: unknown[] };
  properties?: { meta?: { updated_at?: unknown }; timeseries?: MetTimeseries[] };
};

type CacheEntry = { expiresAt: number; value: NormalizedWeatherData; lastModified?: string; etag?: string };
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const string = (value: unknown) => typeof value === 'string' && value ? value : undefined;
const put = (target: Record<string, unknown>, key: string, value: unknown) => { if (value !== undefined) target[key] = value; };

export function createMetNorwayClient(options: {
  fetch?: typeof fetch;
  now?: () => number;
  userAgent?: string;
  baseUrl?: string;
} = {}) {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const userAgent = options.userAgent ?? 'Middlemate/1.0 github.com/curtismoncoq/Middlemate';
  const baseUrl = options.baseUrl ?? 'https://api.met.no/weatherapi/locationforecast/2.0/complete';
  const cache = new Map<string, CacheEntry>();

  async function forecast(request: NormalizedWeatherRequest): Promise<NormalizedWeatherData> {
    const latitude = Number(request.latitude.toFixed(4));
    const longitude = Number(request.longitude.toFixed(4));
    const url = `${baseUrl}?lat=${latitude.toFixed(4)}&lon=${longitude.toFixed(4)}`;
    const cached = cache.get(url);
    if (cached && cached.expiresAt > now()) return structuredClone(cached.value);

    const headers: Record<string, string> = { 'user-agent': userAgent, accept: 'application/json' };
    if (cached?.lastModified) headers['if-modified-since'] = cached.lastModified;
    if (cached?.etag) headers['if-none-match'] = cached.etag;
    const response = await fetcher(url, { headers, redirect: 'follow' });
    if (response.status === 304 && cached) {
      const expiresAt = Date.parse(response.headers.get('expires') ?? '');
      cached.expiresAt = Number.isFinite(expiresAt) && expiresAt > now() ? expiresAt : now() + 5 * 60_000;
      return structuredClone(cached.value);
    }
    if (!response.ok) throw new Error(`MET Norway HTTP ${response.status}`);
    const payload = await response.json() as MetPayload;
    const timeseries = payload.properties?.timeseries;
    if (!Array.isArray(timeseries) || !timeseries.length) throw new Error('MET Norway returned no forecast timeseries');
    const target = now() + request.forecastHours * 3_600_000;
    const selected = [...timeseries].sort((left, right) => Math.abs(Date.parse(left.time ?? '') - target) - Math.abs(Date.parse(right.time ?? '') - target))[0];
    if (!selected?.time || !Number.isFinite(Date.parse(selected.time))) throw new Error('MET Norway returned an invalid forecast time');
    const coordinates = payload.geometry?.coordinates ?? [];
    const details = selected.data?.instant?.details ?? {};
    const period = selected.data?.next_1_hours;
    const location: Record<string, unknown> = {};
    const forecastData: Record<string, unknown> = {};
    put(location, 'longitude', number(coordinates[0]));
    put(location, 'latitude', number(coordinates[1]));
    put(forecastData, 'validAt', selected.time);
    put(forecastData, 'updatedAt', string(payload.properties?.meta?.updated_at));
    put(forecastData, 'temperatureC', number(details.air_temperature));
    put(forecastData, 'apparentTemperatureC', number(details.apparent_air_temperature));
    put(forecastData, 'humidityPct', number(details.relative_humidity));
    put(forecastData, 'dewPointC', number(details.dew_point_temperature));
    put(forecastData, 'precipitationMm', number(period?.details?.precipitation_amount));
    const windMps = number(details.wind_speed);
    put(forecastData, 'windSpeedKmh', windMps === undefined ? undefined : Math.round(windMps * 36) / 10);
    put(forecastData, 'windDirectionDeg', number(details.wind_from_direction));
    put(forecastData, 'cloudCoverPct', number(details.cloud_area_fraction));
    put(forecastData, 'cloudCoverLowPct', number(details.cloud_area_fraction_low));
    put(forecastData, 'cloudCoverMediumPct', number(details.cloud_area_fraction_medium));
    put(forecastData, 'cloudCoverHighPct', number(details.cloud_area_fraction_high));
    put(forecastData, 'pressureHpa', number(details.air_pressure_at_sea_level));
    put(forecastData, 'uvIndexClearSky', number(details.ultraviolet_index_clear_sky));
    put(forecastData, 'fogPct', number(details.fog_area_fraction));
    put(forecastData, 'symbolCode', string(period?.summary?.symbol_code));
    const value = { location, forecast: forecastData };
    const expiresAt = Date.parse(response.headers.get('expires') ?? '');
    cache.set(url, {
      expiresAt: Number.isFinite(expiresAt) && expiresAt > now() ? expiresAt : now() + 5 * 60_000,
      value,
      lastModified: response.headers.get('last-modified') ?? undefined,
      etag: response.headers.get('etag') ?? undefined,
    });
    return structuredClone(value);
  }

  return { forecast };
}
