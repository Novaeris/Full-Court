-- The trading block (Phase 35). An owner can name up to five of their players as
-- available; the computer teams then make offers for those players instead of
-- for a player of their own choosing. The list is the owner's to change at any
-- time, through admin_set_trading_block (service role), so it can only hold
-- players who are on the team.

alter table public.teams
  add column trading_block uuid[] not null default '{}'
    check (cardinality(trading_block) <= 5);

-- Sets a franchise's trading block: up to five different active players of the
-- team (an empty list clears it). Only a team a user runs has one.
create function public.admin_set_trading_block(target_team uuid, block uuid[])
returns public.teams
language plpgsql
security invoker
set search_path = ''
as $$
declare
  found_team public.teams;
  updated public.teams;
begin
  select * into found_team from public.teams
  where id = target_team and local_player_slot is not null
  for update;
  if not found then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;
  if cardinality(block) > 5
     or (select count(distinct b) from unnest(block) b) <> cardinality(block)
     or (select count(*) from public.players
         where league_id = found_team.league_id and team_id = target_team
           and status = 'active' and id = any (block)) <> cardinality(block) then
    raise exception 'invalid_block' using errcode = '22023';
  end if;
  update public.teams set trading_block = block
  where id = target_team returning * into updated;
  return updated;
end;
$$;

comment on function public.admin_set_trading_block is
  'Sets a franchise''s trading block (up to five of its players). Service role only.';
revoke execute on function public.admin_set_trading_block(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.admin_set_trading_block(uuid, uuid[]) to service_role;
