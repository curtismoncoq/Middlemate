/**
 * Models the auditor can verify: each has a reference it can query. Single source of truth for the
 * auditor's references, the listing form's dropdown, the agent's filter and the catalog's warnings.
 * Adding a model = one entry here (plus its reference backend, e.g. an API key).
 */
export type VerifiableModel = {
  id: string;
  label: string;
  reference: { kind: 'minimax' } | { kind: 'ollama'; model: string };
};

export function verifiableModels(minimaxModel: string): VerifiableModel[] {
  return [
    { id: minimaxModel, label: minimaxModel.replace(/-/g, ' '), reference: { kind: 'minimax' } },
    { id: 'llama3.2:3b', label: 'Llama 3.2 3B', reference: { kind: 'ollama', model: 'llama3.2:3b' } },
    { id: 'qwen2.5:0.5b', label: 'Qwen 2.5 0.5B', reference: { kind: 'ollama', model: 'qwen2.5:0.5b' } },
  ];
}

export const isVerifiable = (id: string, models: VerifiableModel[]) => models.some((m) => m.id === id);
