-- Season core: seasons, games, play-by-play, box scores and the simulation queue.
--
-- Everything hangs off a league and is deleted with it. Clients can read their
-- own league's rows and nothing else. Every write comes from the service role:
-- the server creates a season and its schedule, and the simulation worker
-- claims jobs and commits one simulated day at a time. Players and teams are
-- referenced with (league_id, id) pairs, so a row can never point into another
-- league.
--
-- Plays are the bulk of the data (a few hundred rows per game). Keeping only
-- recent seasons' plays is a later decision; nothing here prevents it.

-- A game's players are referenced by league too.
alter table public.players add unique (league_id, id);

-- Helpers ---------------------------------------------------------------------------------

-- Games each pair of teams plays per season, by relationship. Mirrors
-- ScheduleTiers in @fullcourt/game-types: three whole numbers from 1 to 8.
create function app_private.valid_schedule_tiers(t jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  key text;
begin
  if jsonb_typeof(t) is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(t)) <> 3 then return false; end if;
  foreach key in array array['division', 'conference', 'interconference'] loop
    if jsonb_typeof(t -> key) is distinct from 'number'
       or (t ->> key) !~ '^[1-8]$' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

grant execute on function app_private.valid_schedule_tiers(jsonb)
  to service_role, authenticated;

-- Seasons ----------------------------------------------------------------------------------

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  year integer not null check (year between 1900 and 3000),
  phase text not null default 'regular-season'
    check (phase in ('regular-season', 'playoffs', 'complete')),
  -- The next game day to simulate, starting at 1.
  day integer not null default 1 check (day >= 1),
  -- The last scheduled regular-season day.
  last_day integer not null check (last_day >= 1),
  schedule_preset text not null default 'standard'
    check (schedule_preset in ('short', 'standard', 'long', 'custom')),
  schedule_tiers jsonb not null
    check (app_private.valid_schedule_tiers(schedule_tiers)),
  created_at timestamptz not null default now(),
  unique (league_id, year),
  unique (league_id, id),
  -- The regular season runs until its last day has been simulated.
  check ((phase = 'regular-season') = (day <= last_day))
);

-- Games --------------------------------------------------------------------------------------

create table public.games (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_id uuid not null,
  -- Game day within the season, starting at 1.
  day integer not null check (day >= 1),
  home_team_id uuid not null,
  away_team_id uuid not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'final')),
  home_score smallint check (home_score between 0 and 400),
  away_score smallint check (away_score between 0 and 400),
  overtimes smallint not null default 0 check (overtimes between 0 and 20),
  foreign key (league_id, season_id)
    references public.seasons (league_id, id) on delete cascade,
  foreign key (league_id, home_team_id)
    references public.teams (league_id, id) on delete cascade,
  foreign key (league_id, away_team_id)
    references public.teams (league_id, id) on delete cascade,
  unique (league_id, id),
  check (home_team_id <> away_team_id),
  -- Scores exist exactly when the game is final (both or neither), and there
  -- are no ties.
  check ((home_score is null) = (away_score is null)),
  check ((status = 'final') = (home_score is not null and away_score is not null)),
  check (status = 'scheduled' or home_score <> away_score),
  check (status = 'final' or overtimes = 0)
);

create index games_season_day_idx on public.games (season_id, day);
create index games_home_team_idx on public.games (season_id, home_team_id);
create index games_away_team_idx on public.games (season_id, away_team_id);

-- Play-by-play ---------------------------------------------------------------------------------

-- One row per event, in the shape of PlayEvent in @fullcourt/game-types. The
-- plays are the source of truth for a game: scores and box scores derive from
-- them. at_x runs 0-94 along the court and at_y 0-50 across it.
create table public.play_events (
  league_id uuid not null references public.leagues (id) on delete cascade,
  game_id uuid not null,
  seq integer not null check (seq >= 1),
  period smallint not null check (period between 1 and 24),
  clock smallint not null check (clock between 0 and 720),
  kind text not null check (kind in (
    'period-start', 'made-shot', 'missed-shot', 'free-throw', 'rebound',
    'turnover', 'foul', 'substitution', 'period-end'
  )),
  team_id uuid,
  player_id uuid,
  -- The other players an event can name. Written by the worker from the same
  -- rosters, so they are not constrained separately.
  assist_player_id uuid,
  block_player_id uuid,
  steal_player_id uuid,
  out_player_id uuid,
  shot_zone text check (shot_zone in ('inside', 'mid-range', 'three')),
  made boolean,
  offensive boolean,
  points smallint not null default 0 check (points between 0 and 3),
  home_score smallint not null check (home_score >= 0),
  away_score smallint not null check (away_score >= 0),
  transition boolean not null default false,
  at_x numeric(4, 1) check (at_x between 0 and 94),
  at_y numeric(3, 1) check (at_y between 0 and 50),
  primary key (game_id, seq),
  foreign key (league_id, game_id)
    references public.games (league_id, id) on delete cascade,
  foreign key (league_id, team_id)
    references public.teams (league_id, id) on delete cascade,
  foreign key (league_id, player_id)
    references public.players (league_id, id)
);

-- Box scores ---------------------------------------------------------------------------------------

-- One row per player who took the court, derived from the plays when the day
-- is committed. Totals add up to the final score (checked on commit).
create table public.box_score_lines (
  league_id uuid not null references public.leagues (id) on delete cascade,
  game_id uuid not null,
  player_id uuid not null,
  team_id uuid not null,
  started boolean not null,
  minutes smallint not null check (minutes between 0 and 100),
  points smallint not null check (points >= 0),
  rebounds smallint not null check (rebounds >= 0),
  assists smallint not null check (assists >= 0),
  steals smallint not null check (steals >= 0),
  blocks smallint not null check (blocks >= 0),
  turnovers smallint not null check (turnovers >= 0),
  fouls smallint not null check (fouls between 0 and 6),
  fgm smallint not null check (fgm >= 0),
  fga smallint not null check (fga >= 0),
  tpm smallint not null check (tpm >= 0),
  tpa smallint not null check (tpa >= 0),
  ftm smallint not null check (ftm >= 0),
  fta smallint not null check (fta >= 0),
  primary key (game_id, player_id),
  foreign key (league_id, game_id)
    references public.games (league_id, id) on delete cascade,
  foreign key (league_id, player_id)
    references public.players (league_id, id),
  foreign key (league_id, team_id)
    references public.teams (league_id, id) on delete cascade,
  check (fgm <= fga and tpm <= tpa and tpa <= fga and ftm <= fta),
  check (points = 2 * (fgm - tpm) + 3 * tpm + ftm)
);

create index box_score_lines_player_idx on public.box_score_lines (league_id, player_id);

-- Simulation queue ----------------------------------------------------------------------------------

-- The owner asks to simulate a day, a week or the rest of the regular season;
-- the worker claims the job and commits one day at a time. Clients watch the
-- row (Realtime) for progress. A league has at most one active job.
create table public.sim_jobs (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_id uuid not null,
  kind text not null check (kind in ('day', 'week', 'season')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  days_requested integer not null check (days_requested >= 1),
  days_done integer not null default 0,
  error text check (char_length(error) <= 500),
  worker text check (char_length(worker) <= 80),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz,
  foreign key (league_id, season_id)
    references public.seasons (league_id, id) on delete cascade,
  check (days_done between 0 and days_requested)
);

create unique index sim_jobs_one_active_per_league
  on public.sim_jobs (league_id) where status in ('queued', 'running');
create index sim_jobs_queue_idx
  on public.sim_jobs (created_at) where status = 'queued';

-- Read access: the league owner only ----------------------------------------------------------------

alter table public.seasons enable row level security;
alter table public.games enable row level security;
alter table public.play_events enable row level security;
alter table public.box_score_lines enable row level security;
alter table public.sim_jobs enable row level security;

grant select on
  public.seasons, public.games, public.play_events,
  public.box_score_lines, public.sim_jobs
to authenticated;

create policy "seasons: league owner can read"
  on public.seasons for select to authenticated
  using (app_private.owns_league(league_id));
create policy "games: league owner can read"
  on public.games for select to authenticated
  using (app_private.owns_league(league_id));
create policy "play_events: league owner can read"
  on public.play_events for select to authenticated
  using (app_private.owns_league(league_id));
create policy "box_score_lines: league owner can read"
  on public.box_score_lines for select to authenticated
  using (app_private.owns_league(league_id));
create policy "sim_jobs: league owner can read"
  on public.sim_jobs for select to authenticated
  using (app_private.owns_league(league_id));

-- Clients follow simulation progress and the calendar through Realtime. Realtime
-- applies the policies above, so an owner only receives their own league's rows.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sim_jobs, public.seasons;
  end if;
end
$$;

-- Asking for a simulation (owner) -----------------------------------------------------------------------

create function public.enqueue_sim_job(target_league uuid, sim_kind text)
returns public.sim_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  league public.leagues;
  current_season public.seasons;
  remaining integer;
  requested integer;
  job public.sim_jobs;
begin
  if sim_kind is null or sim_kind not in ('day', 'week', 'season') then
    raise exception 'invalid_sim_kind' using errcode = '22023';
  end if;

  select * into league
  from public.leagues
  where id = target_league and owner_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  if league.status <> 'active' then
    raise exception 'league_not_active' using errcode = 'P0001';
  end if;

  select * into current_season
  from public.seasons
  where league_id = target_league
  order by year desc
  limit 1;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if current_season.phase <> 'regular-season' then
    raise exception 'season_not_running' using errcode = 'P0001';
  end if;

  remaining := current_season.last_day - current_season.day + 1;
  requested := case sim_kind
    when 'day' then 1
    when 'week' then least(7, remaining)
    else remaining
  end;

  begin
    insert into public.sim_jobs (league_id, season_id, kind, days_requested)
    values (target_league, current_season.id, sim_kind, requested)
    returning * into job;
  exception when unique_violation then
    raise exception 'job_already_running' using errcode = 'P0001';
  end;
  return job;
end;
$$;

comment on function public.enqueue_sim_job is
  'Queues a simulation of a day, a week or the rest of the regular season for the caller''s league. One active job per league.';

revoke execute on function public.enqueue_sim_job(uuid, text) from public, anon;
grant execute on function public.enqueue_sim_job(uuid, text) to authenticated;

create function public.cancel_sim_job(target_job uuid)
returns public.sim_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.sim_jobs;
begin
  update public.sim_jobs
  set status = 'cancelled', finished_at = now()
  where id = target_job
    and status in ('queued', 'running')
    and app_private.owns_league(league_id)
  returning * into job;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  return job;
end;
$$;

comment on function public.cancel_sim_job is
  'Cancels a queued or running simulation. Days already committed stay.';

revoke execute on function public.cancel_sim_job(uuid) from public, anon;
grant execute on function public.cancel_sim_job(uuid) to authenticated;

-- Creating a season (server only) ------------------------------------------------------------------------

-- `schedule` is a JSON array of {day, home_team_id, away_team_id}, built by
-- @fullcourt/game-engine from the league's teams.
create function public.admin_create_season(
  target_league uuid,
  season_year integer,
  preset text,
  tiers jsonb,
  schedule jsonb
)
returns public.seasons
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created public.seasons;
  game_count integer;
  last_game_day integer;
begin
  if jsonb_typeof(schedule) is distinct from 'array'
     or jsonb_array_length(schedule) = 0 then
    raise exception 'invalid_schedule'
      using errcode = '22023', detail = 'The schedule has no games.';
  end if;

  perform 1 from public.leagues where id = target_league for update;
  if not found then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;

  select max(g.day) into last_game_day
  from jsonb_to_recordset(schedule) as g(day integer);

  insert into public.seasons (league_id, year, phase, day, last_day, schedule_preset, schedule_tiers)
  values (target_league, season_year, 'regular-season', 1, last_game_day, preset, tiers)
  returning * into created;

  insert into public.games (league_id, season_id, day, home_team_id, away_team_id)
  select target_league, created.id, g.day, g.home_team_id, g.away_team_id
  from jsonb_to_recordset(schedule) as g(day integer, home_team_id uuid, away_team_id uuid);
  get diagnostics game_count = row_count;

  if game_count <> jsonb_array_length(schedule) then
    raise exception 'invalid_schedule' using errcode = '22023';
  end if;

  -- A team plays at most once a day.
  if exists (
    select 1
    from (
      select day, home_team_id as team_id from public.games where season_id = created.id
      union all
      select day, away_team_id from public.games where season_id = created.id
    ) played
    group by day, team_id
    having count(*) > 1
  ) then
    raise exception 'invalid_schedule'
      using errcode = '22023', detail = 'A team plays twice on one day.';
  end if;

  return created;
end;
$$;

comment on function public.admin_create_season is
  'Creates a season with its full schedule in one transaction. Service role only.';

revoke execute on function public.admin_create_season(uuid, integer, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_create_season(uuid, integer, text, jsonb, jsonb)
  to service_role;

-- The simulation worker (server only) ----------------------------------------------------------------------

-- Claims the oldest queued job, or returns no row. Safe to call from several
-- workers at once: rows another worker holds are skipped.
create function public.admin_claim_sim_job(worker_name text)
returns setof public.sim_jobs
language sql
security invoker
set search_path = ''
as $$
  update public.sim_jobs
  set status = 'running',
      worker = worker_name,
      started_at = coalesce(started_at, now()),
      heartbeat_at = now()
  where id = (
    select id from public.sim_jobs
    where status = 'queued'
    order by created_at
    for update skip locked
    limit 1
  )
  returning *;
$$;

revoke execute on function public.admin_claim_sim_job(text)
  from public, anon, authenticated;
grant execute on function public.admin_claim_sim_job(text) to service_role;

-- Commits one simulated day atomically: results, the league's RNG state and the
-- calendar move together, so a crash never leaves half a day behind. A repeat or
-- out-of-order commit is refused, which makes resuming a job safe.
--
-- day_games: [{id, home_score, away_score, overtimes}]
-- day_plays: PlayEvent rows in snake_case, each with game_id
-- day_lines: box score rows in snake_case, each with game_id
create function public.admin_commit_sim_day(
  target_job uuid,
  sim_day integer,
  new_rng_state bigint[],
  day_games jsonb,
  day_plays jsonb,
  day_lines jsonb
)
returns public.sim_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  job public.sim_jobs;
  current_season public.seasons;
  scheduled integer;
  finished integer;
  inserted integer;
begin
  select * into job from public.sim_jobs where id = target_job for update;
  if not found or job.status <> 'running' then
    raise exception 'job_not_running' using errcode = 'P0001';
  end if;

  select * into current_season from public.seasons where id = job.season_id for update;
  if current_season.phase <> 'regular-season' or current_season.day <> sim_day then
    raise exception 'stale_day' using errcode = 'P0001',
      detail = format('The season is at day %s, not %s.', current_season.day, sim_day);
  end if;
  if cardinality(new_rng_state) <> 4 then
    raise exception 'invalid_rng_state' using errcode = '22023';
  end if;

  select count(*) into scheduled
  from public.games
  where season_id = current_season.id and day = sim_day and status = 'scheduled';

  update public.games g
  set status = 'final',
      home_score = x.home_score,
      away_score = x.away_score,
      overtimes = x.overtimes
  from jsonb_to_recordset(day_games) as x(
    id uuid, home_score integer, away_score integer, overtimes integer
  )
  where g.id = x.id
    and g.season_id = current_season.id
    and g.day = sim_day
    and g.status = 'scheduled';
  get diagnostics finished = row_count;
  if finished <> scheduled or finished <> jsonb_array_length(day_games) then
    raise exception 'incomplete_day' using errcode = '22023',
      detail = format('Day %s has %s games to play; got results for %s.',
                      sim_day, scheduled, finished);
  end if;

  insert into public.play_events (
    league_id, game_id, seq, period, clock, kind, team_id, player_id,
    assist_player_id, block_player_id, steal_player_id, out_player_id,
    shot_zone, made, offensive, points, home_score, away_score, transition,
    at_x, at_y
  )
  select current_season.league_id, p.game_id, p.seq, p.period, p.clock, p.kind,
         p.team_id, p.player_id, p.assist_player_id, p.block_player_id,
         p.steal_player_id, p.out_player_id, p.shot_zone, p.made, p.offensive,
         p.points, p.home_score, p.away_score, p.transition, p.at_x, p.at_y
  from jsonb_to_recordset(day_plays) as p(
    game_id uuid, seq integer, period integer, clock integer, kind text,
    team_id uuid, player_id uuid, assist_player_id uuid, block_player_id uuid,
    steal_player_id uuid, out_player_id uuid, shot_zone text, made boolean,
    offensive boolean, points integer, home_score integer, away_score integer,
    transition boolean, at_x numeric, at_y numeric
  )
  join public.games g
    on g.id = p.game_id and g.season_id = current_season.id and g.day = sim_day;
  get diagnostics inserted = row_count;
  if inserted <> jsonb_array_length(day_plays) then
    raise exception 'invalid_day_data' using errcode = '22023',
      detail = 'Some plays belong to games that are not part of this day.';
  end if;

  insert into public.box_score_lines (
    league_id, game_id, player_id, team_id, started, minutes, points, rebounds,
    assists, steals, blocks, turnovers, fouls, fgm, fga, tpm, tpa, ftm, fta
  )
  select current_season.league_id, l.game_id, l.player_id, l.team_id, l.started,
         l.minutes, l.points, l.rebounds, l.assists, l.steals, l.blocks,
         l.turnovers, l.fouls, l.fgm, l.fga, l.tpm, l.tpa, l.ftm, l.fta
  from jsonb_to_recordset(day_lines) as l(
    game_id uuid, player_id uuid, team_id uuid, started boolean, minutes integer,
    points integer, rebounds integer, assists integer, steals integer,
    blocks integer, turnovers integer, fouls integer, fgm integer, fga integer,
    tpm integer, tpa integer, ftm integer, fta integer
  )
  join public.games g
    on g.id = l.game_id and g.season_id = current_season.id and g.day = sim_day;
  get diagnostics inserted = row_count;
  if inserted <> jsonb_array_length(day_lines) then
    raise exception 'invalid_day_data' using errcode = '22023',
      detail = 'Some box score lines belong to games that are not part of this day.';
  end if;

  -- Each box score must add up to its game's score.
  if exists (
    select 1
    from public.games g
    where g.season_id = current_season.id and g.day = sim_day
      and (
        (select coalesce(sum(l.points), 0) from public.box_score_lines l
          where l.game_id = g.id and l.team_id = g.home_team_id) <> g.home_score
        or
        (select coalesce(sum(l.points), 0) from public.box_score_lines l
          where l.game_id = g.id and l.team_id = g.away_team_id) <> g.away_score
      )
  ) then
    raise exception 'inconsistent_box_score' using errcode = '22023';
  end if;

  update public.leagues set rng_state = new_rng_state where id = current_season.league_id;

  update public.seasons
  set day = sim_day + 1,
      phase = case when sim_day + 1 > last_day then 'playoffs' else phase end
  where id = current_season.id
  returning * into current_season;

  update public.sim_jobs
  set days_done = days_done + 1,
      heartbeat_at = now(),
      status = case
        when days_done + 1 >= days_requested or current_season.phase <> 'regular-season'
          then 'done' else status end,
      finished_at = case
        when days_done + 1 >= days_requested or current_season.phase <> 'regular-season'
          then now() else finished_at end
  where id = job.id
  returning * into job;
  return job;
end;
$$;

comment on function public.admin_commit_sim_day is
  'Commits one simulated day (results, plays, box scores, RNG state, calendar and job progress) in one transaction. Service role only.';

revoke execute on function public.admin_commit_sim_day(uuid, integer, bigint[], jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_commit_sim_day(uuid, integer, bigint[], jsonb, jsonb, jsonb)
  to service_role;

create function public.admin_fail_sim_job(target_job uuid, message text)
returns public.sim_jobs
language sql
security invoker
set search_path = ''
as $$
  update public.sim_jobs
  set status = 'failed',
      error = left(coalesce(message, 'Unknown error'), 500),
      finished_at = now()
  where id = target_job and status in ('queued', 'running')
  returning *;
$$;

revoke execute on function public.admin_fail_sim_job(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_fail_sim_job(uuid, text) to service_role;

-- Puts jobs whose worker went quiet back in the queue. Committed days are never
-- repeated, so the next worker continues where the last one stopped.
create function public.admin_requeue_stale_sim_jobs(max_age interval)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with requeued as (
    update public.sim_jobs
    set status = 'queued', worker = null
    where status = 'running' and heartbeat_at < now() - max_age
    returning 1
  )
  select count(*)::integer from requeued;
$$;

revoke execute on function public.admin_requeue_stale_sim_jobs(interval)
  from public, anon, authenticated;
grant execute on function public.admin_requeue_stale_sim_jobs(interval) to service_role;
