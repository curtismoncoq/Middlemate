begin;
create table if not exists community_reads (
  namespace text not null,
  wallet text not null,
  event_key text not null,
  read_at timestamptz not null default now(),
  primary key(namespace,wallet,event_key)
);
alter table community_reads enable row level security;
revoke all on community_reads from public,anon,authenticated;
grant all on community_reads to service_role;
commit;
