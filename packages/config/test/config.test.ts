import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/index.ts';

const env = {
  TB_ADMIN_PUBLIC: 'GADMIN', TB_ADMIN_SECRET: 'SADMIN',
  TB_AUDITOR_PUBLIC: 'GAUD', TB_AUDITOR_SECRET: 'SAUD',
};

describe('loadConfig', () => {
  it('applies testnet defaults', () => {
    const c = loadConfig(env);
    expect(c.network).toBe('stellar:testnet');
    expect(c.facilitatorUrl).toBe('https://channels.openzeppelin.com/x402/testnet');
    expect(c.usdcContract).toBe('CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA');
    expect(c.registryMode).toBe('onchain');
    expect(c.paymentsMode).toBe('real');
    expect(c.stakeUsdc).toBe(10);
    expect([c.providersPort, c.auditorPort, c.webPort]).toEqual([4001, 4002, 3000]);
  });

  it('reads role keys from TB_<ROLE>_PUBLIC/SECRET', () => {
    const c = loadConfig(env);
    expect(c.keys.auditor).toEqual({ public: 'GAUD', secret: 'SAUD' });
  });

  it('throws a clear error when a requested key is missing', () => {
    const c = loadConfig(env);
    expect(() => c.keys.agent.secret).toThrow(/TB_AGENT_SECRET/);
  });

  it('rejects an invalid REGISTRY_MODE', () => {
    expect(() => loadConfig({ ...env, REGISTRY_MODE: 'foo' })).toThrow(/REGISTRY_MODE/);
  });
});
