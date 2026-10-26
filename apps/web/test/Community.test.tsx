// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { communityAction, communityJson } from '../lib/community-client.ts';
import { CallActions, ListingCommunity } from '../components/Community.tsx';
vi.mock('../components/WalletContext.tsx',()=>({useWallet:()=>({address:'GBUYER'})}));
vi.mock('../lib/community-client.ts',()=>({communityAction:vi.fn(async()=>({})),communityJson:vi.fn(),postCommunity:vi.fn()}));
afterEach(cleanup);
it('reveals and scrolls to feedback inside the paid response panel',()=>{
  const scroll=vi.fn(); Element.prototype.scrollIntoView=scroll;
  render(<CallActions callId="paid-call"/>);
  fireEvent.click(screen.getByRole('button',{name:'Give a verified review'}));
  expect(screen.getByRole('heading',{name:'How was your experience?'})).toBeTruthy();
  expect(scroll).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
  fireEvent.click(screen.getByRole('button',{name:'Report a problem'}));
  expect(screen.getByRole('heading',{name:'Report a specific problem'})).toBeTruthy();
  expect(scroll).toHaveBeenCalledTimes(2);
});

it('submits feedback from the response panel and uses the latest paid receipt',async()=>{
  const {rerender}=render(<CallActions callId="first-call"/>);
  rerender(<CallActions callId="latest-call"/>);
  fireEvent.click(screen.getByRole('button',{name:'Give a verified review'}));
  fireEvent.click(screen.getByRole('button',{name:'Unsatisfactory'}));
  fireEvent.change(screen.getByLabelText('Public comment (optional)'),{target:{value:'Missing expected data'}});
  fireEvent.click(screen.getByRole('button',{name:'Publish review'}));
  expect(await screen.findByRole('status')).toBeTruthy();
  expect(communityAction).toHaveBeenCalledWith('GBUYER',expect.objectContaining({action:'review',callId:'latest-call',vote:-1,comment:'Missing expected data'}));
});

it('keeps catalog reputation minimal while retaining details in the workspace',async()=>{
 vi.mocked(communityJson).mockResolvedValue({positive:1,negative:2,total:3,positivePct:33.3,samples:0,responseSuccessPct:null,schemaValidPct:null,fieldsPresentPct:null,reviews:[],decisions:[]});
 const {rerender}=render(<ListingCommunity listingId="weather" compact/>);
 expect(await screen.findByLabelText('1 positive reviews')).toBeTruthy();
 expect(screen.queryByText('Details')).toBeNull();
 expect(screen.queryByText('No paid samples yet.')).toBeNull();
 rerender(<ListingCommunity listingId="weather"/>);
 expect(screen.getByText('Details')).toBeTruthy();
});
