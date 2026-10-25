// Prints XLM/USDC balances per role and checks Ollama + MiniMax are reachable.
import { loadConfig, ROLES } from '@tb/config';

const cfg = loadConfig();
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

for (const role of ROLES) {
  const addr = cfg.keys[role].public;
  const res = await fetch(`${cfg.horizonUrl}/accounts/${addr}`);
  if (!res.ok) { console.log(`${role.padEnd(10)} ${addr}  NOT FOUND`); continue; }
  const acct = (await res.json()) as { balances: { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string }[] };
  const xlm = acct.balances.find((b) => b.asset_type === 'native')?.balance ?? '0';
  const usdc = acct.balances.find((b) => b.asset_code === 'USDC' && b.asset_issuer === USDC_ISSUER);
  console.log(`${role.padEnd(10)} ${addr}  XLM ${Number(xlm).toFixed(1).padStart(8)}  USDC ${usdc ? usdc.balance : 'no trustline'}`);
}

const tags = (await (await fetch(`${cfg.ollamaUrl}/api/tags`)).json()) as { models: { name: string }[] };
const have = tags.models.map((m) => m.name);
for (const m of ['llama3.2:3b', 'qwen2.5:0.5b', 'nomic-embed-text:latest']) {
  console.log(`ollama ${m}: ${have.includes(m) ? 'ok' : 'MISSING'}`);
}

if (!cfg.minimaxApiKey) {
  console.log('minimax: MINIMAX_API_KEY not set');
} else {
  const r = await fetch(`${cfg.minimaxBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.minimaxApiKey}` },
    body: JSON.stringify({ model: cfg.minimaxModel, messages: [{ role: 'user', content: 'Say OK.' }], max_tokens: 20 }),
  });
  const body = await r.text();
  console.log(`minimax ${cfg.minimaxModel}: HTTP ${r.status} ${body.slice(0, 200)}`);
}
