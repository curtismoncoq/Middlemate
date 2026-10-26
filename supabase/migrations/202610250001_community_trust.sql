-- Run once in the Supabase SQL editor. The backend alone accesses these tables.
begin;

create table public.community_calls (
 id uuid primary key default gen_random_uuid(), namespace text not null, listing_id text not null,
 listing_name text not null, provider text not null, buyer text not null, endpoint text not null,
 tx_hash text not null check (tx_hash ~ '^[0-9a-f]{64}$'), amount_atomic text not null check (amount_atomic ~ '^[1-9][0-9]{0,29}$'),
 source text not null check (source in ('human','agent','audit')), response_ok boolean not null,
 schema_valid boolean, fields_present boolean, status_code integer not null,
 request_hash text not null, at timestamptz not null, created_at timestamptz not null default now(),
 unique(namespace,tx_hash)
);
create index community_calls_wallet on public.community_calls(namespace,buyer,at desc);
create index community_calls_listing on public.community_calls(namespace,listing_id,at desc);

create table public.community_reviews (
 id uuid primary key default gen_random_uuid(), namespace text not null, listing_id text not null,
 buyer text not null, provider text not null, call_id uuid not null references public.community_calls(id),
 vote smallint not null check(vote in (-1,1)), reason text not null default '', comment text not null default '' check(length(comment)<=1000),
 provider_reply text not null default '' check(length(provider_reply)<=1000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(namespace,listing_id,buyer), check(buyer<>provider), check(vote=1 or length(reason)>0)
);

create table public.community_reports (
 id uuid primary key default gen_random_uuid(), namespace text not null, listing_id text not null,
 listing_name text not null, buyer text not null, provider text not null,
 call_id uuid references public.community_calls(id), reason text not null,
 origin text not null default 'buyer' check(origin in ('buyer','audit')), audit_id text,
 description text not null check(length(description) between 10 and 3000),
 status text not null default 'received' check(status in ('received','reviewing','awaiting_provider','confirmed','dismissed','resolved')),
 provider_reply text not null default '' check(length(provider_reply)<=3000),
 response_deadline timestamptz not null, created_at timestamptz not null default now(),
 unique(namespace,call_id,buyer), check(buyer<>provider),
 check((origin='buyer' and call_id is not null) or (origin='audit' and audit_id is not null))
);
create index community_reports_parties on public.community_reports(namespace,provider,buyer);
create unique index community_one_open_audit_case on public.community_reports(namespace,listing_id) where origin='audit' and status in ('received','reviewing','awaiting_provider');

create table public.community_decisions (
 id uuid primary key default gen_random_uuid(), namespace text not null,
 report_id uuid not null references public.community_reports(id), listing_id text not null,
 provider text not null, moderator text not null,
 action text not null check(action in ('request_response','dismiss','resolve','warning','pause','slash')),
 note text not null check(length(note) between 10 and 2000),
 status text not null default 'prepared' check(status in ('prepared','executing','completed','failed','cancelled')),
 slash_tx text, pause_tx text, error text, created_at timestamptz not null default now(),
 completed_at timestamptz
);
create unique index community_one_pending_decision on public.community_decisions(namespace,report_id) where status in ('prepared','executing');

create table public.community_audits (
 namespace text not null, id text not null, listing_id text not null,
 provider text not null, at timestamptz not null, body jsonb not null,
 primary key(namespace,id)
);
create index community_audits_listing on public.community_audits(namespace,listing_id,at desc);

create table public.community_challenges (
 id uuid primary key default gen_random_uuid(), namespace text not null, wallet text not null,
 message text not null, origin text not null, purpose text not null,
 expires_at timestamptz not null, used_at timestamptz, created_at timestamptz not null default now()
);
create table public.community_sessions (
 token_hash text primary key, namespace text not null, wallet text not null,
 expires_at timestamptz not null, created_at timestamptz not null default now()
);

create function public.community_save_review(p_namespace text,p_wallet text,p_call_id uuid,p_vote integer,p_reason text,p_comment text)
returns public.community_reviews language plpgsql security invoker set search_path=public as $$
declare c community_calls; old community_reviews; result community_reviews;
begin
 select * into c from community_calls where id=p_call_id and namespace=p_namespace and buyer=p_wallet;
 if not found or c.buyer=c.provider or not c.response_ok or c.source='audit' then raise exception 'Verified successful buyer call required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_namespace||':'||c.listing_id||':'||p_wallet,0));
 select * into old from community_reviews where namespace=p_namespace and listing_id=c.listing_id and buyer=p_wallet;
 if found and c.at<=old.updated_at then raise exception 'Make a new paid call before updating this review'; end if;
 insert into community_reviews(namespace,listing_id,buyer,provider,call_id,vote,reason,comment)
 values(p_namespace,c.listing_id,p_wallet,c.provider,c.id,p_vote,p_reason,p_comment)
 on conflict(namespace,listing_id,buyer) do update set call_id=excluded.call_id,vote=excluded.vote,reason=excluded.reason,comment=excluded.comment,updated_at=now()
 returning * into result;
 return result;
end $$;

create function public.community_create_report(p_namespace text,p_wallet text,p_call_id uuid,p_reason text,p_description text,p_response_seconds integer)
returns public.community_reports language plpgsql security invoker set search_path=public as $$
declare c community_calls; result community_reports;
begin
 select * into c from community_calls where id=p_call_id and namespace=p_namespace and buyer=p_wallet;
 if not found or c.buyer=c.provider or c.source='audit' then raise exception 'Verified buyer call required'; end if;
 insert into community_reports(namespace,listing_id,listing_name,buyer,provider,call_id,reason,description,response_deadline)
 values(p_namespace,c.listing_id,c.listing_name,p_wallet,c.provider,c.id,p_reason,p_description,now()+make_interval(secs=>greatest(p_response_seconds,0))) returning * into result;
 return result;
end $$;

create function public.community_claim_decision(p_namespace text,p_id uuid,p_moderator text)
returns public.community_decisions language plpgsql security invoker set search_path=public as $$
declare d community_decisions; r community_reports;
begin
 select * into d from community_decisions where id=p_id and namespace=p_namespace for update;
 if not found or d.moderator<>p_moderator or d.status not in ('prepared','failed') then raise exception 'Decision unavailable or already executing'; end if;
 select * into r from community_reports where id=d.report_id and namespace=p_namespace for update;
 if not found or r.status in ('confirmed','dismissed','resolved') then raise exception 'Report already closed'; end if;
 if p_moderator in (r.buyer,r.provider) then raise exception 'Cannot moderate your own case'; end if;
 if d.action in ('warning','slash') and now()<r.response_deadline and length(r.provider_reply)=0 then raise exception 'Provider response window is still open'; end if;
 update community_decisions set status='executing',error=null where id=d.id returning * into d;
 update community_reports set status='reviewing' where id=r.id;
 return d;
end $$;

create function public.community_open_audit_case(p_namespace text,p_audit_id text,p_auditor text,p_response_seconds integer)
returns void language plpgsql security invoker set search_path=public as $$
declare a community_audits;
begin
 select * into a from community_audits where namespace=p_namespace and id=p_audit_id;
 if not found or a.body->'weather' is null or coalesce((a.body->'verdict'->>'pass')::boolean,true) or coalesce((a.body->'verdict'->>'inconclusive')::boolean,true) or coalesce((a.body->'verdict'->>'scored')::integer,0)<5 then return; end if;
 if a.provider=p_auditor then return; end if;
 insert into community_reports(namespace,listing_id,listing_name,buyer,provider,reason,description,origin,audit_id,response_deadline)
 values(p_namespace,a.listing_id,a.body->>'name',p_auditor,a.provider,'accuracy','Automated MET Norway comparison found material disagreement. Review the audit evidence; this is not a fraud verdict and does not automatically sanction the provider.','audit',a.id,now()+make_interval(secs=>greatest(p_response_seconds,0)))
 on conflict(namespace,listing_id) where origin='audit' and status in ('received','reviewing','awaiting_provider') do nothing;
end $$;

create function public.community_complete_decision(p_namespace text,p_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare d community_decisions;
begin
 select * into d from community_decisions where namespace=p_namespace and id=p_id and status='executing' for update;
 if not found then raise exception 'Decision is not executing'; end if;
 if d.action='slash' and (d.slash_tx is null or d.pause_tx is null) then raise exception 'Confirmed chain transactions required'; end if;
 if d.action='pause' and d.pause_tx is null then raise exception 'Confirmed pause required'; end if;
 update community_decisions set status='completed',completed_at=now() where id=d.id;
 update community_reports set status=case d.action when 'dismiss' then 'dismissed' when 'resolve' then 'resolved' when 'request_response' then 'awaiting_provider' when 'pause' then 'reviewing' else 'confirmed' end where id=d.report_id;
end $$;

-- No anonymous or Supabase Auth client can bypass application authorization.
alter table community_calls enable row level security;
alter table community_reviews enable row level security;
alter table community_reports enable row level security;
alter table community_decisions enable row level security;
alter table community_audits enable row level security;
alter table community_challenges enable row level security;
alter table community_sessions enable row level security;
revoke all on community_calls,community_reviews,community_reports,community_decisions,community_audits,community_challenges,community_sessions from anon,authenticated;
grant all on community_calls,community_reviews,community_reports,community_decisions,community_audits,community_challenges,community_sessions to service_role;
revoke all on function community_save_review(text,text,uuid,integer,text,text),community_create_report(text,text,uuid,text,text,integer),community_claim_decision(text,uuid,text),community_complete_decision(text,uuid) from public,anon,authenticated;
grant execute on function community_save_review(text,text,uuid,integer,text,text),community_create_report(text,text,uuid,text,text,integer),community_claim_decision(text,uuid,text),community_complete_decision(text,uuid) to service_role;
revoke all on function community_open_audit_case(text,text,text,integer) from public,anon,authenticated;
grant execute on function community_open_audit_case(text,text,text,integer) to service_role;
commit;
