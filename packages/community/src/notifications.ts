import type { Decision, Report, Review } from './types.ts';

// Each review revision is a distinct event. Opening a tab never acknowledges it.
export function providerEventKeys(wallet: string, reviews: Review[], reports: Report[], decisions: Decision[]): string[] {
  return [
    ...reviews.filter(row=>row.provider===wallet&&row.buyer!==wallet).map(row=>`review:${row.id}:${row.updated_at}`),
    ...reports.filter(row=>row.provider===wallet).map(row=>`report:${row.id}:${row.created_at}`),
    ...decisions.filter(row=>row.provider===wallet&&row.status==='completed').map(row=>`decision:${row.id}:${row.created_at}`),
  ];
}
