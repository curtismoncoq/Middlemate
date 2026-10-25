import { describe, it, expect } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { createLocalFacilitator } from '../src/facilitator.ts';

describe('local facilitator', () => {
  it('advertises exact on stellar:testnet with the signer address', async () => {
    const kp = Keypair.random();
    const f = createLocalFacilitator(kp.secret());
    const s = await f.getSupported();
    expect(s.kinds).toContainEqual(expect.objectContaining({ scheme: 'exact', network: 'stellar:testnet' }));
    expect(JSON.stringify(s.signers)).toContain(kp.publicKey());
  });
});
