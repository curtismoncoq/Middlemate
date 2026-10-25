import { seedListings } from './listings.ts';

/**
 * Models the auditor can verify: each has a reference it can query. Single source of truth for the
 * auditor's references, the listing form's dropdown, the agent's filter and the catalog's warnings.
 * Adding a model = one entry here (plus its reference backend, e.g. an API key).
 */
export type VerifiableModel = {
  id: string;
  label: string;
  /** `recorded`: answers to the fingerprint probes recorded once into apps/auditor/references/<file> (no live API) */
  reference: { kind: 'minimax' } | { kind: 'ollama'; model: string } | { kind: 'recorded'; file: string };
};

export function verifiableModels(minimaxModel: string): VerifiableModel[] {
  return [
    { id: minimaxModel, label: minimaxModel.replace(/-/g, ' '), reference: { kind: 'minimax' } },
    { id: 'llama3.2:3b', label: 'Llama 3.2 3B', reference: { kind: 'ollama', model: 'llama3.2:3b' } },
    { id: 'qwen2.5:0.5b', label: 'Qwen 2.5 0.5B', reference: { kind: 'ollama', model: 'qwen2.5:0.5b' } },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', reference: { kind: 'recorded', file: 'claude-opus-5-5.json' } },
  ];
}

export const isVerifiable = (id: string, models: VerifiableModel[]) => models.some((m) => m.id === id);

/** Ollama embedding model the auditor fingerprints answers with. */
export const EMBED_MODEL = 'nomic-embed-text';
/** How long Ollama keeps a model loaded after a request (its default, 5m, unloads between demo clips). */
export const OLLAMA_KEEP_ALIVE = '30m';

/** Every local Ollama model the demo touches, once each: references, seeded backends, then the embedder. */
export function ollamaModelsToWarm(minimaxModel: string): string[] {
  const refs = verifiableModels(minimaxModel).flatMap((m) => (m.reference.kind === 'ollama' ? [m.reference.model] : []));
  const served = seedListings(minimaxModel).flatMap((s) => (s.servedBy.kind === 'ollama' ? [s.servedBy.model] : []));
  return [...new Set([...refs, ...served, EMBED_MODEL])];
}
