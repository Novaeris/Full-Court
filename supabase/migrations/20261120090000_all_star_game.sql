-- The All-Star Game (Phase 29). Half way through the regular season the worker
-- picks the league's best players, plays one game between two squads and stores
-- the result here. It is not a game of the league's schedule, so it has its own
-- tables, and they are kept for good (they hang off the season, which is never
-- deleted, and not off its games, which are). The owner can only read them.

create table public.all_star_games (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  -- The season's day it was played before.
  day smallint not null,
  name_a text not null check (char_length(name_a) between 1 and 60),
  name_b text not null check (char_length(name_b) between 1 and 60),
  score_a smallint not null check (score_a between 0 and 400),
  score_b smallint not null check (score_b between 0 and 400),
  overtimes smallint not null default 0 check (overtimes between 0 and 20),
  mvp_player_id uuid,
  created_at timestamptz not null default now(),
  unique (season_id)
);

create table public.all_star_players (
  game_id uuid not null references public.all_star_games (id) on delete cascade,
  league_id uuid not null,
  player_id uuid not null,
  -- The team he played for in the season, when he was picked.
  team_id uuid,
  squad text not null check (squad in ('a', 'b')),
  starter boolean not null,
  captain boolean not null default false,
  minutes smallint not null check (minutes between 0 and 100),
  points smallint not null check (points >= 0),
  rebounds smallint not null check (rebounds >= 0),
  assists smallint not null check (assists >= 0),
  steals smallint not null check (steals >= 0),
  blocks smallint not null check (blocks >= 0),
  primary key (game_id, player_id),
  foreign key (league_id, player_id)
    references public.players (league_id, id) on delete cascade
);

create index all_star_games_league_idx on public.all_star_games (league_id);
create index all_star_players_player_idx on public.all_star_players (league_id, player_id);

alter table public.all_star_games enable row level security;
alter table public.all_star_players enable row level security;
grant select on public.all_star_games, public.all_star_players to authenticated;
create policy "all_star_games: league owner can read"
  on public.all_star_games for select to authenticated
  using (app_private.owns_league(league_id));
create policy "all_star_players: league owner can read"
  on public.all_star_players for select to authenticated
  using (app_private.owns_league(league_id));

-- Stores the game and its players, once for each season: asking again for a
-- season that has one does nothing (a retry after a failure is safe) and returns
-- false. `payload`: {day, name_a, name_b, score_a, score_b, overtimes,
-- mvp_player_id, players: [{player_id, team_id, squad, starter, captain, minutes,
-- points, rebounds, assists, steals, blocks}]}.
create function public.admin_record_all_star_game(target_season uuid, payload jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
  game_id uuid;
  entry_count integer;
begin
  select * into current_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(payload -> 'players') is distinct from 'array'
     or jsonb_array_length(payload -> 'players') not between 10 and 30 then
    raise exception 'invalid_all_star_game' using errcode = '22023';
  end if;
  if exists (select 1 from public.all_star_games where season_id = target_season) then
    return false;
  end if;

  insert into public.all_star_games (
    league_id, season_id, day, name_a, name_b, score_a, score_b, overtimes, mvp_player_id
  )
  values (
    current_season.league_id, target_season, (payload ->> 'day')::smallint,
    payload ->> 'name_a', payload ->> 'name_b',
    (payload ->> 'score_a')::smallint, (payload ->> 'score_b')::smallint,
    coalesce((payload ->> 'overtimes')::smallint, 0),
    (payload ->> 'mvp_player_id')::uuid
  )
  returning id into game_id;

  insert into public.all_star_players (
    game_id, league_id, player_id, team_id, squad, starter, captain,
    minutes, points, rebounds, assists, steals, blocks
  )
  select game_id, current_season.league_id, p.player_id, p.team_id, p.squad,
         coalesce(p.starter, false), coalesce(p.captain, false),
         p.minutes, p.points, p.rebounds, p.assists, p.steals, p.blocks
  from jsonb_to_recordset(payload -> 'players') as p(
    player_id uuid, team_id uuid, squad text, starter boolean, captain boolean,
    minutes smallint, points smallint, rebounds smallint, assists smallint,
    steals smallint, blocks smallint
  );
  get diagnostics entry_count = row_count;
  if entry_count <> jsonb_array_length(payload -> 'players') then
    raise exception 'invalid_all_star_game' using errcode = '22023';
  end if;
  return true;
end;
$$;

comment on function public.admin_record_all_star_game is
  'Stores a season''s All-Star Game and its players, once. Service role only.';
revoke execute on function public.admin_record_all_star_game(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_record_all_star_game(uuid, jsonb) to service_role;
