import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createWeatherDemoApp, WEATHER_DEMO_PROFILES } from '../src/weather-demo.ts';

const valueAt = (body: Record<string, any>, id: string) => {
  const [group, field] = id.split('.');
  return body[group]?.[field];
};

describe('weather demo APIs', () => {
  it('offers three providers with different declared response fields', () => {
    expect(WEATHER_DEMO_PROFILES).toHaveLength(3);
    expect(new Set(WEATHER_DEMO_PROFILES.map((profile) => profile.availableFields.join(','))).size).toBe(3);
  });

  for (const profile of WEATHER_DEMO_PROFILES) {
    it(`${profile.id} publishes its public capabilities and returns only those fields behind x402`, async () => {
      const app = createWeatherDemoApp(profile, { paymentsMode: 'simulated', payTo: 'GDEMO' });
      const capabilities = await request(app).get('/weather/v1/capabilities');
      expect(capabilities.status).toBe(200);
      expect(capabilities.body).toEqual({ schema: 'api:weather@1', availableFields: profile.availableFields });

      const unpaid = await request(app).post('/weather/v1/forecast').send({ latitude: 38.7, longitude: -9.1 });
      expect(unpaid.status).toBe(402);

      const paid = await request(app).post('/weather/v1/forecast').set('X-Simulated-Payment', 'GAGENT').send({ latitude: 38.7, longitude: -9.1, forecastHours: 3 });
      expect(paid.status).toBe(200);
      expect(paid.body.schema).toBe('api:weather@1');
      expect(paid.body.availableFields).toEqual(profile.availableFields);
      for (const id of profile.availableFields) expect(valueAt(paid.body, id)).not.toBeUndefined();
    });
  }

  it('lets browsers send real x402 payment headers and read the settlement', async () => {
    const app = createWeatherDemoApp(WEATHER_DEMO_PROFILES[0], { paymentsMode: 'simulated', payTo: 'GDEMO' });
    const pre = await request(app)
      .options('/weather/v1/forecast')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'access-control-expose-headers,content-type,payment-signature');
    const allowed = pre.headers['access-control-allow-headers'].toLowerCase().split(/\s*,\s*/);
    for (const h of ['access-control-expose-headers', 'content-type', 'payment-signature', 'x-payment']) expect(allowed).toContain(h);
    expect(pre.headers['access-control-expose-headers']).toMatch(/payment-response/i);
  });

  it('each profile is paid to its own real testnet identity (a config role)', () => {
    expect(WEATHER_DEMO_PROFILES.map((p) => p.role)).toEqual(['weatherAtlas', 'weatherThermo', 'weatherRainwind']);
  });
});
