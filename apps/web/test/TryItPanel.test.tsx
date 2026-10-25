// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { TryItPanel } from '../components/TryItPanel.tsx';
import type { ApiListing } from '../lib/types.ts';

afterEach(cleanup);

const listing: ApiListing = {
  provider: 'GB', name: 'Provider B', endpoint: 'http://localhost:4001/llama-b/v1/chat/completions',
  claimedModel: 'llama3.2:3b', priceAtomic: '40000', stakeAtomic: '50000000', active: true,
};

const ok = async () => {
  const r = new Response(JSON.stringify({ choices: [{ message: { content: 'Stellar is a payments network.' } }] }), { status: 200 }) as Response & { payment?: { txHash: string } };
  r.payment = { txHash: 'deadbeef' };
  return r;
};

function send(text: string) {
  fireEvent.change(screen.getByPlaceholderText(/Ask Provider B/), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Pay \$0.004 & send/ }));
}

describe('TryItPanel', () => {
  it('shows the answer and the payment tx link after a paid message', async () => {
    render(<TryItPanel listing={listing} pay={ok} onClose={() => {}} />);
    send('What is Stellar?');
    await waitFor(() => expect(screen.getByText('Stellar is a payments network.')).toBeTruthy());
    expect(screen.getByRole('link', { name: /paid \$0.004/ }).getAttribute('href')).toBe('https://stellar.expert/explorer/testnet/tx/deadbeef');
  });

  it('shows the error, no answer, and keeps the draft when payment fails', async () => {
    const fail = async () => { throw new Error('auth entry expired'); };
    render(<TryItPanel listing={listing} pay={fail} onClose={() => {}} />);
    send('What is Stellar?');
    await waitFor(() => expect(screen.getByText(/Payment failed: auth entry expired/)).toBeTruthy());
    expect(screen.queryByText('Stellar is a payments network.')).toBeNull();
    expect((screen.getByPlaceholderText(/Ask Provider B/) as HTMLTextAreaElement).value).toBe('What is Stellar?');
  });

  it('treats a non-2xx response as a failed payment', async () => {
    const r402 = async () => new Response('{"error":"payment required"}', { status: 402 });
    render(<TryItPanel listing={listing} pay={r402} onClose={() => {}} />);
    send('hi');
    await waitFor(() => expect(screen.getByText(/Payment failed: HTTP 402/)).toBeTruthy());
  });
});
