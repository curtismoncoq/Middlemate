import type { Role } from './index.ts';

export type SeedListing = {
  slug: 'minimax-a' | 'llama-b' | 'cheapmax';
  name: string;
  /** what the listing claims to serve */
  claimedModel: string;
  /** what it actually serves (secret for the cheater) */
  servedBy: { kind: 'minimax' } | { kind: 'ollama'; model: string };
  priceUsd: number;
  role: Extract<Role, 'providerA' | 'providerB' | 'cheapmax'>;
};

export function seedListings(minimaxModel: string): SeedListing[] {
  return [
    { slug: 'minimax-a', name: 'Provider A', claimedModel: minimaxModel, servedBy: { kind: 'minimax' }, priceUsd: 0.02, role: 'providerA' },
    { slug: 'llama-b', name: 'Provider B', claimedModel: 'llama3.2:3b', servedBy: { kind: 'ollama', model: 'llama3.2:3b' }, priceUsd: 0.004, role: 'providerB' },
    { slug: 'cheapmax', name: 'CheapMax', claimedModel: minimaxModel, servedBy: { kind: 'ollama', model: 'qwen2.5:0.5b' }, priceUsd: 0.012, role: 'cheapmax' },
  ];
}

export const endpointFor = (port: number, slug: string) => `http://localhost:${port}/${slug}/v1/chat/completions`;
