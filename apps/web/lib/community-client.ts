'use client';
import { signMessage } from './wallet.ts';

export async function communityJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache:'no-store', headers:{'content-type':'application/json',...init?.headers} });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body as T;
}
export const postCommunity = <T = any>(body: unknown) => communityJson<T>('/api/community',{method:'POST',body:JSON.stringify(body)});
export async function ensureCommunitySession(wallet: string) {
  const session = await communityJson<{enabled:boolean;wallet:string|null}>('/api/community?view=session');
  if (!session.enabled) throw new Error('Community features are not configured yet.');
  if (session.wallet === wallet) return;
  const challenge = await postCommunity<{id:string;message:string}>({action:'challenge',wallet});
  const signature = await signMessage(challenge.message,wallet);
  await postCommunity({action:'verify',id:challenge.id,signature});
}
export async function communityAction(wallet: string, body: unknown) {
  await ensureCommunitySession(wallet);
  const result = await postCommunity(body);
  window.dispatchEvent(new Event('community-updated'));
  return result;
}

export async function moderate(wallet: string, body: unknown) {
  const result = await communityAction(wallet,body);
  if (!result.approval) return result;
  try {
    const signature = await signMessage(result.approval.message,wallet);
    return await communityAction(wallet,{action:'execute',decisionId:result.decisionId,challengeId:result.approval.id,signature});
  } catch (error) {
    await postCommunity({action:'cancel_decision',id:result.decisionId}).catch(()=>{});
    throw error;
  }
}
