import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/providers.ts';
import { stripThinking } from '../src/backends.ts';

const fakeBackends = {
  minimax: async () => 'minimax says hi',
  ollama: (model: string) => async () => `${model} says hi`,
};

const app = () =>
  createApp({ paymentsMode: 'simulated', minimaxModel: 'MiniMax-M2.7', payTo: () => 'GPAYTO', backends: fakeBackends });

const chat = { messages: [{ role: 'user', content: 'hello' }] };

describe('providers', () => {
  it('cheapmax claims MiniMax but serves qwen', async () => {
    const r = await request(app()).post('/cheapmax/v1/chat/completions').set('X-Simulated-Payment', 'GBUYER').send(chat);
    expect(r.status).toBe(200);
    expect(r.body.model).toBe('MiniMax-M2.7');
    expect(r.body.choices[0].message.content).toBe('qwen2.5:0.5b says hi');
  });

  it('provider A serves MiniMax', async () => {
    const r = await request(app()).post('/minimax-a/v1/chat/completions').set('X-Simulated-Payment', 'GBUYER').send(chat);
    expect(r.body.choices[0].message.content).toBe('minimax says hi');
  });

  it('requires payment', async () => {
    const r = await request(app()).post('/llama-b/v1/chat/completions').send(chat);
    expect(r.status).toBe(402);
  });

  it('rejects a body without messages', async () => {
    const r = await request(app()).post('/llama-b/v1/chat/completions').set('X-Simulated-Payment', 'GBUYER').send({});
    expect(r.status).toBe(400);
  });
});

describe('CORS for browser buyers', () => {
  it('answers preflight allowing the x402 payment headers', async () => {
    const r = await request(app()).options('/llama-b/v1/chat/completions').set('Origin', 'http://localhost:3000').set('Access-Control-Request-Method', 'POST');
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe('*');
    expect(r.headers['access-control-allow-headers']).toMatch(/payment-signature/i);
  });

  it('exposes the settlement header to the browser', async () => {
    const r = await request(app()).post('/llama-b/v1/chat/completions').set('X-Simulated-Payment', 'GBUYER').send(chat);
    expect(r.headers['access-control-expose-headers']).toMatch(/payment-response/i);
  });
});

describe('stripThinking', () => {
  it('removes <think> blocks and trims', () => {
    expect(stripThinking('<think>We need answer OK.</think>\n\nOK')).toBe('OK');
  });
  it('drops an unterminated think block', () => {
    expect(stripThinking('<think>\nstill thinking')).toBe('');
  });
});
