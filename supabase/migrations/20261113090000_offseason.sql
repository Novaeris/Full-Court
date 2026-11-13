-- The offseason: the draft, free agency, staff, training camp and the preseason
-- (docs/DESIGN.md, "The offseason"). The calculations happen in the web server
-- (packages/game-engine); this migration stores each step's result in one
-- transaction and keeps the history.
--
-- The steps, in order:
--   1. admin_apply_progression   players age, some retire, staff contracts end
--                                (runs on the archived season, before the next
--                                season exists)
--   2. admin_apply_draft         the lottery and the draft         stage draft
--   3. admin_apply_rosters       free agency: rosters and staff    stage free-agency
--   4. admin_apply_camp          training camp results             stage training-camp
--   5. admin_start_season        the preseason ends, the season opens
-- plus owner actions in any stage: admin_hire_staff, admin_release_staff and
-- admin_set_camp.
--
-- What is kept for every offseason: `draft_picks` (who was picked where, and how
-- the lottery treated the team), `player_ratings_history` (each active player's
-- age and ratings for every season) and `camp_results`. Retired players stay as
-- rows (their statistics and awards point at them) with no team.

-- Players ------------------------------------------------------------------------------------------------

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
  'Set when the ageing step after this season has been applied (admin_apply_progression).';

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
  -- How the pick came about: where the picking team finished (1 = best), the
  -- pick it would have had without the lottery, and its chance of the first
  -- pick (null if it made the playoffs and was not in the lottery).
  finish_rank smallint not null check (finish_rank >= 1),
  expected_pick smallint not null check (expected_pick >= 1),
  lottery_odds numeric(7, 6) check (lottery_odds between 0 and 1),
  primary key (league_id, season_year, pick),
  foreign key (league_id, team_id)
    references public.teams (league_id, id) on delete cascade,
  foreign key (league_id, player_id)
    references public.players (league_id, id) on delete cascade
);

create index draft_picks_team_idx on public.draft_picks (league_id, team_id);
create index draft_picks_player_idx on public.draft_picks (league_id, player_id);

-- A player's age, rating and potential for one season, written each offseason
-- and updated by camp. Development is a query across these rows.
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

-- Staff ----------------------------------------------------------------------------------------------------

-- Coaches and scouts. A team has at most one of each role; a member with no team
-- is on the market. Salaries are in thousands of dollars a year.
create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  team_id uuid,
  first_name text not null check (char_length(first_name) between 1 and 40),
  last_name text not null check (char_length(last_name) between 1 and 40),
  role text not null
    check (role in ('head-coach', 'development-coach', 'conditioning-coach', 'scout')),
  rating smallint not null check (rating between 30 and 95),
  age smallint not null check (age between 25 and 80),
  salary integer not null check (salary between 0 and 20000),
  -- Years left on the contract; null when on the market.
  contract_years smallint check (contract_years between 1 and 3),
  status text not null default 'active' check (status in ('active', 'retired')),
  foreign key (league_id, team_id)
    references public.teams (league_id, id) on delete set null (team_id),
  check ((team_id is null) = (contract_years is null)),
  check (status = 'active' or team_id is null)
);

create unique index staff_members_one_per_role
  on public.staff_members (team_id, role) where team_id is not null;
create index staff_members_league_idx on public.staff_members (league_id, status);
create index staff_members_team_idx on public.staff_members (league_id, team_id);

-- Who is going to this year's training camp, and for what. Only the owner's
-- teams are stored here; the other teams choose when the camp is held.
create table public.camp_assignments (
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_id uuid not null,
  team_id uuid not null,
  player_id uuid not null,
  program text not null
    check (program in ('shooting', 'inside', 'playmaking', 'perimeter-defense',
                       'interior-defense', 'athleticism')),
  primary key (season_id, player_id),
  foreign key (league_id, season_id)
    references public.seasons (league_id, id) on delete cascade,
  foreign key (league_id, team_id)
    references public.teams (league_id, id) on delete cascade,
  foreign key (league_id, player_id)
    references public.players (league_id, id) on delete cascade
);

create index camp_assignments_team_idx on public.camp_assignments (league_id, team_id);
create index camp_assignments_player_idx on public.camp_assignments (league_id, player_id);

-- What a camp did, kept for every year.
create table public.camp_results (
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_year smallint not null,
  player_id uuid not null,
  team_id uuid not null,
  program text not null
    check (program in ('shooting', 'inside', 'playmaking', 'perimeter-defense',
                       'interior-defense', 'athleticism')),
  overall_before smallint not null check (overall_before between 25 and 99),
  overall_after smallint not null check (overall_after between 25 and 99),
  primary key (league_id, season_year, player_id),
  foreign key (league_id, player_id)
    references public.players (league_id, id) on delete cascade,
  foreign key (league_id, team_id)
    references public.teams (league_id, id) on delete cascade
);

create index camp_results_team_idx on public.camp_results (league_id, team_id);
create index camp_results_player_idx on public.camp_results (league_id, player_id);

alter table public.draft_picks enable row level security;
alter table public.player_ratings_history enable row level security;
alter table public.staff_members enable row level security;
alter table public.camp_assignments enable row level security;
alter table public.camp_results enable row level security;

grant select on
  public.draft_picks, public.player_ratings_history, public.staff_members,
  public.camp_assignments, public.camp_results
to authenticated;

create policy "draft_picks: league owner can read"
  on public.draft_picks for select to authenticated
  using (app_private.owns_league(league_id));
create policy "player_ratings_history: league owner can read"
  on public.player_ratings_history for select to authenticated
  using (app_private.owns_league(league_id));
create policy "staff_members: league owner can read"
  on public.staff_members for select to authenticated
  using (app_private.owns_league(league_id));
create policy "camp_assignments: league owner can read"
  on public.camp_assignments for select to authenticated
  using (app_private.owns_league(league_id));
create policy "camp_results: league owner can read"
  on public.camp_results for select to authenticated
  using (app_private.owns_league(league_id));

-- Rules the database holds as well, pinned to @fullcourt/game-rules by tests ----------------------------

-- What a team may spend on staff in a year, in thousands of dollars.
create function app_private.staff_budget() returns integer
language sql immutable set search_path = '' as $$ select 10000 $$;

-- Places in camp: 3, plus 1 for a head coach rated 60 or more, 2 for 80 or more.
create function app_private.camp_places(for_team uuid) returns integer
language sql stable security invoker set search_path = '' as $$
  select 3 + coalesce((
    select case when s.rating >= 80 then 2 when s.rating >= 60 then 1 else 0 end
    from public.staff_members s
    where s.team_id = for_team and s.role = 'head-coach' and s.status = 'active'
  ), 0)
$$;

-- Every team is within its staff budget.
create function app_private.check_league_staff(target_league uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if exists (
    select 1 from public.staff_members s
    where s.league_id = target_league and s.team_id is not null and s.status = 'active'
    group by s.team_id
    having sum(s.salary) > app_private.staff_budget()
  ) then
    raise exception 'staff_over_budget' using errcode = '22023';
  end if;
end;
$$;

-- Every team has 12 to 15 active players and is within its staff budget.
create function app_private.check_league(target_league uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if exists (
    select 1 from public.teams t
    where t.league_id = target_league
      and (
        select count(*) from public.players p
        where p.team_id = t.id and p.status = 'active'
      ) not between 12 and 15
  ) then
    raise exception 'invalid_rosters' using errcode = '22023';
  end if;
  perform app_private.check_league_staff(target_league);
end;
$$;

grant execute on function
  app_private.staff_budget(), app_private.camp_places(uuid),
  app_private.check_league_staff(uuid), app_private.check_league(uuid)
to service_role;

-- A new league's staff (server only) ---------------------------------------------------------------------

-- Gives a league its staff: `members` is a list of {team_id, first_name,
-- last_name, role, rating, age, salary, contract_years}, with a null team_id
-- for the market. Refused if the league already has staff.
create function public.admin_create_staff(target_league uuid, members jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created integer;
begin
  perform 1 from public.leagues where id = target_league for update;
  if not found then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.staff_members where league_id = target_league) then
    raise exception 'staff_already_exist' using errcode = 'P0001';
  end if;
  if jsonb_typeof(members) is distinct from 'array' then
    raise exception 'invalid_staff' using errcode = '22023';
  end if;

  insert into public.staff_members (
    league_id, team_id, first_name, last_name, role, rating, age, salary, contract_years
  )
  select target_league, m.team_id, m.first_name, m.last_name, m.role, m.rating,
         m.age, m.salary, m.contract_years
  from jsonb_to_recordset(members) as m(
    team_id uuid, first_name text, last_name text, role text, rating smallint,
    age smallint, salary integer, contract_years smallint
  );
  get diagnostics created = row_count;
  if created <> jsonb_array_length(members) then
    raise exception 'invalid_staff' using errcode = '22023';
  end if;
  perform app_private.check_league_staff(target_league);
  return created;
end;
$$;

comment on function public.admin_create_staff is
  'Creates a league''s staff and market in one transaction. Service role only.';
revoke execute on function public.admin_create_staff(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_create_staff(uuid, jsonb) to service_role;

-- Adds people to a league's market after it has its staff (new free agents each
-- offseason). Same shape as admin_create_staff, without the once-only rule.
create function public.admin_add_staff(target_league uuid, members jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created integer;
begin
  perform 1 from public.leagues where id = target_league for update;
  if not found then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(members) is distinct from 'array' then
    raise exception 'invalid_staff' using errcode = '22023';
  end if;
  insert into public.staff_members (
    league_id, team_id, first_name, last_name, role, rating, age, salary, contract_years
  )
  select target_league, m.team_id, m.first_name, m.last_name, m.role, m.rating,
         m.age, m.salary, m.contract_years
  from jsonb_to_recordset(members) as m(
    team_id uuid, first_name text, last_name text, role text, rating smallint,
    age smallint, salary integer, contract_years smallint
  );
  get diagnostics created = row_count;
  if created <> jsonb_array_length(members) then
    raise exception 'invalid_staff' using errcode = '22023';
  end if;
  perform app_private.check_league_staff(target_league);
  return created;
end;
$$;

revoke execute on function public.admin_add_staff(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_add_staff(uuid, jsonb) to service_role;

-- Step 1: ageing (server only) -------------------------------------------------------------------------------

-- `changes` is every active player, one object each: id, age, jersey, overall,
-- potential, previous_overall, the thirteen ratings, team_id, retired.
-- `staff_changes` is the staff whose contract ended or who retired: id, status,
-- team_id, contract_years. Runs on the finished, archived season and ages
-- players into the year after it.
create function public.admin_apply_progression(
  target_season uuid,
  changes jsonb,
  staff_changes jsonb
)
returns public.seasons
language plpgsql
security invoker
set search_path = ''
as $$
declare
  finished public.seasons;
  new_year integer;
  expected_total integer;
  updated_total integer;
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
  if changes is null or jsonb_typeof(changes) <> 'array'
     or staff_changes is null or jsonb_typeof(staff_changes) <> 'array' then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;
  new_year := finished.year + 1;

  create temp table progression_changes on commit drop as
  select * from jsonb_to_recordset(changes) as c(
    id uuid, age smallint, jersey smallint, overall smallint, potential smallint,
    previous_overall smallint,
    inside smallint, mid_range smallint, three_point smallint,
    free_throw smallint, passing smallint, ball_handling smallint,
    off_rebound smallint, def_rebound smallint, perimeter_d smallint,
    interior_d smallint, speed smallint, strength smallint, stamina smallint,
    team_id uuid, retired boolean
  );

  expected_total := jsonb_array_length(changes);
  if (select count(*) from progression_changes) <> expected_total
     or exists (select 1 from progression_changes where id is null or retired is null) then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;

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
  from progression_changes c
  where p.id = c.id and p.league_id = finished.league_id and p.status = 'active';
  get diagnostics updated_total = row_count;
  if updated_total <> expected_total then
    raise exception 'invalid_changes'
      using errcode = '22023', detail = 'A player is missing or already retired.';
  end if;

  insert into public.player_ratings_history (
    league_id, player_id, season_year, team_id, age, overall, potential, previous_overall
  )
  select finished.league_id, c.id, new_year, c.team_id, c.age, c.overall, c.potential,
         c.previous_overall
  from progression_changes c
  where not c.retired;

  update public.staff_members m
  set status = s.status, team_id = s.team_id, contract_years = s.contract_years
  from jsonb_to_recordset(staff_changes) as s(
    id uuid, status text, team_id uuid, contract_years smallint
  )
  where m.id = s.id and m.league_id = finished.league_id;
  get diagnostics updated_total = row_count;
  if updated_total <> jsonb_array_length(staff_changes) then
    raise exception 'invalid_changes'
      using errcode = '22023', detail = 'A staff member is missing.';
  end if;

  update public.seasons set offseason_done_at = now()
  where id = target_season returning * into finished;
  return finished;
end;
$$;

comment on function public.admin_apply_progression is
  'Ages the players of an archived season and ends staff contracts, atomically. Service role only.';
revoke execute on function public.admin_apply_progression(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_apply_progression(uuid, jsonb, jsonb) to service_role;

-- Step 2: the draft (server only) -----------------------------------------------------------------------------

-- `changes` is the rookie class, one object each: id (chosen by the caller),
-- first_name, last_name, position, age, height_inches, weight_pounds, jersey,
-- overall, potential, the thirteen ratings, team_id (the drafting team, or null
-- for an undrafted rookie), draft_round, draft_pick, draft_team_id.
-- `lottery` is one object per team: team_id, finish_rank, expected_pick, odds
-- (null outside the lottery). Runs in the draft stage of an offseason season
-- and moves it on to free agency.
create function public.admin_apply_draft(
  target_season uuid,
  changes jsonb,
  lottery jsonb
)
returns public.seasons
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
  picks_total integer;
begin
  select * into current_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if current_season.phase <> 'offseason' or current_season.stage <> 'draft' then
    raise exception 'wrong_stage' using errcode = 'P0001';
  end if;
  if changes is null or jsonb_typeof(changes) <> 'array'
     or lottery is null or jsonb_typeof(lottery) <> 'array' then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;

  create temp table draft_changes on commit drop as
  select * from jsonb_to_recordset(changes) as c(
    id uuid, first_name text, last_name text, position text,
    age smallint, height_inches smallint, weight_pounds smallint,
    jersey smallint, overall smallint, potential smallint,
    inside smallint, mid_range smallint, three_point smallint,
    free_throw smallint, passing smallint, ball_handling smallint,
    off_rebound smallint, def_rebound smallint, perimeter_d smallint,
    interior_d smallint, speed smallint, strength smallint, stamina smallint,
    team_id uuid, draft_round smallint, draft_pick smallint, draft_team_id uuid
  );
  if (select count(*) from draft_changes) <> jsonb_array_length(changes)
     or exists (select 1 from draft_changes where id is null) then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;

  insert into public.players (
    id, league_id, team_id, first_name, last_name, position, age, height_inches,
    weight_pounds, jersey, overall, potential, inside, mid_range, three_point,
    free_throw, passing, ball_handling, off_rebound, def_rebound, perimeter_d,
    interior_d, speed, strength, stamina, draft_year, draft_round, draft_pick
  )
  select c.id, current_season.league_id, c.team_id, c.first_name, c.last_name,
         c.position, c.age, c.height_inches, c.weight_pounds, c.jersey,
         c.overall, c.potential, c.inside, c.mid_range, c.three_point,
         c.free_throw, c.passing, c.ball_handling, c.off_rebound, c.def_rebound,
         c.perimeter_d, c.interior_d, c.speed, c.strength, c.stamina,
         case when c.draft_pick is not null then current_season.year end,
         c.draft_round, c.draft_pick
  from draft_changes c;

  insert into public.draft_picks (
    league_id, season_year, pick, round, team_id, player_id,
    finish_rank, expected_pick, lottery_odds
  )
  select current_season.league_id, current_season.year, c.draft_pick, c.draft_round,
         c.draft_team_id, c.id, l.finish_rank, l.expected_pick, l.odds
  from draft_changes c
  join jsonb_to_recordset(lottery) as l(
    team_id uuid, finish_rank smallint, expected_pick smallint, odds numeric
  ) on l.team_id = c.draft_team_id
  where c.draft_pick is not null;
  get diagnostics picks_total = row_count;
  if picks_total <> (select count(*) from draft_changes where draft_pick is not null) then
    raise exception 'invalid_changes'
      using errcode = '22023', detail = 'A pick has no lottery entry for its team.';
  end if;

  insert into public.player_ratings_history (
    league_id, player_id, season_year, team_id, age, overall, potential, previous_overall
  )
  select current_season.league_id, c.id, current_season.year, c.team_id, c.age,
         c.overall, c.potential, null
  from draft_changes c;

  update public.seasons set stage = 'free-agency'
  where id = target_season returning * into current_season;
  return current_season;
end;
$$;

comment on function public.admin_apply_draft is
  'Stores the rookie class and the draft, and moves the offseason to free agency. Service role only.';
revoke execute on function public.admin_apply_draft(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_apply_draft(uuid, jsonb, jsonb) to service_role;

-- Step 3: free agency (server only) -----------------------------------------------------------------------------

-- `moves` is every player whose team or jersey changed: id, team_id (null for a
-- free agent), jersey. `staff_moves` is every staff member a computer team
-- hired: id, team_id, contract_years. Afterwards every team must have 12 to 15
-- players and stay within its staff budget. Moves the offseason to training camp.
create function public.admin_apply_rosters(
  target_season uuid,
  moves jsonb,
  staff_moves jsonb
)
returns public.seasons
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
  affected integer;
begin
  select * into current_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if current_season.phase <> 'offseason' or current_season.stage <> 'free-agency' then
    raise exception 'wrong_stage' using errcode = 'P0001';
  end if;
  if moves is null or jsonb_typeof(moves) <> 'array'
     or staff_moves is null or jsonb_typeof(staff_moves) <> 'array' then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;

  update public.players p
  set team_id = m.team_id, jersey = m.jersey
  from jsonb_to_recordset(moves) as m(id uuid, team_id uuid, jersey smallint)
  where p.id = m.id and p.league_id = current_season.league_id and p.status = 'active';
  get diagnostics affected = row_count;
  if affected <> jsonb_array_length(moves) then
    raise exception 'invalid_changes'
      using errcode = '22023', detail = 'A player is missing or retired.';
  end if;

  update public.player_ratings_history h
  set team_id = p.team_id
  from public.players p
  where h.league_id = current_season.league_id
    and h.season_year = current_season.year
    and h.player_id = p.id
    and h.team_id is distinct from p.team_id
    and p.id in (select m.id from jsonb_to_recordset(moves) as m(id uuid));

  update public.staff_members s
  set team_id = m.team_id, contract_years = m.contract_years
  from jsonb_to_recordset(staff_moves) as m(id uuid, team_id uuid, contract_years smallint)
  where s.id = m.id and s.league_id = current_season.league_id
    and s.status = 'active' and s.team_id is null;
  get diagnostics affected = row_count;
  if affected <> jsonb_array_length(staff_moves) then
    raise exception 'invalid_changes'
      using errcode = '22023', detail = 'A staff member is missing or already hired.';
  end if;

  perform app_private.check_league(current_season.league_id);

  update public.seasons set stage = 'training-camp'
  where id = target_season returning * into current_season;
  return current_season;
end;
$$;

comment on function public.admin_apply_rosters is
  'Applies free agency (roster and staff moves) and moves the offseason to training camp. Service role only.';
revoke execute on function public.admin_apply_rosters(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_apply_rosters(uuid, jsonb, jsonb) to service_role;

-- Step 4: training camp (server only) ---------------------------------------------------------------------------

-- `results` is every player who attended: player_id, program, overall,
-- potential and the thirteen ratings after camp. Moves the offseason to the preseason.
create function public.admin_apply_camp(target_season uuid, results jsonb)
returns public.seasons
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
  affected integer;
begin
  select * into current_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if current_season.phase <> 'offseason' or current_season.stage <> 'training-camp' then
    raise exception 'wrong_stage' using errcode = 'P0001';
  end if;
  if results is null or jsonb_typeof(results) <> 'array' then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;

  create temp table camp_changes on commit drop as
  select * from jsonb_to_recordset(results) as c(
    player_id uuid, program text, overall smallint, potential smallint,
    inside smallint, mid_range smallint, three_point smallint,
    free_throw smallint, passing smallint, ball_handling smallint,
    off_rebound smallint, def_rebound smallint, perimeter_d smallint,
    interior_d smallint, speed smallint, strength smallint, stamina smallint
  );
  if (select count(*) from camp_changes) <> jsonb_array_length(results)
     or exists (select 1 from camp_changes where player_id is null) then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;

  insert into public.camp_results (
    league_id, season_year, player_id, team_id, program, overall_before, overall_after
  )
  select current_season.league_id, current_season.year, p.id, p.team_id, c.program,
         p.overall, c.overall
  from camp_changes c
  join public.players p on p.id = c.player_id
  where p.league_id = current_season.league_id and p.status = 'active'
    and p.team_id is not null;
  get diagnostics affected = row_count;
  if affected <> jsonb_array_length(results) then
    raise exception 'invalid_changes'
      using errcode = '22023', detail = 'A player is missing, retired or has no team.';
  end if;

  update public.players p
  set overall = c.overall, potential = c.potential,
      inside = c.inside, mid_range = c.mid_range, three_point = c.three_point,
      free_throw = c.free_throw, passing = c.passing,
      ball_handling = c.ball_handling, off_rebound = c.off_rebound,
      def_rebound = c.def_rebound, perimeter_d = c.perimeter_d,
      interior_d = c.interior_d, speed = c.speed, strength = c.strength,
      stamina = c.stamina
  from camp_changes c
  where p.id = c.player_id and p.league_id = current_season.league_id;

  update public.player_ratings_history h
  set overall = c.overall, potential = c.potential
  from camp_changes c
  where h.league_id = current_season.league_id
    and h.season_year = current_season.year and h.player_id = c.player_id;

  delete from public.camp_assignments where season_id = target_season;

  update public.seasons set stage = 'preseason'
  where id = target_season returning * into current_season;
  return current_season;
end;
$$;

comment on function public.admin_apply_camp is
  'Applies the training camp results and moves the offseason to the preseason. Service role only.';
revoke execute on function public.admin_apply_camp(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_apply_camp(uuid, jsonb) to service_role;

-- Step 5: the season opens (server only) ------------------------------------------------------------------------

create function public.admin_start_season(target_season uuid)
returns public.seasons
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
begin
  select * into current_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if current_season.phase <> 'offseason' or current_season.stage <> 'preseason' then
    raise exception 'wrong_stage' using errcode = 'P0001';
  end if;
  perform app_private.check_league(current_season.league_id);
  update public.seasons set phase = 'regular-season', stage = null
  where id = target_season returning * into current_season;
  return current_season;
end;
$$;

comment on function public.admin_start_season is
  'Ends the preseason and opens the regular season. Service role only.';
revoke execute on function public.admin_start_season(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_start_season(uuid) to service_role;

-- Owner actions, in any offseason stage (server only) -------------------------------------------------------------

-- Hires a staff member on the market into his role for `years` years. Whoever
-- held the role goes back on the market. Refused over budget.
create function public.admin_hire_staff(
  target_season uuid,
  staff uuid,
  hire_team uuid,
  years smallint
)
returns public.staff_members
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
  member public.staff_members;
begin
  select * into current_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if current_season.phase <> 'offseason' then
    raise exception 'wrong_stage' using errcode = 'P0001';
  end if;
  if years not between 1 and 3 then
    raise exception 'invalid_years' using errcode = '22023';
  end if;
  select * into member from public.staff_members
  where id = staff and league_id = current_season.league_id for update;
  if not found then
    raise exception 'staff_not_found' using errcode = 'P0002';
  end if;
  if member.status <> 'active' or member.team_id is not null then
    raise exception 'staff_not_available' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.teams where id = hire_team and league_id = current_season.league_id
  ) then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;

  update public.staff_members set team_id = null, contract_years = null
  where team_id = hire_team and role = member.role;
  update public.staff_members set team_id = hire_team, contract_years = years
  where id = staff returning * into member;

  perform app_private.check_league_staff(current_season.league_id);
  return member;
end;
$$;

revoke execute on function public.admin_hire_staff(uuid, uuid, uuid, smallint)
  from public, anon, authenticated;
grant execute on function public.admin_hire_staff(uuid, uuid, uuid, smallint) to service_role;

-- Lets a staff member go; he joins the market.
create function public.admin_release_staff(target_season uuid, staff uuid)
returns public.staff_members
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
  member public.staff_members;
begin
  select * into current_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if current_season.phase <> 'offseason' then
    raise exception 'wrong_stage' using errcode = 'P0001';
  end if;
  update public.staff_members set team_id = null, contract_years = null
  where id = staff and league_id = current_season.league_id and status = 'active'
  returning * into member;
  if not found then
    raise exception 'staff_not_found' using errcode = 'P0002';
  end if;
  return member;
end;
$$;

revoke execute on function public.admin_release_staff(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_release_staff(uuid, uuid) to service_role;

-- Replaces a team's camp roster: `assignments` is a list of {player_id, program}.
-- At most the team's places, each player on the team once.
create function public.admin_set_camp(
  target_season uuid,
  camp_team uuid,
  assignments jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
  total integer;
begin
  select * into current_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if current_season.phase <> 'offseason' or current_season.stage <> 'training-camp' then
    raise exception 'wrong_stage' using errcode = 'P0001';
  end if;
  if jsonb_typeof(assignments) is distinct from 'array' then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;
  total := jsonb_array_length(assignments);
  if total > app_private.camp_places(camp_team) then
    raise exception 'camp_full' using errcode = '22023';
  end if;

  delete from public.camp_assignments
  where season_id = target_season and team_id = camp_team;
  insert into public.camp_assignments (league_id, season_id, team_id, player_id, program)
  select current_season.league_id, target_season, camp_team, a.player_id, a.program
  from jsonb_to_recordset(assignments) as a(player_id uuid, program text)
  join public.players p
    on p.id = a.player_id and p.team_id = camp_team and p.status = 'active';
  if (select count(*) from public.camp_assignments
      where season_id = target_season and team_id = camp_team) <> total then
    raise exception 'invalid_changes'
      using errcode = '22023', detail = 'A player is not on the team.';
  end if;
  return total;
end;
$$;

revoke execute on function public.admin_set_camp(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_set_camp(uuid, uuid, jsonb) to service_role;
