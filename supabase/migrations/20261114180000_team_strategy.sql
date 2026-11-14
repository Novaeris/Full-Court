-- Team strategy and starters (Phase 22). The owner of a franchise sets how it
-- plays (pace, three-point focus, defence) and may name its five starters; every
-- other team keeps the defaults and the automatic lineup. Only the service role
-- changes them, through admin_set_team_strategy, so the owner can't write
-- starters that aren't on the roster.

alter table public.teams
  add column strategy_pace text not null default 'normal'
    check (strategy_pace in ('slow', 'normal', 'fast')),
  add column strategy_three_point text not null default 'normal'
    check (strategy_three_point in ('low', 'normal', 'high')),
  add column strategy_defense text not null default 'balanced'
    check (strategy_defense in ('balanced', 'perimeter', 'interior')),
  -- Empty means "the best player at each position starts".
  add column starters uuid[] not null default '{}'
    check (cardinality(starters) in (0, 5));

-- Sets a franchise's strategy and starters. Only a team a user runs; `new_starters`
-- is empty or five different active players of the team.
create function public.admin_set_team_strategy(
  target_team uuid,
  new_pace text,
  new_three_point text,
  new_defense text,
  new_starters uuid[]
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
      starters = new_starters
  where id = target_team
  returning * into updated;
  return updated;
end;
$$;

comment on function public.admin_set_team_strategy is
  'Sets a franchise''s pace, three-point focus, defence and starters. Service role only.';
revoke execute on function public.admin_set_team_strategy(uuid, text, text, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.admin_set_team_strategy(uuid, text, text, text, uuid[])
  to service_role;
