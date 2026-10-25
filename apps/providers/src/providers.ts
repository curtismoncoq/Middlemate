import express, { type Express } from 'express';
import { seedListings, type Config, type SeedListing } from '@tb/config';
import { paywall } from './paywall.ts';
import type { Backend, ChatMessage } from './backends.ts';
import { mountWeatherProvider, type WeatherProviderOptions } from './weather.ts';

export type BackendFactory = { minimax: Backend; ollama: (model: string) => Backend };

type AppOpts = {
  paymentsMode: Config['paymentsMode'];
  minimaxModel: string;
  payTo: (role: SeedListing['role']) => string;
  backends: BackendFactory;
  weather?: WeatherProviderOptions;
};

/** One Express app serving every seed listing at POST /<slug>/v1/chat/completions behind x402. */
export function createApp(opts: AppOpts): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  // Browser buyers (the web app's Try it) call providers cross-origin and must read the x402 headers.
  app.use((req, res, next) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type, payment-signature, x-payment, x-simulated-payment, access-control-expose-headers');
    res.setHeader('access-control-expose-headers', 'payment-required, payment-response, x-payment-response');
    if (req.method === 'OPTIONS') {
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.status(204).end();
      return;
    }
    next();
  });

  for (const l of seedListings(opts.minimaxModel)) {
    const route = `/${l.slug}/v1/chat/completions`;
    const backend = l.servedBy.kind === 'minimax' ? opts.backends.minimax : opts.backends.ollama(l.servedBy.model);
    const recipient = opts.payTo(l.role);
    app.post(route, paywall(route, `$${l.priceUsd}`, recipient, { paymentsMode: opts.paymentsMode }), async (req, res) => {
      const messages = req.body?.messages as ChatMessage[] | undefined;
      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'body must include a non-empty messages array' });
        return;
      }
      try {
        const content = await backend(messages, { temperature: req.body.temperature });
        // Every listing reports its *claimed* model — the cheater lies here too.
        res.json({ id: `tb-${Date.now()}`, object: 'chat.completion', model: l.claimedModel, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] });
      } catch (err) {
        res.status(502).json({ error: `upstream model failed: ${(err as Error).message}` });
      }
    });
  }
  if (opts.weather) mountWeatherProvider(app, opts.weather);
  return app;
}
