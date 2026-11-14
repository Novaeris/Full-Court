-- Injuries (Phase 24). The server rolls a day's injuries (pure code in
-- game-engine) and stores them here. An injured player stays on his team and
-- his roster, but doesn't play until `injury_days` has run down, one for each
-- simulated day. Ratings are never changed by an injury.

alter table public.players
  add column injury_days smallint not null default 0
    check (injury_days between 0 and 200),
  add column injury_kind text,
  add check (injury_days = 0 or injury_kind is not null);

-- Injuries are applied once for each day: the season remembers the last day.
alter table public.seasons
  add column injuries_through_day smallint not null default 0;

-- Every injury, for the league's history.
create table public.player_injuries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  player_id uuid not null,
  team_id uuid not null,
  -- The day of the game in which he was hurt (his first day out is the next).
  day smallint not null,
  days smallint not null check (days >= 1),
  kind text not null,
  created_at timestamptz not null default now(),
  foreign key (league_id, player_id)
    references public.players (league_id, id) on delete cascade,
  foreign key (league_id, team_id)
    references public.teams (league_id, id) on delete cascade
);

create index player_injuries_season_idx on public.player_injuries (season_id, day);
create index player_injuries_player_idx on public.player_injuries (league_id, player_id);
create index player_injuries_team_idx on public.player_injuries (league_id, team_id);

alter table public.player_injuries enable row level security;
grant select on public.player_injuries to authenticated;
create policy "player_injuries: league owner can read"
  on public.player_injuries for select to authenticated
  using (app_private.owns_league(league_id));

-- After a simulated day: everyone already hurt is a day closer to playing, then
-- the day's new injuries are stored ({player_id, team_id, days, kind}). Asking
-- again for a day that was already applied does nothing, so a retry is safe.
create function public.admin_apply_injuries(
  target_season uuid,
  sim_day integer,
  new_injuries jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
  made integer;
begin
  select * into current_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(new_injuries) is distinct from 'array' then
    raise exception 'invalid_injuries' using errcode = '22023';
  end if;
  if sim_day <= current_season.injuries_through_day then
    return 0;
  end if;

  update public.players
  set injury_days = injury_days - 1,
      injury_kind = case when injury_days - 1 <= 0 then null else injury_kind end
  where league_id = current_season.league_id and injury_days > 0;

  with hurt as (
    select h.player_id, h.team_id, h.days, h.kind
    from jsonb_to_recordset(new_injuries)
      as h(player_id uuid, team_id uuid, days smallint, kind text)
    join public.players p
      on p.id = h.player_id and p.league_id = current_season.league_id
         and p.status = 'active' and p.team_id = h.team_id
    where h.days >= 1
  ), applied as (
    update public.players p
    set injury_days = hurt.days, injury_kind = hurt.kind
    from hurt where p.id = hurt.player_id
    returning p.id
  )
  insert into public.player_injuries (league_id, season_id, player_id, team_id, day, days, kind)
  select current_season.league_id, target_season, hurt.player_id, hurt.team_id,
         sim_day, hurt.days, hurt.kind
  from hurt;
  get diagnostics made = row_count;

  update public.seasons set injuries_through_day = sim_day where id = target_season;
  return made;
end;
$$;

comment on function public.admin_apply_injuries is
  'Heals a day and stores the day''s new injuries, once for each day. Service role only.';

-- A new season starts with everyone healthy: the offseason heals them all.
create function public.admin_heal_injuries(target_season uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
  healed integer;
begin
  select * into current_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  update public.players
  set injury_days = 0, injury_kind = null
  where league_id = current_season.league_id and injury_days > 0;
  get diagnostics healed = row_count;
  return healed;
end;
$$;

comment on function public.admin_heal_injuries is
  'Heals every injured player in the season''s league. Service role only.';

revoke execute on function public.admin_apply_injuries(uuid, integer, jsonb),
  public.admin_heal_injuries(uuid) from public, anon, authenticated;
grant execute on function public.admin_apply_injuries(uuid, integer, jsonb),
  public.admin_heal_injuries(uuid) to service_role;
