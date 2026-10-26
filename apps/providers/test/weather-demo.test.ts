import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createWeatherDemoApp, WEATHER_DEMO_PROFILES } from '../src/weather-demo.ts';

const reference = async (request: { latitude: number; longitude: number; forecastHours: number }) => ({
  location: { latitude: request.latitude, longitude: request.longitude },
  forecast: { validAt: '2026-10-25T20:00:00Z', updatedAt: '2026-10-25T19:00:00Z', temperatureC: 18, apparentTemperatureC: 17, humidityPct: 60, windSpeedKmh: 12, windDirectionDeg: 220, cloudCoverPct: 30, pressureHpa: 1015, precipitationMm: 0.2, symbolCode: 'partlycloudy_day' },
});

const valueAt = (body: Record<string, any>, id: string) => {
  const [group, field] = id.split('.');
  return body[group]?.[field];
};

describe('weather demo APIs', () => {
  it('charges the registered owner price and pays that owner when a listing is selected', async () => {
    const profile = WEATHER_DEMO_PROFILES[0];
    const listings = ['a', 'b'].map((id) => ({ id: id.repeat(64), provider: `GOWNER${id}`, name: id, endpoint: 'http://localhost:4003/weather/v1/forecast', claimedModel: 'api:weather@1', active: true, priceAtomic: 70000n, stakeAtomic: 50000000n }));
    const app = createWeatherDemoApp(profile, { paymentsMode: 'simulated', payTo: 'GDEMO', reference, registry: { list: async () => listings } });
    const response = await request(app).post('/weather/v1/forecast').set('x-tb-listing-id', listings[1].id);
    expect(response.status).toBe(402);
    expect(response.body.accepts[0]).toMatchObject({ payTo: 'GOWNERb', price: '$0.007' });
    const ambiguous = await request(app).post('/weather/v1/forecast');
    expect(ambiguous.status).toBe(400);
    listings.pop();
    const single = await request(app).post('/weather/v1/forecast');
    expect(single.body.accepts[0].payTo).toBe('GOWNERa');
  });

  it('refuses a paused, expired or unrelated listing before requesting payment', async () => {
    const profile = WEATHER_DEMO_PROFILES[0];
    for (const overrides of [{ active: false }, { exitAt: 1 }, { endpoint: 'http://localhost:4005/weather/v1/forecast' }]) {
      const listing = { id: 'a'.repeat(64), provider: 'GOWNER', name: 'Weather', endpoint: 'http://localhost:4003/weather/v1/forecast', claimedModel: 'api:weather@1', active: true, priceAtomic: 50000n, stakeAtomic: 50000000n, ...overrides };
      const app = createWeatherDemoApp(profile, { paymentsMode: 'simulated', payTo: 'GDEMO', reference, registry: { list: async () => [listing] } });
      const response = await request(app).post('/weather/v1/forecast').set('x-tb-listing-id', listing.id);
      expect(response.status).toBe(409);
      expect(response.body.accepts).toBeUndefined();
    }
  });

  it('offers exact, tolerant, dishonest and extra-field providers', () => {
    expect(WEATHER_DEMO_PROFILES).toHaveLength(4);
    expect(new Set(WEATHER_DEMO_PROFILES.map((profile) => profile.availableFields.join(','))).size).toBe(3);
    expect(WEATHER_DEMO_PROFILES.map((profile) => profile.behaviour)).toEqual(['exact', 'tolerant', 'dishonest', 'extras']);
    expect(WEATHER_DEMO_PROFILES.map((profile) => profile.priceUsd)).toEqual(['0.005', '0.005', '0.005', '0.005']);
  });

  it('keeps the tolerant demo humidity inside the valid percentage range', () => {
    const transformed = WEATHER_DEMO_PROFILES[1].transform({ location: {}, forecast: { humidityPct: 96.7, temperatureC: 18, windSpeedKmh: 12 } });
    expect(transformed.forecast.humidityPct).toBe(100);
  });

  for (const profile of WEATHER_DEMO_PROFILES) {
    it(`${profile.id} publishes its public capabilities and returns only those fields behind x402`, async () => {
      const app = createWeatherDemoApp(profile, { paymentsMode: 'simulated', payTo: 'GDEMO', reference });
      const capabilities = await request(app).get('/weather/v1/capabilities');
      expect(capabilities.status).toBe(200);
      expect(capabilities.body).toEqual({ schema: 'api:weather@1', availableFields: profile.availableFields, ...(profile.extraFields?.length ? { extraFields: profile.extraFields } : {}) });

      const unpaid = await request(app).post('/weather/v1/forecast').send({ latitude: 38.7, longitude: -9.1 });
      expect(unpaid.status).toBe(402);

      const paid = await request(app).post('/weather/v1/forecast').set('X-Simulated-Payment', 'GAGENT').send({ latitude: 38.7, longitude: -9.1, forecastHours: 3 });
      expect(paid.status).toBe(200);
      expect(paid.body.schema).toBe('api:weather@1');
      expect(paid.body.availableFields).toEqual(profile.availableFields);
      for (const id of profile.availableFields) expect(valueAt(paid.body, id)).not.toBeUndefined();
      if (profile.extraFields?.length) expect(Object.keys(paid.body.extras)).toEqual(profile.extraFields);
    });
  }

  it('lets browsers send real x402 payment headers and read the settlement', async () => {
    const app = createWeatherDemoApp(WEATHER_DEMO_PROFILES[0], { paymentsMode: 'simulated', payTo: 'GDEMO', reference });
    const pre = await request(app)
      .options('/weather/v1/forecast')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'access-control-expose-headers,content-type,payment-signature');
    const allowed = pre.headers['access-control-allow-headers'].toLowerCase().split(/\s*,\s*/);
    for (const h of ['access-control-expose-headers', 'content-type', 'payment-signature', 'x-payment', 'x-tb-listing-id']) expect(allowed).toContain(h);
    expect(pre.headers['access-control-expose-headers']).toMatch(/payment-response/i);
  });

  it('each profile is paid to its own real testnet identity (a config role)', () => {
    expect(WEATHER_DEMO_PROFILES.map((p) => p.role)).toEqual(['weatherAtlas', 'weatherThermo', 'weatherRainwind', 'weatherAtlas']);
  });
});
