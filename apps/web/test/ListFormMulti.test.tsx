// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WEATHER_FIELDS, WEATHER_SCHEMA_ID } from '@tb/weather-contract';
import { ListForm } from '../components/ListForm.tsx';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../components/WalletContext.tsx', () => ({ useWallet: () => ({ address: 'GOWNER' }) }));
vi.mock('../lib/wallet.ts', () => ({ signTransaction: vi.fn(async () => 'signed') }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('registers two separately named weather endpoints with one wallet and atomic stakes', async () => {
  const built: { publicKey: string; call: { method: string; args: { id: string; name: string; endpoint: string; amountAtomic: string } } }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('capabilities')) return Response.json({ schema: WEATHER_SCHEMA_ID, availableFields: WEATHER_FIELDS.filter((f) => f.group === 'response').map((f) => f.id) });
    const body = JSON.parse(String(init?.body));
    if (body.action === 'build') { built.push(body); return Response.json({ xdr: 'unsigned' }); }
    return Response.json({ hash: 'confirmed' });
  }));
  render(<ListForm models={[{ id: 'MiniMax-M2.7', label: 'MiniMax' }]} />);
  fireEvent.click(screen.getByLabelText('Weather API'));
  fireEvent.click(screen.getByRole('button', { name: 'Select all fields' }));
  for (const [name, host] of [['Weather by Mat', 'one'], ['Mat rain', 'two']]) {
    fireEvent.change(screen.getByLabelText('Listing name'), { target: { value: name } });
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: `https://${host}.example/weather/v1/forecast` } });
    fireEvent.click(screen.getByRole('button', { name: 'Register & stake' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Register & stake' })).toBeTruthy());
  }
  expect(built).toHaveLength(2);
  expect(built.map((call) => call.publicKey)).toEqual(['GOWNER', 'GOWNER']);
  expect(built.map((call) => call.call.args.name)).toEqual(['Weather by Mat', 'Mat rain']);
  expect(built[0].call.args.id).not.toBe(built[1].call.args.id);
  expect(built.every((call) => call.call.method === 'registerEndpoint' && call.call.args.amountAtomic === '50000000')).toBe(true);
});
