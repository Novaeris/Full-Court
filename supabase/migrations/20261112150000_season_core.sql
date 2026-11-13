-- Season core: seasons, games, replays, box scores, season history and the
-- simulation queue.
--
-- Everything hangs off a league and is deleted with it. Clients can read their
-- own league's rows and nothing else. Every write comes from the service role:
-- the server creates a season and its schedule, and the simulation worker
-- claims jobs and commits one simulated day at a time. Players and teams are
-- referenced with (league_id, id) pairs, so a row can never point into another
-- league.
--
-- Storage is the main constraint (a league has at most 50 seasons, an account
-- at most 5 leagues), so data is kept in tiers:
--
--   * The CURRENT season keeps its games, box scores and a replay recipe for
--     every game. A game's plays are not stored: the engine is deterministic,
--     so the recipe (rosters as they were, the RNG state and the engine
--     version) replays the game exactly. That is about 2 MB a season, against
--     105 MB for one row per play.
--   * When a season is archived (admin_archive_season), its detail is
--     summarised into permanent history (player season totals, team season
--     records, awards) and then deleted. Per-game averages are totals divided
--     by games played, so they need no storage of their own.
--
-- What archiving does not store can never be recovered, so the history tables
-- carry everything we want to keep: change them before a season is archived.

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
  -- Set when the season's detail was summarised into history and deleted.
  archived_at timestamptz,
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

-- Game replays ----------------------------------------------------------------------------------

-- One recipe per game of the current season: replaying it with the game engine
-- gives back the exact plays, score and box score. `snapshot` is the two
-- teams' rosters, ratings and strategies as they were when the game was played
-- (ReplaySnapshot in @fullcourt/game-engine), `rng_state` the league's RNG
-- state just before it, and `engine_version` the simulation version (ENGINE_VERSION).
-- After an engine change the older recipes can no longer be replayed exactly;
-- their scores and box scores stay.
create table public.game_replays (
  game_id uuid primary key,
  league_id uuid not null references public.leagues (id) on delete cascade,
  engine_version smallint not null check (engine_version >= 1),
  rng_state bigint[] not null check (cardinality(rng_state) = 4),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  foreign key (league_id, game_id)
    references public.games (league_id, id) on delete cascade
);

create index game_replays_league_idx on public.game_replays (league_id);

-- Box scores ---------------------------------------------------------------------------------------

-- One row per player who took the court, derived from the plays when the day
-- is committed. Totals add up to the final score (checked on commit). Kept for
-- the current season only; archiving turns them into player_season_stats.
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

-- Foreign keys that cascade or restrict need an index on the referencing columns,
-- or deleting a league (or a game) scans the table once per row it removes.
create index box_score_lines_team_idx on public.box_score_lines (league_id, team_id);

-- Season history (kept for every archived season) ------------------------------------------------------

-- A player's totals for one season with one team (a traded player has a row per
-- team). Per-game averages are these totals divided by `games_played`.
-- The single-game highs (`high_*`, each with the day it happened and the
-- opponent) and the double- and triple-double counts can't be recovered from
-- totals, so they are captured here, from the box scores, at archive time.
-- A season high is the best of these across the league, and a career high the
-- best across seasons: both are queries, not tables.
create table public.player_season_stats (
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_id uuid not null,
  player_id uuid not null,
  team_id uuid not null,
  games_played smallint not null check (games_played >= 1),
  games_started smallint not null check (games_started between 0 and games_played),
  minutes integer not null check (minutes >= 0),
  points integer not null check (points >= 0),
  rebounds integer not null check (rebounds >= 0),
  assists integer not null check (assists >= 0),
  steals integer not null check (steals >= 0),
  blocks integer not null check (blocks >= 0),
  turnovers integer not null check (turnovers >= 0),
  fouls integer not null check (fouls >= 0),
  fgm integer not null check (fgm >= 0),
  fga integer not null check (fga >= 0),
  tpm integer not null check (tpm >= 0),
  tpa integer not null check (tpa >= 0),
  ftm integer not null check (ftm >= 0),
  fta integer not null check (fta >= 0),
  high_points smallint not null check (high_points >= 0),
  high_points_day smallint not null check (high_points_day >= 1),
  high_points_opponent_id uuid not null,
  high_rebounds smallint not null check (high_rebounds >= 0),
  high_rebounds_day smallint not null check (high_rebounds_day >= 1),
  high_rebounds_opponent_id uuid not null,
  high_assists smallint not null check (high_assists >= 0),
  high_assists_day smallint not null check (high_assists_day >= 1),
  high_assists_opponent_id uuid not null,
  high_steals smallint not null check (high_steals >= 0),
  high_steals_day smallint not null check (high_steals_day >= 1),
  high_steals_opponent_id uuid not null,
  high_blocks smallint not null check (high_blocks >= 0),
  high_blocks_day smallint not null check (high_blocks_day >= 1),
  high_blocks_opponent_id uuid not null,
  -- Three-pointers made.
  high_threes smallint not null check (high_threes >= 0),
  high_threes_day smallint not null check (high_threes_day >= 1),
  high_threes_opponent_id uuid not null,
  double_doubles smallint not null check (double_doubles between 0 and games_played),
  triple_doubles smallint not null check (triple_doubles between 0 and double_doubles),
  primary key (season_id, player_id, team_id),
  foreign key (league_id, season_id)
    references public.seasons (league_id, id) on delete cascade,
  foreign key (league_id, player_id)
    references public.players (league_id, id),
  foreign key (league_id, team_id)
    references public.teams (league_id, id) on delete cascade
);

create index player_season_stats_player_idx
  on public.player_season_stats (league_id, player_id);
create index player_season_stats_team_idx
  on public.player_season_stats (league_id, team_id);

-- A team's record and scoring for one season, with where it finished.
create table public.team_season_stats (
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_id uuid not null,
  team_id uuid not null,
  wins smallint not null check (wins >= 0),
  losses smallint not null check (losses >= 0),
  home_wins smallint not null check (home_wins >= 0),
  home_losses smallint not null check (home_losses >= 0),
  division_wins smallint not null check (division_wins >= 0),
  division_losses smallint not null check (division_losses >= 0),
  conference_wins smallint not null check (conference_wins >= 0),
  conference_losses smallint not null check (conference_losses >= 0),
  points_for integer not null check (points_for >= 0),
  points_against integer not null check (points_against >= 0),
  -- Where the team finished, 1 = best, by the standings rules.
  rank_overall smallint not null check (rank_overall >= 1),
  rank_conference smallint not null check (rank_conference >= 1),
  rank_division smallint not null check (rank_division >= 1),
  -- Single-game highs and lows, each with the day it happened and the opponent.
  -- Null for a team that played no games (or has no win or no loss yet).
  -- Margins are positive: the size of the biggest win and of the worst loss.
  high_points smallint,
  high_points_day smallint,
  high_points_opponent_id uuid,
  low_points smallint,
  low_points_day smallint,
  low_points_opponent_id uuid,
  high_points_allowed smallint,
  high_points_allowed_day smallint,
  high_points_allowed_opponent_id uuid,
  low_points_allowed smallint,
  low_points_allowed_day smallint,
  low_points_allowed_opponent_id uuid,
  biggest_win smallint,
  biggest_win_day smallint,
  biggest_win_opponent_id uuid,
  worst_loss smallint,
  worst_loss_day smallint,
  worst_loss_opponent_id uuid,
  longest_win_streak smallint not null default 0 check (longest_win_streak >= 0),
  longest_loss_streak smallint not null default 0 check (longest_loss_streak >= 0),
  primary key (season_id, team_id),
  foreign key (league_id, season_id)
    references public.seasons (league_id, id) on delete cascade,
  foreign key (league_id, team_id)
    references public.teams (league_id, id) on delete cascade,
  check (home_wins <= wins and home_losses <= losses),
  check (division_wins <= wins and division_losses <= losses),
  check (conference_wins <= wins and conference_losses <= losses),
  -- Each high or low has its day and opponent, or none of the three.
  check ((high_points is null) = (high_points_day is null)
     and (high_points is null) = (high_points_opponent_id is null)),
  check ((low_points is null) = (low_points_day is null)
     and (low_points is null) = (low_points_opponent_id is null)),
  check ((high_points_allowed is null) = (high_points_allowed_day is null)
     and (high_points_allowed is null) = (high_points_allowed_opponent_id is null)),
  check ((low_points_allowed is null) = (low_points_allowed_day is null)
     and (low_points_allowed is null) = (low_points_allowed_opponent_id is null)),
  check ((biggest_win is null) = (biggest_win_day is null)
     and (biggest_win is null) = (biggest_win_opponent_id is null)),
  check ((worst_loss is null) = (worst_loss_day is null)
     and (worst_loss is null) = (worst_loss_opponent_id is null))
);

create index team_season_stats_team_idx
  on public.team_season_stats (league_id, team_id);

-- Who won what: the champion, the most valuable player and so on. The award
-- names are free text so new awards need no migration. Written by the server
-- when the playoffs and awards exist.
create table public.season_awards (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_id uuid not null,
  award text not null check (award ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  team_id uuid,
  player_id uuid,
  created_at timestamptz not null default now(),
  foreign key (league_id, season_id)
    references public.seasons (league_id, id) on delete cascade,
  foreign key (league_id, team_id)
    references public.teams (league_id, id) on delete cascade,
  foreign key (league_id, player_id)
    references public.players (league_id, id),
  check (team_id is not null or player_id is not null)
);

create index season_awards_season_idx on public.season_awards (season_id);
create index season_awards_team_idx on public.season_awards (league_id, team_id);
create index season_awards_player_idx on public.season_awards (league_id, player_id);

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
alter table public.game_replays enable row level security;
alter table public.player_season_stats enable row level security;
alter table public.team_season_stats enable row level security;
alter table public.season_awards enable row level security;
alter table public.box_score_lines enable row level security;
alter table public.sim_jobs enable row level security;

grant select on
  public.seasons, public.games, public.game_replays, public.box_score_lines,
  public.player_season_stats, public.team_season_stats, public.season_awards,
  public.sim_jobs
to authenticated;

create policy "seasons: league owner can read"
  on public.seasons for select to authenticated
  using (app_private.owns_league(league_id));
create policy "games: league owner can read"
  on public.games for select to authenticated
  using (app_private.owns_league(league_id));
create policy "game_replays: league owner can read"
  on public.game_replays for select to authenticated
  using (app_private.owns_league(league_id));
create policy "player_season_stats: league owner can read"
  on public.player_season_stats for select to authenticated
  using (app_private.owns_league(league_id));
create policy "team_season_stats: league owner can read"
  on public.team_season_stats for select to authenticated
  using (app_private.owns_league(league_id));
create policy "season_awards: league owner can read"
  on public.season_awards for select to authenticated
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
-- A league can play at most this many seasons. The detail of each is archived
-- into a small summary, so history stays cheap, but it is not unbounded.
create function public.season_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 50 $$;

grant execute on function public.season_limit() to authenticated, service_role;

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

  if (select count(*) from public.seasons where league_id = target_league)
     >= public.season_limit() then
    raise exception 'season_limit_reached' using errcode = 'P0001',
      detail = format('A league can play up to %s seasons.', public.season_limit());
  end if;
  -- Detail is kept for one season at a time: archive the last one first.
  if exists (
    select 1 from public.seasons
    where league_id = target_league and archived_at is null
  ) then
    raise exception 'previous_season_not_archived' using errcode = 'P0001';
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
-- day_replays: [{game_id, engine_version, rng_state: [4 numbers], snapshot}], one per game
-- day_lines: box score rows in snake_case, each with game_id
create function public.admin_commit_sim_day(
  target_job uuid,
  sim_day integer,
  new_rng_state bigint[],
  day_games jsonb,
  day_replays jsonb,
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

  insert into public.game_replays (league_id, game_id, engine_version, rng_state, snapshot)
  select current_season.league_id, r.game_id, r.engine_version,
         array(select jsonb_array_elements_text(r.rng_state)::bigint),
         r.snapshot
  from jsonb_to_recordset(day_replays) as r(
    game_id uuid, engine_version integer, rng_state jsonb, snapshot jsonb
  )
  join public.games g
    on g.id = r.game_id and g.season_id = current_season.id and g.day = sim_day;
  get diagnostics inserted = row_count;
  if inserted <> jsonb_array_length(day_replays) or inserted <> finished then
    raise exception 'invalid_day_data' using errcode = '22023',
      detail = 'The day needs exactly one replay for each of its games.';
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
  'Commits one simulated day (results, replays, box scores, RNG state, calendar and job progress) in one transaction. Service role only.';

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

-- Archiving a season (server only) ---------------------------------------------------------------------------

-- Summarises a finished season into permanent history, then deletes its detail
-- (games, box scores and replays), in one transaction.
--
-- `standings_order` is every team of the league, best first, as ranked by the
-- standings rules in @fullcourt/game-rules (rankStandings). The records and
-- totals themselves are computed here from the stored games and box scores, so
-- they can't disagree with them; before anything is deleted, each team's points
-- must equal the sum of its players' points and wins must equal losses.
--
-- The season must be `complete` (playoffs included), and the next season can't
-- be created until this has run. What isn't summarised here is lost for good.
create function public.admin_archive_season(
  target_season uuid,
  standings_order uuid[]
)
returns public.seasons
language plpgsql
security invoker
set search_path = ''
as $$
declare
  archived public.seasons;
  team_total integer;
begin
  select * into archived from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if archived.archived_at is not null then
    raise exception 'season_already_archived' using errcode = 'P0001';
  end if;
  if archived.phase <> 'complete' then
    raise exception 'season_not_complete' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.games where season_id = target_season and status <> 'final'
  ) then
    raise exception 'season_has_unplayed_games' using errcode = 'P0001';
  end if;

  select count(*) into team_total from public.teams where league_id = archived.league_id;
  if standings_order is null
     or cardinality(standings_order) <> team_total
     or (select count(distinct t) from unnest(standings_order) as t) <> team_total
     or exists (
       select 1 from unnest(standings_order) as t
       where not exists (
         select 1 from public.teams
         where id = t and league_id = archived.league_id
       )
     ) then
    raise exception 'invalid_standings_order' using errcode = '22023';
  end if;

  -- Team records, scoring, single-game highs and lows, and streaks. Ties for a
  -- high or low go to the earliest day (then the game id), so it is repeatable.
  insert into public.team_season_stats (
    league_id, season_id, team_id, wins, losses, home_wins, home_losses,
    division_wins, division_losses, conference_wins, conference_losses,
    points_for, points_against, rank_overall, rank_conference, rank_division,
    high_points, high_points_day, high_points_opponent_id,
    low_points, low_points_day, low_points_opponent_id,
    high_points_allowed, high_points_allowed_day, high_points_allowed_opponent_id,
    low_points_allowed, low_points_allowed_day, low_points_allowed_opponent_id,
    biggest_win, biggest_win_day, biggest_win_opponent_id,
    worst_loss, worst_loss_day, worst_loss_opponent_id,
    longest_win_streak, longest_loss_streak
  )
  with results as (
    select g.id as game_id, g.day, g.home_team_id as team_id,
           g.away_team_id as opponent_id, true as at_home,
           g.home_score as scored, g.away_score as allowed,
           g.home_score > g.away_score as won
    from public.games g where g.season_id = target_season
    union all
    select g.id, g.day, g.away_team_id, g.home_team_id, false,
           g.away_score, g.home_score, g.away_score > g.home_score
    from public.games g where g.season_id = target_season
  ),
  totals as (
    select r.team_id,
           count(*) filter (where r.won) as wins,
           count(*) filter (where not r.won) as losses,
           count(*) filter (where r.won and r.at_home) as home_wins,
           count(*) filter (where not r.won and r.at_home) as home_losses,
           count(*) filter (where r.won and t.division_id = o.division_id) as division_wins,
           count(*) filter (where not r.won and t.division_id = o.division_id) as division_losses,
           count(*) filter (where r.won and t.conference_id = o.conference_id) as conference_wins,
           count(*) filter (where not r.won and t.conference_id = o.conference_id) as conference_losses,
           sum(r.scored) as points_for,
           sum(r.allowed) as points_against,
           max(r.scored) as high_points,
           (array_agg(r.day order by r.scored desc, r.day, r.game_id))[1] as high_points_day,
           (array_agg(r.opponent_id order by r.scored desc, r.day, r.game_id))[1] as high_points_opponent_id,
           min(r.scored) as low_points,
           (array_agg(r.day order by r.scored, r.day, r.game_id))[1] as low_points_day,
           (array_agg(r.opponent_id order by r.scored, r.day, r.game_id))[1] as low_points_opponent_id,
           max(r.allowed) as high_points_allowed,
           (array_agg(r.day order by r.allowed desc, r.day, r.game_id))[1] as high_points_allowed_day,
           (array_agg(r.opponent_id order by r.allowed desc, r.day, r.game_id))[1] as high_points_allowed_opponent_id,
           min(r.allowed) as low_points_allowed,
           (array_agg(r.day order by r.allowed, r.day, r.game_id))[1] as low_points_allowed_day,
           (array_agg(r.opponent_id order by r.allowed, r.day, r.game_id))[1] as low_points_allowed_opponent_id,
           max(r.scored - r.allowed) filter (where r.won) as biggest_win,
           (array_agg(r.day order by (r.scored - r.allowed) desc, r.day, r.game_id)
              filter (where r.won))[1] as biggest_win_day,
           (array_agg(r.opponent_id order by (r.scored - r.allowed) desc, r.day, r.game_id)
              filter (where r.won))[1] as biggest_win_opponent_id,
           max(r.allowed - r.scored) filter (where not r.won) as worst_loss,
           (array_agg(r.day order by (r.allowed - r.scored) desc, r.day, r.game_id)
              filter (where not r.won))[1] as worst_loss_day,
           (array_agg(r.opponent_id order by (r.allowed - r.scored) desc, r.day, r.game_id)
              filter (where not r.won))[1] as worst_loss_opponent_id
    from results r
    join public.teams t on t.id = r.team_id
    join public.teams o on o.id = r.opponent_id
    group by r.team_id
  ),
  -- Longest runs of wins and of losses: consecutive games share a group when
  -- the row number overall and the row number within the result move together.
  runs as (
    select team_id, won, count(*) as length
    from (
      select r.team_id, r.won,
             row_number() over (partition by r.team_id order by r.day)
             - row_number() over (partition by r.team_id, r.won order by r.day) as run
      from results r
    ) numbered
    group by team_id, won, run
  ),
  streaks as (
    select team_id,
           coalesce(max(length) filter (where won), 0) as longest_win_streak,
           coalesce(max(length) filter (where not won), 0) as longest_loss_streak
    from runs
    group by team_id
  ),
  ordered as (
    select u.team_id, u.place::integer as rank_overall
    from unnest(standings_order) with ordinality as u(team_id, place)
  )
  select archived.league_id, target_season, t.id,
         coalesce(a.wins, 0), coalesce(a.losses, 0),
         coalesce(a.home_wins, 0), coalesce(a.home_losses, 0),
         coalesce(a.division_wins, 0), coalesce(a.division_losses, 0),
         coalesce(a.conference_wins, 0), coalesce(a.conference_losses, 0),
         coalesce(a.points_for, 0), coalesce(a.points_against, 0),
         o.rank_overall,
         row_number() over (partition by t.conference_id order by o.rank_overall),
         row_number() over (partition by t.division_id order by o.rank_overall),
         a.high_points, a.high_points_day, a.high_points_opponent_id,
         a.low_points, a.low_points_day, a.low_points_opponent_id,
         a.high_points_allowed, a.high_points_allowed_day, a.high_points_allowed_opponent_id,
         a.low_points_allowed, a.low_points_allowed_day, a.low_points_allowed_opponent_id,
         a.biggest_win, a.biggest_win_day, a.biggest_win_opponent_id,
         a.worst_loss, a.worst_loss_day, a.worst_loss_opponent_id,
         coalesce(s.longest_win_streak, 0), coalesce(s.longest_loss_streak, 0)
  from public.teams t
  join ordered o on o.team_id = t.id
  left join totals a on a.team_id = t.id
  left join streaks s on s.team_id = t.id
  where t.league_id = archived.league_id;

  -- Player totals and single-game highs, plus what totals can't give back later.
  insert into public.player_season_stats (
    league_id, season_id, player_id, team_id, games_played, games_started,
    minutes, points, rebounds, assists, steals, blocks, turnovers, fouls,
    fgm, fga, tpm, tpa, ftm, fta,
    high_points, high_points_day, high_points_opponent_id,
    high_rebounds, high_rebounds_day, high_rebounds_opponent_id,
    high_assists, high_assists_day, high_assists_opponent_id,
    high_steals, high_steals_day, high_steals_opponent_id,
    high_blocks, high_blocks_day, high_blocks_opponent_id,
    high_threes, high_threes_day, high_threes_opponent_id,
    double_doubles, triple_doubles
  )
  select archived.league_id, target_season, l.player_id, l.team_id,
         count(*), count(*) filter (where l.started),
         sum(l.minutes), sum(l.points), sum(l.rebounds), sum(l.assists),
         sum(l.steals), sum(l.blocks), sum(l.turnovers), sum(l.fouls),
         sum(l.fgm), sum(l.fga), sum(l.tpm), sum(l.tpa), sum(l.ftm), sum(l.fta),
         max(l.points),
         (array_agg(g.day order by l.points desc, g.day, g.id))[1],
         (array_agg(cats.opponent_id order by l.points desc, g.day, g.id))[1],
         max(l.rebounds),
         (array_agg(g.day order by l.rebounds desc, g.day, g.id))[1],
         (array_agg(cats.opponent_id order by l.rebounds desc, g.day, g.id))[1],
         max(l.assists),
         (array_agg(g.day order by l.assists desc, g.day, g.id))[1],
         (array_agg(cats.opponent_id order by l.assists desc, g.day, g.id))[1],
         max(l.steals),
         (array_agg(g.day order by l.steals desc, g.day, g.id))[1],
         (array_agg(cats.opponent_id order by l.steals desc, g.day, g.id))[1],
         max(l.blocks),
         (array_agg(g.day order by l.blocks desc, g.day, g.id))[1],
         (array_agg(cats.opponent_id order by l.blocks desc, g.day, g.id))[1],
         max(l.tpm),
         (array_agg(g.day order by l.tpm desc, g.day, g.id))[1],
         (array_agg(cats.opponent_id order by l.tpm desc, g.day, g.id))[1],
         count(*) filter (where cats.n >= 2),
         count(*) filter (where cats.n >= 3)
  from public.box_score_lines l
  join public.games g on g.id = l.game_id
  cross join lateral (
    select (l.points >= 10)::integer + (l.rebounds >= 10)::integer
         + (l.assists >= 10)::integer + (l.steals >= 10)::integer
         + (l.blocks >= 10)::integer as n,
           case when l.team_id = g.home_team_id then g.away_team_id
                else g.home_team_id end as opponent_id
  ) cats
  where g.season_id = target_season
  group by l.player_id, l.team_id;

  -- Nothing is deleted unless the summaries agree with each other.
  if exists (
    select 1 from public.team_season_stats t
    where t.season_id = target_season
      and t.points_for <> coalesce((
        select sum(p.points) from public.player_season_stats p
        where p.season_id = target_season and p.team_id = t.team_id
      ), 0)
  ) or (
    select coalesce(sum(wins), 0) <> coalesce(sum(losses), 0)
    from public.team_season_stats where season_id = target_season
  ) then
    raise exception 'inconsistent_archive' using errcode = '22023';
  end if;

  -- Deleting the games removes their box scores and replays with them.
  delete from public.games where season_id = target_season;

  update public.seasons set archived_at = now()
  where id = target_season
  returning * into archived;
  return archived;
end;
$$;

comment on function public.admin_archive_season is
  'Summarises a complete season into player and team history, checks the summaries, then deletes its games, box scores and replays. Service role only.';

revoke execute on function public.admin_archive_season(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.admin_archive_season(uuid, uuid[]) to service_role;
