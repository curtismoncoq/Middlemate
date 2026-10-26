// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WEATHER_FIELDS, WEATHER_SCHEMA_ID } from '@tb/weather-contract';
import { ListForm } from '../components/ListForm.tsx';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../components/WalletContext.tsx', () => ({ useWallet: () => ({ address: 'GOWNER' }) }));
vi.mock('../lib/wallet.ts', () => ({ signTransaction: vi.fn(async () => 'signed') }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const PAY = { network: 'stellar:testnet', asset: 'CUSDC' };
/** An x402 endpoint's answer to an unpaid request: 402 with its price. */
const quote = (amount: string) => new Response('{}', { status: 402, headers: { 'payment-required': btoa(JSON.stringify({ x402Version: 2, accepts: [{ ...PAY, amount, payTo: 'GPAYEE' }] })) } });
const priceShown = () => waitFor(() => expect(screen.getByText(/read from your endpoint/)).toBeTruthy());

it('registers two separately named weather endpoints with one wallet and atomic stakes', async () => {
  const built: { publicKey: string; call: { method: string; args: { id: string; name: string; endpoint: string; amountAtomic: string } } }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (!url.startsWith('/api/') && !url.includes('capabilities')) return quote('100000');
    if (url.includes('capabilities')) return Response.json({ schema: WEATHER_SCHEMA_ID, availableFields: WEATHER_FIELDS.filter((f) => f.group === 'response').map((f) => f.id) });
    const body = JSON.parse(String(init?.body));
    if (body.action === 'build') { built.push(body); return Response.json({ xdr: 'unsigned' }); }
    return Response.json({ hash: 'confirmed' });
  }));
  render(<ListForm models={[{ id: 'MiniMax-M2.7', label: 'MiniMax' }]} payment={PAY} />);
  fireEvent.click(screen.getByLabelText('Weather API'));
  fireEvent.click(screen.getByRole('button', { name: 'Select all fields' }));
  for (const [name, host] of [['Weather by Mat', 'one'], ['Mat rain', 'two']]) {
    fireEvent.change(screen.getByLabelText('Listing name'), { target: { value: name } });
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: `https://${host}.example/weather/v1/forecast` } });
    await priceShown();
    fireEvent.click(screen.getByRole('button', { name: 'Register & stake' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Register & stake' })).toBeTruthy());
  }
  expect(built).toHaveLength(2);
  expect(built.map((call) => call.publicKey)).toEqual(['GOWNER', 'GOWNER']);
  expect(built.map((call) => call.call.args.name)).toEqual(['Weather by Mat', 'Mat rain']);
  expect(built[0].call.args.id).not.toBe(built[1].call.args.id);
  expect(built.every((call) => call.call.method === 'registerEndpoint' && call.call.args.amountAtomic === '50000000')).toBe(true);
});

it('checks free-form extra fields against the public manifest', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('capabilities')) return Response.json({ schema: WEATHER_SCHEMA_ID, availableFields: [], extraFields: ['pollenRisk'] });
    if (!url.startsWith('/api/')) return quote('100000');
    const body = JSON.parse(String(init?.body));
    return Response.json(body.action === 'build' ? { xdr: 'unsigned' } : { hash: 'confirmed' });
  }));
  render(<ListForm models={[{ id: 'MiniMax-M2.7', label: 'MiniMax' }]} payment={PAY} />);
  fireEvent.click(screen.getByLabelText('Weather API'));
  fireEvent.change(screen.getByLabelText('Listing name'), { target: { value: 'Weather plus' } });
  fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'https://extra.example/weather/v1/forecast' } });
  const temperatureToggle = screen.getByText('Air temperature').closest('label')?.querySelector('input');
  if (!temperatureToggle) throw new Error('Air temperature toggle not found');
  fireEvent.click(temperatureToggle);
  fireEvent.change(screen.getByLabelText('Additional field name'), { target: { value: 'pollenRisk' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add extra field' }));
  await priceShown();
  expect(screen.getByText('pollenRisk')).toBeTruthy();
  expect(screen.getByText(/not checked against MET Norway/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Register & stake' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Register & stake' })).toBeTruthy());
  expect(fetch).toHaveBeenCalledWith('/api/tx', expect.objectContaining({ method: 'POST' }));
});

it('switches the introduction between automatic inference audits and API community review',()=>{
 render(<ListForm models={[{id:'MiniMax-M2.7',label:'MiniMax'}]} payment={PAY}/>);
 expect(screen.getByText(/The auditor buys from you like any customer/)).toBeTruthy();
 fireEvent.click(screen.getByLabelText('Weather API'));
 expect(screen.queryByText(/The auditor buys from you like any customer/)).toBeNull();
 expect(screen.getByText(/Verified customer reviews and MET Norway comparisons provide the evidence/)).toBeTruthy();
 expect(screen.getByText(/You can respond and correct problems during the review period/)).toBeTruthy();
 fireEvent.click(screen.getByLabelText('Inference model'));
 expect(screen.getByText(/The auditor buys from you like any customer/)).toBeTruthy();
});

it('lists at the price the endpoint charges, read from its 402, not a typed one', async () => {
  const built: { call: { args: { priceAtomic: string } } }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (!url.startsWith('/api/')) return quote('120000');
    const body = JSON.parse(String(init?.body));
    if (body.action === 'build') { built.push(body); return Response.json({ xdr: 'unsigned' }); }
    return Response.json({ hash: 'confirmed' });
  }));
  render(<ListForm models={[{ id: 'claude-opus-5-5', label: 'Claude Opus 5.5' }]} payment={PAY} />);
  expect(screen.queryByLabelText(/Price per request/)).toBeNull();
  fireEvent.change(screen.getByLabelText('Listing name'), { target: { value: 'CheapClaude' } });
  fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'http://localhost:4001/cheapmax/v1/chat/completions' } });
  await priceShown();
  expect(screen.getByText(/read from your endpoint/).parentElement!.textContent).toMatch(/^\$0\.012read from your endpoint · paid to GPAY…AYEE$/);
  fireEvent.click(screen.getByRole('button', { name: 'Register & stake' }));
  await waitFor(() => expect(built).toHaveLength(1));
  expect(built[0].call.args.priceAtomic).toBe('120000');
});

it('explains an endpoint that is not paywalled and keeps submit disabled', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true })));
  render(<ListForm models={[{ id: 'llama3.2:3b', label: 'Llama' }]} payment={PAY} />);
  fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'http://localhost:9999/v1/chat/completions' } });
  await waitFor(() => expect(screen.getByText(/didn't ask for payment/)).toBeTruthy());
  expect((screen.getByRole('button', { name: 'Register & stake' }) as HTMLButtonElement).disabled).toBe(true);
});
