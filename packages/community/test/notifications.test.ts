import { expect, it } from 'vitest';
import { providerEventKeys } from '../src/notifications.ts';
import type { Review, Report, Decision } from '../src/types.ts';
it('counts only provider events, and treats an edited review as a new event',()=>{
  const reviews=[{id:'one',provider:'owner',buyer:'buyer',updated_at:'first'},{id:'other',provider:'someone',buyer:'owner',updated_at:'first'}] as Review[];
  const reports=[{id:'case',provider:'owner',created_at:'now'}] as Report[];
  const decisions=[{id:'done',provider:'owner',status:'completed',created_at:'now'},{id:'pending',provider:'owner',status:'prepared'}] as Decision[];
  const keys=providerEventKeys('owner',reviews,reports,decisions);
  expect(keys).toEqual(['review:one:first','report:case:now','decision:done:now']);
  const read=new Set(keys);
  expect(providerEventKeys('owner',reviews,reports,decisions).filter(key=>!read.has(key))).toEqual([]);
  reviews[0].updated_at='later';
  expect(providerEventKeys('owner',reviews,reports,decisions).filter(key=>!read.has(key))).toEqual(['review:one:later']);
});
