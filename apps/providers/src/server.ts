import express from 'express';
import { loadConfig } from '@tb/config';
import { paywall } from './paywall.ts';

const cfg = loadConfig();
const app = express();
app.use(express.json());

// Temporary echo route for the x402 go/no-go check (Task 2); replaced by providers in Task 5.
app.post('/echo', paywall('/echo', '$0.001', cfg.keys.providerA.public), (req, res) => {
  res.json({ echo: req.body ?? null, at: new Date().toISOString() });
});

app.listen(cfg.providersPort, () => console.log(`[providers] listening on :${cfg.providersPort} (payments: ${cfg.paymentsMode})`));
