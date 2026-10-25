export const WEATHER_SCHEMA_ID = 'api:weather@1' as const;

export type WeatherField = {
  id: string;
  label: string;
  unit: string;
  description: string;
  group: 'request' | 'response';
};

/** Stable superset; providers publish the subset they can return in their capability manifest. */
export const WEATHER_FIELDS: WeatherField[] = [
  { id: 'request.latitude', label: 'Latitude', unit: '°', description: 'Requested latitude in decimal degrees.', group: 'request' },
  { id: 'request.longitude', label: 'Longitude', unit: '°', description: 'Requested longitude in decimal degrees.', group: 'request' },
  { id: 'request.forecastHours', label: 'Forecast horizon', unit: 'hours', description: 'How far ahead the request asks for a forecast.', group: 'request' },
  { id: 'location.name', label: 'Resolved place name', unit: '', description: 'A readable place name for the requested coordinates.', group: 'response' },
  { id: 'location.latitude', label: 'Resolved latitude', unit: '°', description: 'Latitude used by the provider after location resolution.', group: 'response' },
  { id: 'location.longitude', label: 'Resolved longitude', unit: '°', description: 'Longitude used by the provider after location resolution.', group: 'response' },
  { id: 'forecast.validAt', label: 'Forecast time', unit: 'UTC', description: 'ISO 8601 time for the forecast values.', group: 'response' },
  { id: 'forecast.temperatureC', label: 'Temperature', unit: '°C', description: 'Air temperature at 2 metres.', group: 'response' },
  { id: 'forecast.feelsLikeC', label: 'Feels like', unit: '°C', description: 'Apparent temperature.', group: 'response' },
  { id: 'forecast.humidityPct', label: 'Relative humidity', unit: '%', description: 'Relative humidity near the surface.', group: 'response' },
  { id: 'forecast.precipitationMm', label: 'Precipitation', unit: 'mm', description: 'Expected precipitation for the forecast period.', group: 'response' },
  { id: 'forecast.precipitationProbabilityPct', label: 'Precipitation chance', unit: '%', description: 'Probability of precipitation during the forecast period.', group: 'response' },
  { id: 'forecast.windSpeedKmh', label: 'Wind speed', unit: 'km/h', description: 'Wind speed near the surface.', group: 'response' },
  { id: 'forecast.windDirectionDeg', label: 'Wind direction', unit: '°', description: 'Direction the wind comes from, clockwise from north.', group: 'response' },
  { id: 'forecast.cloudCoverPct', label: 'Cloud cover', unit: '%', description: 'Fraction of the sky covered by clouds.', group: 'response' },
  { id: 'forecast.pressureHpa', label: 'Pressure', unit: 'hPa', description: 'Atmospheric pressure.', group: 'response' },
  { id: 'forecast.uvIndex', label: 'UV index', unit: '', description: 'Forecast ultraviolet index.', group: 'response' },
  { id: 'forecast.weatherCode', label: 'Weather code', unit: '', description: 'Provider-normalized weather condition code.', group: 'response' },
  { id: 'forecast.summary', label: 'Conditions summary', unit: '', description: 'Short human-readable forecast summary.', group: 'response' },
];

export type WeatherCapabilityManifest = {
  schema: typeof WEATHER_SCHEMA_ID;
  availableFields: string[];
};

export function validateWeatherCapabilities(value: unknown): WeatherCapabilityManifest {
  if (!value || typeof value !== 'object') throw new Error('Capability manifest must be an object');
  const manifest = value as Partial<WeatherCapabilityManifest>;
  if (manifest.schema !== WEATHER_SCHEMA_ID) throw new Error(`Expected capability schema ${WEATHER_SCHEMA_ID}`);
  if (!Array.isArray(manifest.availableFields) || manifest.availableFields.some((id) => typeof id !== 'string')) {
    throw new Error('Capability manifest availableFields must be a string array');
  }
  const allowed = new Set(WEATHER_FIELDS.filter((f) => f.group === 'response').map((f) => f.id));
  const unknown = manifest.availableFields.filter((id) => !allowed.has(id));
  if (unknown.length) throw new Error(`Unknown weather field: ${unknown[0]}`);
  return { schema: WEATHER_SCHEMA_ID, availableFields: [...new Set(manifest.availableFields)] };
}

export function capabilitiesUrl(endpoint: string): string {
  const url = new URL(endpoint);
  url.username = '';
  url.password = '';
  const parts = url.pathname.split('/');
  if (parts.at(-1) === 'forecast') parts[parts.length - 1] = 'capabilities';
  else parts.push('capabilities');
  url.pathname = parts.join('/').replace(/\/+/g, '/');
  url.search = '';
  url.hash = '';
  return url.toString();
}
