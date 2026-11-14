-- Statistics for the season being played (Phase 27). The box score lines are
-- kept for the current season only (archiving turns them into
-- player_season_stats), so the league's leaders and a player's line come from
-- adding them up here. The function runs as the caller, so row-level security
-- still decides what an owner can see: their own league's games and lines.

create function public.player_season_totals(
  target_season uuid,
  playoffs boolean default false
)
returns table (
  player_id uuid,
  team_id uuid,
  games integer,
  started integer,
  minutes integer,
  points integer,
  rebounds integer,
  assists integer,
  steals integer,
  blocks integer,
  turnovers integer,
  fouls integer,
  fgm integer,
  fga integer,
  tpm integer,
  tpa integer,
  ftm integer,
  fta integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.player_id, l.team_id,
         count(*)::integer,
         (count(*) filter (where l.started))::integer,
         sum(l.minutes)::integer, sum(l.points)::integer, sum(l.rebounds)::integer,
         sum(l.assists)::integer, sum(l.steals)::integer, sum(l.blocks)::integer,
         sum(l.turnovers)::integer, sum(l.fouls)::integer,
         sum(l.fgm)::integer, sum(l.fga)::integer, sum(l.tpm)::integer,
         sum(l.tpa)::integer, sum(l.ftm)::integer, sum(l.fta)::integer
  from public.box_score_lines l
  join public.games g on g.league_id = l.league_id and g.id = l.game_id
  where g.season_id = target_season
    and g.status = 'final'
    -- Playoff games have a round; regular-season games don't.
    and (g.round is not null) = playoffs
  group by l.player_id, l.team_id;
$$;

comment on function public.player_season_totals is
  'Each player''s totals for a season''s regular-season (or playoff) games, from the box score lines.';
revoke execute on function public.player_season_totals(uuid, boolean) from public, anon;
grant execute on function public.player_season_totals(uuid, boolean) to authenticated, service_role;
