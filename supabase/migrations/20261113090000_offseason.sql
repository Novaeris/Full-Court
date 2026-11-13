-- Offseason, part one: players age and change, some retire, a rookie class is
-- drafted and rosters are refilled. The calculation happens in the web server
-- (packages/game-engine, offseason); this migration stores the result in one
-- transaction and keeps the history.
--
-- What is kept, for every offseason, in `draft_picks` and
-- `player_ratings_history`: who was picked where, and each active player's
-- age and ratings for the new season. Retired players stay as rows (their
-- statistics and awards point at them) with no team.

alter table public.players
  add column status text not null default 'active'
    check (status in ('active', 'retired')),
  add column retired_year smallint,
  add column draft_year smallint,
  add column draft_round smallint,
  add column draft_pick smallint,
  add check ((status = 'retired') = (retired_year is not null)),
  add check (status = 'active' or team_id is null);

-- Rosters, the free-agent pool and team strength only look at active players.
create index players_active_idx on public.players (league_id, team_id)
  where status = 'active';

alter table public.seasons
  add column offseason_done_at timestamptz;

comment on column public.seasons.offseason_done_at is
  'Set when the offseason after this season has been applied (admin_apply_offseason).';

-- Draft history ---------------------------------------------------------------------------------------

-- One row per pick in a draft. `season_year` is the year of the season the
-- rookies then play, so the draft that follows the 2026 season is 2027.
create table public.draft_picks (
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_year smallint not null,
  pick smallint not null check (pick >= 1),
  round smallint not null check (round >= 1),
  team_id uuid not null,
  player_id uuid not null,
  primary key (league_id, season_year, pick),
  foreign key (league_id, team_id)
    references public.teams (league_id, id) on delete cascade,
  foreign key (league_id, player_id)
    references public.players (league_id, id) on delete cascade
);

create index draft_picks_team_idx on public.draft_picks (league_id, team_id);
create index draft_picks_player_idx on public.draft_picks (league_id, player_id);

-- A player's age, rating and potential for one season, written each offseason.
-- Development is a query across these rows.
create table public.player_ratings_history (
  league_id uuid not null references public.leagues (id) on delete cascade,
  player_id uuid not null,
  season_year smallint not null,
  team_id uuid,
  age smallint not null,
  overall smallint not null check (overall between 25 and 99),
  potential smallint not null check (potential between 25 and 99),
  -- The overall before the offseason; null for a rookie.
  previous_overall smallint check (previous_overall between 25 and 99),
  primary key (league_id, player_id, season_year),
  foreign key (league_id, player_id)
    references public.players (league_id, id) on delete cascade,
  foreign key (league_id, team_id)
    references public.teams (league_id, id) on delete set null (team_id)
);

create index player_ratings_history_team_idx
  on public.player_ratings_history (league_id, team_id);
create index player_ratings_history_year_idx
  on public.player_ratings_history (league_id, season_year);

alter table public.draft_picks enable row level security;
alter table public.player_ratings_history enable row level security;

grant select on public.draft_picks, public.player_ratings_history to authenticated;

create policy "draft_picks: league owner can read"
  on public.draft_picks for select to authenticated
  using (app_private.owns_league(league_id));
create policy "player_ratings_history: league owner can read"
  on public.player_ratings_history for select to authenticated
  using (app_private.owns_league(league_id));

-- Applying an offseason (server only) --------------------------------------------------------------------

-- `changes` is every player the offseason touched, one object each:
--   id, is_new, first_name, last_name, position, age, height_inches,
--   weight_pounds, jersey, overall, potential, the thirteen ratings,
--   team_id (null = free agent), retired, draft_round, draft_pick, draft_team_id,
--   previous_overall (null for a rookie).
-- Existing players (is_new false) are updated; new ones (the rookie class) are
-- inserted with the id the caller chose. All of it happens in one transaction,
-- or none does.
create function public.admin_apply_offseason(
  target_season uuid,
  changes jsonb
)
returns public.seasons
language plpgsql
security invoker
set search_path = ''
as $$
declare
  finished public.seasons;
  new_year integer;
  existing_total integer;
  updated_total integer;
  bad_team uuid;
begin
  select * into finished from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if finished.archived_at is null then
    raise exception 'season_not_archived' using errcode = 'P0001';
  end if;
  if finished.offseason_done_at is not null then
    raise exception 'offseason_already_done' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.seasons
    where league_id = finished.league_id and year > finished.year
  ) then
    raise exception 'season_not_latest' using errcode = 'P0001';
  end if;
  if changes is null or jsonb_typeof(changes) <> 'array' then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;
  new_year := finished.year + 1;

  create temp table offseason_changes on commit drop as
  select * from jsonb_to_recordset(changes) as c(
    id uuid, is_new boolean, first_name text, last_name text, position text,
    age smallint, height_inches smallint, weight_pounds smallint,
    jersey smallint, overall smallint, potential smallint,
    inside smallint, mid_range smallint, three_point smallint,
    free_throw smallint, passing smallint, ball_handling smallint,
    off_rebound smallint, def_rebound smallint, perimeter_d smallint,
    interior_d smallint, speed smallint, strength smallint, stamina smallint,
    team_id uuid, retired boolean, draft_round smallint, draft_pick smallint,
    draft_team_id uuid, previous_overall smallint
  );

  if (select count(*) from offseason_changes) <> jsonb_array_length(changes)
     or exists (select 1 from offseason_changes where id is null or is_new is null or retired is null) then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;

  -- Existing players.
  select count(*) into existing_total from offseason_changes where not is_new;
  update public.players p
  set age = c.age, jersey = c.jersey, overall = c.overall, potential = c.potential,
      inside = c.inside, mid_range = c.mid_range, three_point = c.three_point,
      free_throw = c.free_throw, passing = c.passing,
      ball_handling = c.ball_handling, off_rebound = c.off_rebound,
      def_rebound = c.def_rebound, perimeter_d = c.perimeter_d,
      interior_d = c.interior_d, speed = c.speed, strength = c.strength,
      stamina = c.stamina,
      team_id = case when c.retired then null else c.team_id end,
      status = case when c.retired then 'retired' else 'active' end,
      retired_year = case when c.retired then new_year else null end
  from offseason_changes c
  where not c.is_new
    and p.id = c.id
    and p.league_id = finished.league_id
    and p.status = 'active';
  get diagnostics updated_total = row_count;
  if updated_total <> existing_total then
    raise exception 'invalid_changes'
      using errcode = '22023', detail = 'A player is missing or already retired.';
  end if;

  -- The rookie class.
  insert into public.players (
    id, league_id, team_id, first_name, last_name, position, age, height_inches,
    weight_pounds, jersey, overall, potential, inside, mid_range, three_point,
    free_throw, passing, ball_handling, off_rebound, def_rebound, perimeter_d,
    interior_d, speed, strength, stamina, draft_year, draft_round, draft_pick
  )
  select c.id, finished.league_id, c.team_id, c.first_name, c.last_name,
         c.position, c.age, c.height_inches, c.weight_pounds, c.jersey,
         c.overall, c.potential, c.inside, c.mid_range, c.three_point,
         c.free_throw, c.passing, c.ball_handling, c.off_rebound, c.def_rebound,
         c.perimeter_d, c.interior_d, c.speed, c.strength, c.stamina,
         case when c.draft_pick is not null then new_year end,
         c.draft_round, c.draft_pick
  from offseason_changes c
  where c.is_new and not c.retired;

  insert into public.draft_picks (league_id, season_year, pick, round, team_id, player_id)
  select finished.league_id, new_year, c.draft_pick, c.draft_round, c.draft_team_id, c.id
  from offseason_changes c
  where c.is_new and c.draft_pick is not null;

  insert into public.player_ratings_history (
    league_id, player_id, season_year, team_id, age, overall, potential, previous_overall
  )
  select finished.league_id, c.id, new_year, c.team_id, c.age, c.overall, c.potential,
         c.previous_overall
  from offseason_changes c
  where not c.retired;

  -- Every team ends with a legal roster.
  select t.id into bad_team
  from public.teams t
  where t.league_id = finished.league_id
    and (
      select count(*) from public.players p
      where p.team_id = t.id and p.status = 'active'
    ) not between 13 and 15
  limit 1;
  if bad_team is not null then
    raise exception 'invalid_rosters' using errcode = '22023';
  end if;

  update public.seasons set offseason_done_at = now()
  where id = target_season returning * into finished;
  return finished;
end;
$$;

comment on function public.admin_apply_offseason is
  'Stores one offseason (progression, retirements, draft, roster moves) atomically. Service role only.';

revoke execute on function public.admin_apply_offseason(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_apply_offseason(uuid, jsonb) to service_role;
