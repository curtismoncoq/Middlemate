// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CommunityWorkspace } from '../components/CommunityWorkspace.tsx';
import { communityAction, communityJson } from '../lib/community-client.ts';
vi.mock('../lib/community-client.ts',()=>({communityAction:vi.fn(),communityJson:vi.fn(),ensureCommunitySession:vi.fn(),moderate:vi.fn()}));
vi.mock('../components/Community.tsx',()=>({ListingCommunity:()=>null,CallActions:()=>null,ThumbIcon:()=>null,REASONS:[]}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('keeps notifications unread on opening and only acknowledges the loaded events on explicit click',async()=>{
 let read=false;
 vi.mocked(communityJson).mockImplementation(async url=>url.includes('session')?{enabled:true,wallet:'owner'}:{enabled:true,wallet:'owner',moderator:false,calls:[],reviews:[],reports:[],decisions:[],unreadKeys:read?[]:['review:1:now','report:2:now']});
 vi.mocked(communityAction).mockImplementation(async()=>{read=true;return {};});
 const notify=vi.fn();
 render(<CommunityWorkspace address="owner" listings={[]} onUnreadChange={notify}/>);
 await waitFor(()=>expect(notify).toHaveBeenLastCalledWith(2));
 expect(communityAction).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Mark as read'}));
 await waitFor(()=>expect(notify).toHaveBeenLastCalledWith(0));
 expect(communityAction).toHaveBeenCalledWith('owner',{action:'mark_read',keys:['review:1:now','report:2:now']});
});
