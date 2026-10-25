// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WeatherTryItPanel } from '../components/WeatherTryItPanel.tsx';
import type { ApiListing } from '../lib/types.ts';

afterEach(cleanup);

it('identifies the selected listing when paying a shared weather endpoint', async () => {
  const listing: ApiListing = { id: 'selected-weather', provider: 'GOWNER', name: 'Weather', endpoint: 'http://localhost:4003/weather/v1/forecast', claimedModel: 'api:weather@1', priceAtomic: '50000', stakeAtomic: '50000000', active: true };
  const pay = vi.fn(async (_url: string, _init?: RequestInit) => Object.assign(Response.json({ schema: 'api:weather@1', availableFields: ['forecast.temperatureC'], location: {}, forecast: { temperatureC: 18 } }), { payment: { txHash: 'settled-tx' } }));
  render(<WeatherTryItPanel listing={listing} pay={pay} onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '38.7223' } });
  fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '-9.1393' } });
  fireEvent.click(screen.getByRole('button', { name: /Pay \$0.005/ }));
  expect(await screen.findByRole('link', { name: /Paid \$0.005/ })).toBeTruthy();
  expect(new Headers(pay.mock.calls[0][1]?.headers).get('x-tb-listing-id')).toBe(listing.id);
});
