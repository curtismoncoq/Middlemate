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
});
