import { loadConfig } from '@tb/config';
import { createApp } from './providers.ts';
import { minimaxBackend, ollamaBackend } from './backends.ts';
import { createWeatherDemoApp, WEATHER_DEMO_PROFILES } from './weather-demo.ts';
import { createRegistryClient } from '@tb/registry-client';

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

if (process.env.WEATHER_DEMO === '1') {
  const registry = createRegistryClient(cfg);
  for (const profile of WEATHER_DEMO_PROFILES) {
    createWeatherDemoApp(profile, { paymentsMode: cfg.paymentsMode, payTo: cfg.keys[profile.role].public, registry })
      .listen(profile.port, () => console.log(`[weather-demo] ${profile.id} listening on :${profile.port} (payments: ${cfg.paymentsMode})`));
  }
}
