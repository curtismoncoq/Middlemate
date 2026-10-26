import { describe, expect, it, vi } from 'vitest';
import type { Listing } from '@tb/registry-client';
import { WEATHER_SCHEMA_ID } from '@tb/weather-contract';
import { createRunner, memoryStore } from '../src/runner.ts';
import { auditWeatherListing, compareWeatherField, type WeatherAuditProbe } from '../src/weather-audit.ts';
import { WEATHER_DEMO_PROFILES } from '../../providers/src/weather-demo.ts';

const probes: WeatherAuditProbe[] = [1, 2, 3, 4, 5].map((forecastHours, index) => ({
  id: `weather-${index + 1}`, latitude: 38.7 + index, longitude: -9.1 + index, forecastHours,
}));
const listing: Listing = {
  id: 'aa'.repeat(32), provider: 'GOWNER', name: 'Weather liar', endpoint: 'http://weather.test/weather/v1/forecast',
  claimedModel: WEATHER_SCHEMA_ID, priceAtomic: 10000n, stakeAtomic: 50000000n, active: true,
};
const base = (request: { latitude: number; longitude: number; forecastHours: number }) => ({
  location: { latitude: request.latitude, longitude: request.longitude },
  forecast: {
    validAt: '2026-10-25T20:00:00Z', updatedAt: '2026-10-25T19:00:00Z', temperatureC: 18,
    apparentTemperatureC: 17.5, humidityPct: 60, windSpeedKmh: 12, windDirectionDeg: 220,
    cloudCoverPct: 30, pressureHpa: 1015, precipitationMm: 0.2, symbolCode: 'partlycloudy_day',
  },
});
const fields = ['location.latitude', 'location.longitude', 'forecast.validAt', 'forecast.temperatureC', 'forecast.humidityPct', 'forecast.windSpeedKmh', 'forecast.pressureHpa'];

function setup(mutate: (data: ReturnType<typeof base>) => ReturnType<typeof base>, failReference = false) {
  const registry = {
    list: vi.fn(async () => [listing]),
    slash: vi.fn(), pauseListing: vi.fn(),
    slashEndpoint: vi.fn(async () => ({ hash: 'slash', amountAtomic: 50000000n })),
    pauseEndpoint: vi.fn(async () => ({ hash: 'pause' })),
  };
  const pay = vi.fn(async (_url: string | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    const response = mutate(base(request));
    const result = new Response(JSON.stringify({ schema: WEATHER_SCHEMA_ID, availableFields: fields, extraFields: ['pollenRisk'], ...response, extras: { pollenRisk: 'low' } }), { status: 200 }) as import('@tb/x402-client').PaidResponse;
    result.payment = { txHash: 'paid', payer: 'GAUDITOR' };
    return result;
  });
  const store = memoryStore();
  const runner = createRunner({
    registry, auditorSecret: 'SAUDITOR', pay, store,
    references: async () => ({}), embed: async () => [], referenceModels: ['MiniMax-M2.7'],
    weather: {
      probes,
      capabilities: async () => ({ schema: WEATHER_SCHEMA_ID, availableFields: fields, extraFields: ['pollenRisk'] }),
      reference: async (request) => {
        if (failReference) throw new Error('MET Norway unavailable');
        return base(request);
      },
    },
  });
  return { runner, registry, pay, store };
}

describe('weather audit warnings and slashing', () => {
  it('gives the actual demo profiles distinct grades while leaving extras out of the score', async () => {
    const scores: number[] = [];
    const passes: boolean[] = [];
    for (const profile of WEATHER_DEMO_PROFILES) {
      const manifest = { schema: WEATHER_SCHEMA_ID, availableFields: profile.availableFields, extraFields: profile.extraFields };
      const result = await auditWeatherListing(listing, {
        probes, capabilities: async () => manifest, reference: async (request) => base(request),
        pay: async (_url, init) => Response.json({ ...manifest, ...profile.transform(base(JSON.parse(String(init?.body)))) }),
      });
      scores.push(result.verdict.score);
      passes.push(result.verdict.pass);
    }
    expect(scores[0]).toBe(100);
    expect(scores[1]).toBeGreaterThanOrEqual(80);
    expect(scores[1]).toBeLessThan(100);
    expect(scores[2]).toBeLessThan(80);
    expect(scores[3]).toBe(100);
    expect(passes).toEqual([true, true, false, true]);
  });
  it('passes exact and small in-tolerance deviations while ignoring extra fields', async () => {
    const { runner, registry, pay } = setup((data) => ({ ...data, forecast: { ...data.forecast, temperatureC: 19, humidityPct: 67, windSpeedKmh: 17 } }));
    const [record] = await runner.runAudit();
    expect(record.verdict).toMatchObject({ pass: true, inconclusive: false, scored: 5, matchedModel: 'MET Norway' });
    expect(record.weather?.extraFields).toEqual(['pollenRisk']);
    expect(record.weather?.probes[0].fields.every((field) => field.pass)).toBe(true);
    expect(record.verdict.score).toBeGreaterThanOrEqual(80);
    expect(record.verdict.score).toBeLessThan(100);
    expect(registry.slashEndpoint).not.toHaveBeenCalled();
    expect(new Headers(pay.mock.calls[0][1]?.headers).get('x-tb-listing-id')).toBe(listing.id);
  });

  it('reserves a perfect score for identical values and lowers the score as deviations grow', async () => {
    const exact = await setup((data) => data).runner.runAudit();
    const small = await setup((data) => ({ ...data, forecast: { ...data.forecast, temperatureC: 19 } })).runner.runAudit();
    const larger = await setup((data) => ({ ...data, forecast: { ...data.forecast, temperatureC: 20 } })).runner.runAudit();
    expect(exact[0].verdict.score).toBe(100);
    expect(small[0].verdict.score).toBeLessThan(100);
    expect(larger[0].verdict.score).toBeLessThan(small[0].verdict.score);
    expect(larger[0].verdict.pass).toBe(true);
  });

  it('rejects impossible percentages and wind directions even if their delta is small', () => {
    expect(compareWeatherField('forecast.humidityPct', 103.7, 96.7)).toMatchObject({ pass: false, score: 0, reason: expect.stringContaining('range') });
    expect(compareWeatherField('forecast.humidityPct', -1, 1)).toMatchObject({ pass: false, score: 0 });
    expect(compareWeatherField('forecast.windDirectionDeg', 720, 0)).toMatchObject({ pass: false, score: 0 });
    expect(compareWeatherField('forecast.windDirectionDeg', 359, 1)).toMatchObject({ pass: true, delta: 2 });
  });

  it('keeps repeated weather disagreement informational without automatic warnings or slashing', async () => {
    const { runner, registry, store } = setup((data) => ({ ...data, forecast: { ...data.forecast, temperatureC: 45, humidityPct: 5, windSpeedKmh: 90, pressureHpa: 950 } }));
    const [one] = await runner.runAudit();
    const [two] = await runner.runAudit();
    const [three] = await runner.runAudit();
    expect(one.warning).toBeUndefined();
    expect(two.warning).toBeUndefined();
    expect(three.warning).toBeUndefined();
    expect(one.slashTx).toBeUndefined();
    expect(two.slashTx).toBeUndefined();
    expect(three.slashTx).toBeUndefined();
    expect(registry.slashEndpoint).not.toHaveBeenCalled();
    expect(registry.pauseEndpoint).not.toHaveBeenCalled();
    expect(store.all()).toHaveLength(3);
  });

  it('retries and excludes unavailable MET Norway references without warning or slash', async () => {
    const { runner, registry } = setup((data) => data, true);
    const [record] = await runner.runAudit();
    expect(record.verdict).toMatchObject({ pass: true, inconclusive: true, scored: 0 });
    expect(record.warning).toBeUndefined();
    expect(registry.slashEndpoint).not.toHaveBeenCalled();
  });

  it('does not spend on MET Norway outages or listings that declare only extra fields', async () => {
    const outage = setup((data) => data, true);
    const [outageRecord] = await outage.runner.runAudit();
    expect(outage.pay).not.toHaveBeenCalled();
    expect(outageRecord.verdict.inconclusive).toBe(true);

    const extrasOnly = setup((data) => data);
    const runner = createRunner({
      registry: { list: async () => [listing], slash: async () => ({ hash: 'slash', amountAtomic: 0n }), pauseListing: async () => ({ hash: 'pause' }) }, auditorSecret: 'SAUDITOR', pay: extrasOnly.pay,
      references: async () => ({}), embed: async () => [], store: memoryStore(),
      weather: {
        probes,
        capabilities: async () => ({ schema: WEATHER_SCHEMA_ID, availableFields: [], extraFields: ['pollenRisk'] }),
        reference: async (request) => base(request),
      },
    });
    const [extrasRecord] = await runner.runAudit();
    expect(extrasOnly.pay).not.toHaveBeenCalled();
    expect(extrasRecord.verdict.inconclusive).toBe(true);
    expect(extrasRecord.weather?.extraFields).toEqual(['pollenRisk']);
  });

  it('scores malformed paid forecast payloads as contradictions with dashboard evidence', async () => {
    const { runner, pay } = setup((data) => data);
    pay.mockImplementation(async () => {
      const response = new Response('{bad json', { status: 200 }) as import('@tb/x402-client').PaidResponse;
      response.payment = { txHash: 'paid-malformed', payer: 'GAUDITOR' };
      return response;
    });
    const [record] = await runner.runAudit();
    expect(record.verdict).toMatchObject({ pass: false, inconclusive: false, scored: 5 });
    expect(record.weather?.probes[0]).toMatchObject({ status: 'ok', error: expect.stringContaining('invalid provider JSON') });
    expect(record.weather?.probes[0].fields.every((field) => !field.pass)).toBe(true);
  });
});
