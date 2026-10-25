import schema from '@tb/weather-contract/schema';

export const GET = () => Response.json(schema, { headers: { 'cache-control': 'public, max-age=3600' } });
