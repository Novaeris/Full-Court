-- Contract extensions (Phase 28). An owner can give a player a new contract before
-- his old one ends. The server decides whether he agrees (his preferences, in
-- game-rules); this stores the new contract, atomically, with every check the
-- other contract changes have.

alter table public.player_transactions
  drop constraint player_transactions_kind_check;
alter table public.player_transactions
  add constraint player_transactions_kind_check
  check (kind in ('drafted', 'signed', 're-signed', 'released', 'contract-ended', 'traded', 'extended'));

-- Replaces a player's contract with a new one that runs `new_years` seasons from
-- the season's own year, so it must end later than the old one. The old salary
-- stops and the new one starts now, which has to leave the team under the hard
-- ceiling. Open in the regular season and from free agency to the preseason.
create function public.admin_extend_contract(
  target_season uuid,
  target_player uuid,
  new_salary integer,
  new_years integer
)
returns public.players
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
  found_player public.players;
  new_expires integer;
  updated public.players;
begin
  select * into current_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if not (
    current_season.phase = 'regular-season'
    or (current_season.phase = 'offseason'
        and current_season.stage in ('free-agency', 'training-camp', 'preseason'))
  ) then
    raise exception 'extensions_closed' using errcode = 'P0001';
  end if;

  select * into found_player from public.players
  where id = target_player and league_id = current_season.league_id
    and status = 'active' and team_id is not null
  for update;
  if not found then
    raise exception 'player_not_on_team' using errcode = 'P0001';
  end if;
  if new_years < 1 or new_years > 5 or new_salary < 1 then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;

  new_expires := current_season.year + new_years - 1;
  if found_player.contract_expires is null or new_expires <= found_player.contract_expires then
    raise exception 'not_an_extension' using errcode = '22023';
  end if;

  update public.players
  set salary = new_salary, contract_expires = new_expires
  where id = target_player
  returning * into updated;

  if app_private.team_payroll(found_player.team_id)
       > app_private.salary_ceiling(current_season.league_id) then
    raise exception 'over_ceiling' using errcode = '22023';
  end if;

  insert into public.player_transactions (
    league_id, season_year, day, kind, player_id, team_id, salary, years
  )
  values (
    current_season.league_id, current_season.year,
    case when current_season.phase = 'regular-season' then current_season.day else 0 end,
    'extended', target_player, found_player.team_id, new_salary, new_years
  );
  return updated;
end;
$$;

comment on function public.admin_extend_contract is
  'Replaces a player''s contract with a longer one. Service role only.';
revoke execute on function public.admin_extend_contract(uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_extend_contract(uuid, uuid, integer, integer)
  to service_role;
