import { loadConfig } from '@tb/config';
import { createApp } from './providers.ts';
import { minimaxBackend, ollamaBackend } from './backends.ts';

const cfg = loadConfig();
if (!cfg.minimaxApiKey) throw new Error('MINIMAX_API_KEY is not set in .env');

const app = createApp({
  paymentsMode: cfg.paymentsMode,
  minimaxModel: cfg.minimaxModel,
  payTo: (role) => cfg.keys[role].public,
  backends: {
    minimax: minimaxBackend(cfg.minimaxBaseUrl, cfg.minimaxApiKey, cfg.minimaxModel),
    ollama: (model) => ollamaBackend(cfg.ollamaUrl, model),
  },
});

app.listen(cfg.providersPort, () => console.log(`[providers] listening on :${cfg.providersPort} (payments: ${cfg.paymentsMode})`));
