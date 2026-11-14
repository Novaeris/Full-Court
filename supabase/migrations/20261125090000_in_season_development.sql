-- Development during the season (Phase 38). Part of a year's change to a
-- player's ratings happens in the season, in steps the worker takes at set
-- days (game-rules, "development"). A season remembers how many steps it has
-- had, so a step happens once however often a job is retried.

alter table public.seasons
  add column development_steps smallint not null default 0
    check (development_steps >= 0);

-- Applies one step: new ratings (and the overall they make) for players of the
-- season's league. Does nothing, and says so, if that step (or a later one)
-- has been applied. Only in the regular season. All or nothing.
create function public.admin_apply_development(
  target_season uuid,
  step integer,
  changes jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
  expected_total integer;
  updated_total integer;
begin
  select * into current_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if current_season.phase <> 'regular-season' then
    raise exception 'season_not_in_play' using errcode = 'P0001';
  end if;
  if step < 1 or changes is null or jsonb_typeof(changes) <> 'array' then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;
  if current_season.development_steps >= step then
    return 0;
  end if;

  drop table if exists pg_temp.development_changes;
  create temp table development_changes on commit drop as
  select * from jsonb_to_recordset(changes) as c(
    id uuid, overall smallint,
    inside smallint, mid_range smallint, three_point smallint,
    free_throw smallint, passing smallint, ball_handling smallint,
    off_rebound smallint, def_rebound smallint, perimeter_d smallint,
    interior_d smallint, speed smallint, strength smallint, stamina smallint
  );
  expected_total := jsonb_array_length(changes);
  if (select count(*) from development_changes) <> expected_total
     or exists (select 1 from development_changes where id is null) then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;

  update public.players p
  set overall = c.overall,
      inside = c.inside, mid_range = c.mid_range, three_point = c.three_point,
      free_throw = c.free_throw, passing = c.passing,
      ball_handling = c.ball_handling, off_rebound = c.off_rebound,
      def_rebound = c.def_rebound, perimeter_d = c.perimeter_d,
      interior_d = c.interior_d, speed = c.speed, strength = c.strength,
      stamina = c.stamina
  from development_changes c
  where p.id = c.id and p.league_id = current_season.league_id
    and p.status = 'active';
  get diagnostics updated_total = row_count;
  if updated_total <> expected_total then
    raise exception 'invalid_changes'
      using errcode = '22023', detail = 'A player is missing or not active.';
  end if;

  update public.seasons set development_steps = step where id = target_season;
  return updated_total;
end;
$$;

comment on function public.admin_apply_development is
  'Applies one in-season development step to players'' ratings, once per step. Service role only.';
revoke execute on function public.admin_apply_development(uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_apply_development(uuid, integer, jsonb)
  to service_role;
