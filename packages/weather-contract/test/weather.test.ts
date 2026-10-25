import { describe, expect, it, vi } from 'vitest';
import {
  createMetNorwayClient,
  MET_NORWAY_FIELD_IDS,
  validateWeatherCapabilities,
  WEATHER_SCHEMA_ID,
} from '../src/index.ts';

const metPayload = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-9.1393, 38.7223, 53] },
  properties: {
    meta: { updated_at: '2026-10-25T19:17:08Z', units: {} },
    timeseries: [{
      time: '2026-10-25T20:00:00Z',
      data: {
        instant: { details: {
          air_pressure_at_sea_level: 1018.2,
          air_temperature: 17.4,
          apparent_air_temperature: 16.8,
          cloud_area_fraction: 12,
          cloud_area_fraction_high: 3,
          cloud_area_fraction_low: 8,
          cloud_area_fraction_medium: 1,
          dew_point_temperature: 10.1,
          fog_area_fraction: 0,
          relative_humidity: 62,
          ultraviolet_index_clear_sky: 0,
          wind_from_direction: 340,
          wind_speed: 4,
        } },
        next_1_hours: { summary: { symbol_code: 'clearsky_night' }, details: { precipitation_amount: 0.2 } },
      },
    }],
  },
};

describe('MET Norway weather contract', () => {
  it('offers only fields mapped from Locationforecast and validates unverified extras separately', () => {
    expect(MET_NORWAY_FIELD_IDS).toContain('forecast.apparentTemperatureC');
    expect(MET_NORWAY_FIELD_IDS).toContain('forecast.symbolCode');
    expect(MET_NORWAY_FIELD_IDS).not.toContain('location.name');
    expect(MET_NORWAY_FIELD_IDS).not.toContain('forecast.weatherCode');
    expect(validateWeatherCapabilities({
      schema: WEATHER_SCHEMA_ID,
      availableFields: ['forecast.temperatureC'],
      extraFields: ['pollenRisk', 'roadCondition'],
    })).toEqual({
      schema: WEATHER_SCHEMA_ID,
      availableFields: ['forecast.temperatureC'],
      extraFields: ['pollenRisk', 'roadCondition'],
    });
    expect(() => validateWeatherCapabilities({ schema: WEATHER_SCHEMA_ID, availableFields: [], extraFields: ['  '] })).toThrow(/extra field/i);
  });

  it('maps a real Locationforecast response into the normalized weather contract and caches it', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, _init) => new Response(JSON.stringify(metPayload), {
      status: 200,
      headers: { expires: 'Sun, 25 Oct 2026 21:00:00 GMT', 'last-modified': 'Sun, 25 Oct 2026 19:17:08 GMT' },
    }));
    const client = createMetNorwayClient({ fetch: fetcher, now: () => Date.parse('2026-10-25T19:30:00Z') });
    const first = await client.forecast({ latitude: 38.722312, longitude: -9.139312, forecastHours: 1 });
    const second = await client.forecast({ latitude: 38.722312, longitude: -9.139312, forecastHours: 1 });
    expect(first.location).toEqual({ latitude: 38.7223, longitude: -9.1393 });
    expect(first.forecast).toMatchObject({
      validAt: '2026-10-25T20:00:00Z', updatedAt: '2026-10-25T19:17:08Z', temperatureC: 17.4,
      apparentTemperatureC: 16.8, humidityPct: 62, precipitationMm: 0.2,
      windSpeedKmh: 14.4, windDirectionDeg: 340, symbolCode: 'clearsky_night',
    });
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain('lat=38.7223&lon=-9.1393');
    expect((fetcher.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'user-agent': expect.stringContaining('TrustBazaar') });
  });
});
