-- Leagues: a user's saved games (save slots). Single-player: each league has
-- exactly one owner. Game data (teams, players, games…) will hang off
-- league_id in later migrations, always with on delete cascade.

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null
    check (char_length(name) between 1 and 40 and name = btrim(name)),
  status text not null default 'setup'
    check (status in ('setup', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.leagues is
  'Saved leagues (save slots). Created only through public.create_league().';

create index leagues_owner_created_idx on public.leagues (owner_id, created_at desc);

alter table public.leagues enable row level security;

-- Clients read, rename and delete their own leagues. Creation goes through
-- create_league() so the per-account limit can't be bypassed.
grant select, delete on public.leagues to authenticated;
grant update (name) on public.leagues to authenticated;

create policy "leagues: owner can read"
  on public.leagues for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "leagues: owner can rename"
  on public.leagues for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "leagues: owner can delete"
  on public.leagues for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

create trigger leagues_touch_updated_at
  before update on public.leagues
  for each row execute function app_private.touch_updated_at();

-- How many leagues one account may keep.
create function public.league_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 5 $$;

grant execute on function public.league_limit() to authenticated;

-- Creates a league for the caller, enforcing the per-account limit.
-- An advisory lock per user makes two simultaneous requests queue, so they
-- can't both pass the count check.
create function public.create_league(league_name text)
returns public.leagues
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  created public.leagues;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('create_league:' || caller::text, 0));

  if (select count(*) from public.leagues where owner_id = caller) >= public.league_limit() then
    raise exception 'league_limit_reached'
      using errcode = 'P0001',
            detail = format('An account can keep up to %s leagues.', public.league_limit());
  end if;

  insert into public.leagues (owner_id, name)
  values (caller, btrim(league_name))
  returning * into created;

  return created;
end;
$$;

comment on function public.create_league(text) is
  'Creates a league owned by the caller. Fails with league_limit_reached at the per-account limit.';

revoke execute on function public.create_league(text) from public, anon;
grant execute on function public.create_league(text) to authenticated;
