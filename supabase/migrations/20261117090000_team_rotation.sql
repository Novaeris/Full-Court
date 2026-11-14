-- Rotation size (Phase 25). An owner may tell the coach how many players to use
-- in a game (the starters count): 7 to 12. Empty means everyone, as before.

alter table public.teams
  add column rotation_size smallint
    check (rotation_size is null or rotation_size between 7 and 12);

-- admin_set_team_strategy gains the rotation size (optional, so a call without
-- it clears it, like the starters).
drop function public.admin_set_team_strategy(uuid, text, text, text, uuid[]);

create function public.admin_set_team_strategy(
  target_team uuid,
  new_pace text,
  new_three_point text,
  new_defense text,
  new_starters uuid[],
  new_rotation smallint default null
)
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
  if cardinality(new_starters) not in (0, 5)
     or (select count(distinct s) from unnest(new_starters) s) <> cardinality(new_starters)
     or (select count(*) from public.players
         where league_id = found_team.league_id and team_id = target_team
           and status = 'active' and id = any (new_starters)) <> cardinality(new_starters) then
    raise exception 'invalid_starters' using errcode = '22023';
  end if;
  update public.teams
  set strategy_pace = new_pace,
      strategy_three_point = new_three_point,
      strategy_defense = new_defense,
      starters = new_starters,
      rotation_size = new_rotation
  where id = target_team
  returning * into updated;
  return updated;
end;
$$;

comment on function public.admin_set_team_strategy is
  'Sets a franchise''s pace, three-point focus, defence, starters and rotation size. Service role only.';
revoke execute on function public.admin_set_team_strategy(uuid, text, text, text, uuid[], smallint)
  from public, anon, authenticated;
grant execute on function public.admin_set_team_strategy(uuid, text, text, text, uuid[], smallint)
  to service_role;
