-- Draft picks as trade assets (Phase 21). A team holds a pick for the next two
-- drafts, one in each round, from the start; trading moves the right to it.
-- When the lottery is held, each pick goes to the team that holds the right.

-- `season_year` is the year of the draft, as in `draft_picks`. `original_team_id`
-- is the team whose finish decides where the pick falls.
create table public.pick_rights (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_year smallint not null,
  round smallint not null check (round between 1 and 2),
  original_team_id uuid not null,
  team_id uuid not null,
  foreign key (league_id, original_team_id)
    references public.teams (league_id, id) on delete cascade,
  foreign key (league_id, team_id)
    references public.teams (league_id, id) on delete cascade,
  unique (league_id, season_year, round, original_team_id)
);

create index pick_rights_team_idx on public.pick_rights (league_id, team_id, season_year);

alter table public.pick_rights enable row level security;
grant select on public.pick_rights to authenticated;
create policy "pick_rights: league owner can read"
  on public.pick_rights for select to authenticated
  using (app_private.owns_league(league_id));

-- Where a pick came from, once it is made (null: the team's own).
alter table public.draft_picks add column original_team_id uuid;

-- The picks each side gave in a trade.
alter table public.trades
  add column gave_picks_a uuid[] not null default '{}',
  add column gave_picks_b uuid[] not null default '{}';

-- Gives every team its picks for the next two drafts (the years after the
-- season's own), if it doesn't have them yet. Safe to call at any time.
create function public.admin_ensure_pick_rights(target_season uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
  created integer;
begin
  select * into current_season from public.seasons where id = target_season;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  insert into public.pick_rights (league_id, season_year, round, original_team_id, team_id)
  select t.league_id, y.year, r.round, t.id, t.id
  from public.teams t
  cross join (values (current_season.year + 1), (current_season.year + 2)) as y(year)
  cross join (values (1), (2)) as r(round)
  where t.league_id = current_season.league_id
  on conflict (league_id, season_year, round, original_team_id) do nothing;
  get diagnostics created = row_count;
  return created;
end;
$$;

comment on function public.admin_ensure_pick_rights is
  'Creates each team''s picks for the next two drafts. Service role only.';
revoke execute on function public.admin_ensure_pick_rights(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_ensure_pick_rights(uuid) to service_role;

-- The lottery stores each pick under the team that holds it; `original_team_id`
-- (optional in a slot) says whose finish it was.
create or replace function public.admin_hold_lottery(target_season uuid, slots jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
  created integer;
begin
  select * into current_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if current_season.phase <> 'offseason' or current_season.stage <> 'draft' then
    raise exception 'wrong_stage' using errcode = 'P0001';
  end if;
  if jsonb_typeof(slots) is distinct from 'array' or jsonb_array_length(slots) = 0 then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.draft_picks
    where league_id = current_season.league_id and season_year = current_season.year
  ) then
    raise exception 'lottery_already_held' using errcode = 'P0001';
  end if;

  insert into public.draft_picks (
    league_id, season_year, pick, round, team_id, player_id,
    finish_rank, expected_pick, lottery_odds, original_team_id
  )
  select current_season.league_id, current_season.year, s.pick, s.round, s.team_id,
         null, s.finish_rank, s.expected_pick, s.odds,
         case when s.original_team_id is distinct from s.team_id then s.original_team_id end
  from jsonb_to_recordset(slots) as s(
    pick smallint, round smallint, team_id uuid,
    finish_rank smallint, expected_pick smallint, odds numeric,
    original_team_id uuid
  );
  get diagnostics created = row_count;
  if created <> jsonb_array_length(slots)
     or (select max(pick) from public.draft_picks
         where league_id = current_season.league_id and season_year = current_season.year) <> created then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;
  return created;
end;
$$;

-- A trade now moves picks too: `picks_a` are rights team A gives, `picks_b`
-- the rights B gives. A pick can be traded until its draft's lottery, which
-- means only picks of later years than the season's own.
drop function public.admin_apply_trade(uuid, uuid, uuid, uuid[], uuid[]);

create function public.admin_apply_trade(
  target_season uuid,
  trade_team_a uuid,
  trade_team_b uuid,
  from_a uuid[],
  from_b uuid[],
  picks_a uuid[] default '{}',
  picks_b uuid[] default '{}'
)
returns public.trades
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
  made public.trades;
  moved uuid;
  size_a integer;
  size_b integer;
  in_season boolean;
begin
  select * into current_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  in_season := current_season.phase = 'regular-season';
  if not (
    (current_season.phase = 'offseason'
     and current_season.stage in ('free-agency', 'training-camp', 'preseason'))
    or (in_season and current_season.day <= current_season.last_day * 2 / 3)
  ) then
    raise exception 'trades_closed' using errcode = 'P0001';
  end if;
  if trade_team_a = trade_team_b
     or cardinality(from_a) + cardinality(from_b) = 0
     or exists (select 1 from unnest(from_a) x where x = any (from_b))
     or exists (select 1 from unnest(picks_a) x where x = any (picks_b)) then
    raise exception 'invalid_trade' using errcode = '22023';
  end if;
  if (select count(*) from public.teams
      where league_id = current_season.league_id
        and id in (trade_team_a, trade_team_b)) <> 2 then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.players
      where league_id = current_season.league_id and status = 'active'
        and team_id = trade_team_a and id = any (from_a)) <> cardinality(from_a)
     or (select count(*) from public.players
         where league_id = current_season.league_id and status = 'active'
           and team_id = trade_team_b and id = any (from_b)) <> cardinality(from_b) then
    raise exception 'player_not_on_team' using errcode = 'P0001';
  end if;
  if (select count(*) from public.pick_rights
      where league_id = current_season.league_id and season_year > current_season.year
        and team_id = trade_team_a and id = any (picks_a)) <> cardinality(picks_a)
     or (select count(*) from public.pick_rights
         where league_id = current_season.league_id and season_year > current_season.year
           and team_id = trade_team_b and id = any (picks_b)) <> cardinality(picks_b) then
    raise exception 'pick_not_on_team' using errcode = 'P0001';
  end if;

  foreach moved in array from_a loop
    update public.players set team_id = trade_team_b where id = moved;
    update public.players set jersey = app_private.free_jersey(trade_team_b) where id = moved;
  end loop;
  foreach moved in array from_b loop
    update public.players set team_id = trade_team_a where id = moved;
    update public.players set jersey = app_private.free_jersey(trade_team_a) where id = moved;
  end loop;
  update public.pick_rights set team_id = trade_team_b where id = any (picks_a);
  update public.pick_rights set team_id = trade_team_a where id = any (picks_b);

  select count(*) into size_a from public.players
  where team_id = trade_team_a and status = 'active';
  select count(*) into size_b from public.players
  where team_id = trade_team_b and status = 'active';
  if size_a > 15 or size_b > 15 or (in_season and (size_a < 12 or size_b < 12)) then
    raise exception 'invalid_rosters' using errcode = '22023';
  end if;
  if app_private.team_payroll(trade_team_a) > app_private.salary_ceiling(current_season.league_id)
     or app_private.team_payroll(trade_team_b) > app_private.salary_ceiling(current_season.league_id) then
    raise exception 'over_ceiling' using errcode = '22023';
  end if;

  update public.player_ratings_history h set team_id = p.team_id
  from public.players p
  where h.league_id = current_season.league_id and h.season_year = current_season.year
    and h.player_id = p.id and p.id = any (from_a || from_b);
  delete from public.camp_assignments
  where season_id = target_season and player_id = any (from_a || from_b);

  insert into public.trades (
    league_id, season_year, day, team_a, team_b, gave_a, gave_b, gave_picks_a, gave_picks_b
  )
  values (current_season.league_id, current_season.year,
          case when in_season then current_season.day else 0 end,
          trade_team_a, trade_team_b, from_a, from_b, picks_a, picks_b)
  returning * into made;
  insert into public.player_transactions (
    league_id, season_year, day, kind, player_id, team_id, salary, years
  )
  select current_season.league_id, current_season.year, made.day, 'traded',
         p.id, p.team_id, p.salary, null
  from public.players p where p.id = any (from_a || from_b);
  return made;
end;
$$;

comment on function public.admin_apply_trade is
  'Applies a trade between two teams, players and picks, atomically. Service role only.';
revoke execute on function public.admin_apply_trade(uuid, uuid, uuid, uuid[], uuid[], uuid[], uuid[])
  from public, anon, authenticated;
grant execute on function public.admin_apply_trade(uuid, uuid, uuid, uuid[], uuid[], uuid[], uuid[])
  to service_role;
