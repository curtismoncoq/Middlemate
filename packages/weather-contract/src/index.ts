export const WEATHER_SCHEMA_ID = 'api:weather@1' as const;
/** Optional routing metadata for shared demo hosts; real API providers may ignore it. */
export const WEATHER_LISTING_HEADER = 'x-tb-listing-id';

export type WeatherField = {
  id: string;
  label: string;
  unit: string;
  description: string;
  group: 'request' | 'response';
};

/** Normalized MET Norway Locationforecast fields; providers publish the subset they return. */
export const WEATHER_FIELDS: WeatherField[] = [
  { id: 'request.latitude', label: 'Latitude', unit: '°', description: 'Requested latitude in decimal degrees.', group: 'request' },
  { id: 'request.longitude', label: 'Longitude', unit: '°', description: 'Requested longitude in decimal degrees.', group: 'request' },
  { id: 'request.forecastHours', label: 'Forecast horizon', unit: 'hours', description: 'How far ahead the request asks for a forecast.', group: 'request' },
  { id: 'location.latitude', label: 'Resolved latitude', unit: '°', description: 'Latitude in the MET Norway GeoJSON point.', group: 'response' },
  { id: 'location.longitude', label: 'Resolved longitude', unit: '°', description: 'Longitude in the MET Norway GeoJSON point.', group: 'response' },
  { id: 'forecast.validAt', label: 'Forecast time', unit: 'UTC', description: 'UTC time of the selected MET Norway timeseries entry.', group: 'response' },
  { id: 'forecast.updatedAt', label: 'Source update time', unit: 'UTC', description: 'Time at which MET Norway updated the forecast data.', group: 'response' },
  { id: 'forecast.temperatureC', label: 'Air temperature', unit: '°C', description: 'Air temperature at 2 metres.', group: 'response' },
  { id: 'forecast.apparentTemperatureC', label: 'Apparent temperature', unit: '°C', description: 'MET Norway apparent air temperature.', group: 'response' },
  { id: 'forecast.humidityPct', label: 'Relative humidity', unit: '%', description: 'Relative humidity at 2 metres.', group: 'response' },
  { id: 'forecast.dewPointC', label: 'Dew point', unit: '°C', description: 'Dew point temperature at 2 metres.', group: 'response' },
  { id: 'forecast.precipitationMm', label: 'Precipitation next hour', unit: 'mm', description: 'Precipitation amount for the next one-hour period.', group: 'response' },
  { id: 'forecast.windSpeedKmh', label: 'Wind speed', unit: 'km/h', description: 'Wind speed at 10 metres, converted from m/s.', group: 'response' },
  { id: 'forecast.windDirectionDeg', label: 'Wind direction', unit: '°', description: 'Direction the wind comes from, clockwise from north.', group: 'response' },
  { id: 'forecast.cloudCoverPct', label: 'Total cloud cover', unit: '%', description: 'Total cloud area fraction.', group: 'response' },
  { id: 'forecast.cloudCoverLowPct', label: 'Low cloud cover', unit: '%', description: 'Cloud cover below 2,000 metres.', group: 'response' },
  { id: 'forecast.cloudCoverMediumPct', label: 'Medium cloud cover', unit: '%', description: 'Cloud cover from 2,000 to 5,000 metres.', group: 'response' },
  { id: 'forecast.cloudCoverHighPct', label: 'High cloud cover', unit: '%', description: 'Cloud cover above 5,000 metres.', group: 'response' },
  { id: 'forecast.pressureHpa', label: 'Sea-level pressure', unit: 'hPa', description: 'Air pressure at sea level.', group: 'response' },
  { id: 'forecast.uvIndexClearSky', label: 'Clear-sky UV index', unit: '', description: 'UV index assuming a cloud-free sky.', group: 'response' },
  { id: 'forecast.fogPct', label: 'Fog area fraction', unit: '%', description: 'Fraction of the surrounding area covered in fog.', group: 'response' },
  { id: 'forecast.symbolCode', label: 'Weather symbol', unit: '', description: 'MET Norway weather symbol code for the next hour.', group: 'response' },
];

export const MET_NORWAY_FIELD_IDS = WEATHER_FIELDS.filter((field) => field.group === 'response').map((field) => field.id);

export type WeatherCapabilityManifest = {
  schema: typeof WEATHER_SCHEMA_ID;
  availableFields: string[];
  /** Provider-specific fields shown to buyers but excluded from verification and slashing. */
  extraFields?: string[];
};

export function validateWeatherCapabilities(value: unknown): WeatherCapabilityManifest {
  if (!value || typeof value !== 'object') throw new Error('Capability manifest must be an object');
  const manifest = value as Partial<WeatherCapabilityManifest>;
  if (manifest.schema !== WEATHER_SCHEMA_ID) throw new Error(`Expected capability schema ${WEATHER_SCHEMA_ID}`);
  if (!Array.isArray(manifest.availableFields) || manifest.availableFields.some((id) => typeof id !== 'string')) {
    throw new Error('Capability manifest availableFields must be a string array');
  }
  const allowed = new Set(MET_NORWAY_FIELD_IDS);
  const unknown = manifest.availableFields.filter((id) => !allowed.has(id));
  if (unknown.length) throw new Error(`Unknown weather field: ${unknown[0]}`);
  if (manifest.extraFields !== undefined && (!Array.isArray(manifest.extraFields) || manifest.extraFields.some((name) => typeof name !== 'string'))) {
    throw new Error('Capability manifest extraFields must be a string array');
  }
  const extraFields = (manifest.extraFields ?? []).map((name) => name.trim());
  if (extraFields.some((name) => !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name))) {
    throw new Error('Each extra field must have a name using letters, numbers, dot, dash or underscore');
  }
  const uniqueExtras = [...new Set(extraFields)];
  if (uniqueExtras.length > 20) throw new Error('At most 20 extra weather fields may be declared');
  return {
    schema: WEATHER_SCHEMA_ID,
    availableFields: [...new Set(manifest.availableFields)],
    ...(uniqueExtras.length ? { extraFields: uniqueExtras } : {}),
  };
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

export * from './met-norway.ts';
