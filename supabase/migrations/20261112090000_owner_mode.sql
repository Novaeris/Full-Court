-- Owner Mode: league configuration, stable conference/division ids, local
-- players, franchise identity and per-franchise AI Assist flags.
--
-- Existing leagues keep working: they get no config (config is null), their
-- conferences and divisions become rows with stable ids, and the player's
-- chosen team becomes Player 1. Writes still go only through service-role
-- functions; clients can read their own league's rows and nothing else.

-- Helpers ---------------------------------------------------------------------------------

grant usage on schema app_private to service_role;

-- Lowercase slug for generated ids, e.g. 'Mountain West' -> 'mountain-west'.
create function app_private.slug_id(input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(input), '[^a-z0-9]+', '-', 'g'), '-')
$$;

-- Checks the shape of a version 1 league config. The application's zod schema
-- and game rules are authoritative; this keeps bad data out of the table.
create function app_private.valid_league_config(c jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  p jsonb;
  rounds integer;
  lengths jsonb;
  top jsonb;
begin
  if jsonb_typeof(c) is distinct from 'object' then return false; end if;
  if c -> 'schemaVersion' is distinct from '1'::jsonb then return false; end if;
  if c ->> 'preset' is null or c ->> 'preset' not in ('standard', 'custom') then
    return false;
  end if;
  if c ->> 'region' is null or c ->> 'region' not in
     ('north-america', 'south-america', 'europe', 'asia', 'australia') then
    return false;
  end if;
  if jsonb_typeof(c -> 'fantasyDraft') is distinct from 'boolean' then return false; end if;

  p := c -> 'playoffs';
  if jsonb_typeof(p) is distinct from 'object' then return false; end if;
  if p -> 'teams' is null
     or p -> 'teams' not in ('2'::jsonb, '4'::jsonb, '8'::jsonb, '16'::jsonb, '32'::jsonb) then
    return false;
  end if;
  rounds := case (p ->> 'teams')::integer
    when 2 then 1 when 4 then 2 when 8 then 3 when 16 then 4 else 5 end;
  if p ->> 'seeding' is null or p ->> 'seeding' not in ('conference', 'league') then
    return false;
  end if;
  if jsonb_typeof(p -> 'autoQualifyDivisionLeaders') is distinct from 'boolean' then
    return false;
  end if;
  top := p -> 'divisionLeaderTopSeeds';
  if top is null then return false; end if;
  if jsonb_typeof(top) = 'number' then
    if top::text !~ '^[1-9][0-9]?$' then return false; end if;
    if top::text::integer > 32 then return false; end if;
  elsif jsonb_typeof(top) <> 'null' then
    return false;
  end if;
  lengths := p -> 'roundSeriesLengths';
  if jsonb_typeof(lengths) is distinct from 'array'
     or jsonb_array_length(lengths) <> rounds then
    return false;
  end if;
  if exists (
    select 1 from jsonb_array_elements(lengths) e
    where e not in ('3'::jsonb, '5'::jsonb, '7'::jsonb)
  ) then
    return false;
  end if;
  return true;
end;
$$;

grant execute on function app_private.slug_id(text) to service_role;
-- The config check runs on every league update (a rename, for instance), so
-- signed-in users need to be able to run this pure function.
grant execute on function app_private.valid_league_config(jsonb) to service_role, authenticated;

-- Leagues: config -------------------------------------------------------------------------
-- Leagues created before Owner Mode have no config at all (both columns null).
-- The JSON carries schemaVersion and the column mirrors it.

alter table public.leagues drop constraint leagues_size_check;
alter table public.leagues
  add constraint leagues_size_check check (size in ('standard', 'compact', 'custom')),
  add column config jsonb,
  add column config_schema_version smallint,
  add constraint leagues_config_check check (
    (config is null and config_schema_version is null)
    or (
      config is not null
      and config_schema_version is not null
      and config_schema_version >= 1
      and jsonb_typeof(config) = 'object'
      and config -> 'schemaVersion' = to_jsonb(config_schema_version)
      and app_private.valid_league_config(config)
    )
  ),
  add constraint leagues_custom_needs_config check (size <> 'custom' or config is not null);

comment on column public.leagues.config is
  'Owner Mode rules (preset, region, fantasyDraft, playoffs). Null for leagues created before Owner Mode.';
comment on column public.leagues.user_team_id is
  'Legacy mirror of Player 1''s first franchise. teams.local_player_slot is the source of truth.';

-- Conferences and divisions: stable ids, display names ----------------------------------------

create table public.league_conferences (
  league_id uuid not null references public.leagues (id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  sort_order smallint not null check (sort_order between 0 and 31),
  primary key (league_id, id),
  unique (league_id, sort_order)
);

create table public.league_divisions (
  league_id uuid not null,
  conference_id text not null,
  id text not null check (id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  sort_order smallint not null check (sort_order between 0 and 31),
  primary key (league_id, id),
  -- Lets teams reference (league, conference, division) so a team can't sit in
  -- a division of another conference.
  unique (league_id, conference_id, id),
  unique (league_id, conference_id, sort_order),
  foreign key (league_id, conference_id)
    references public.league_conferences (league_id, id) on delete cascade
);

-- Local (couch) players, Player 1, Player 2... A player may run several teams.
create table public.league_local_players (
  league_id uuid not null references public.leagues (id) on delete cascade,
  slot smallint not null check (slot between 1 and 8),
  label text check (label is null or char_length(btrim(label)) between 1 and 24),
  primary key (league_id, slot)
);

-- Backfill existing leagues -----------------------------------------------------------------

insert into public.league_conferences (league_id, id, name, sort_order)
select league_id,
       app_private.slug_id(conference),
       case conference when 'East' then 'Eastern' when 'West' then 'Western' else conference end,
       (row_number() over (partition by league_id order by conference) - 1)::smallint
from (select distinct league_id, conference from public.teams) c;

insert into public.league_divisions (league_id, conference_id, id, name, sort_order)
select league_id,
       app_private.slug_id(conference),
       left('d-' || app_private.slug_id(conference) || '-' || app_private.slug_id(division), 40),
       division,
       (row_number() over (partition by league_id, conference order by division) - 1)::smallint
from (select distinct league_id, conference, division from public.teams) d;

alter table public.teams
  add column conference_id text,
  add column division_id text,
  add column city_id text check (city_id is null or city_id ~ '^[a-z0-9]+(-[a-z0-9]+)+$'),
  add column logo_id text check (logo_id is null or logo_id ~ '^logo-[0-9]{2,3}$'),
  add column local_player_slot smallint,
  add column ai_trades boolean not null default false,
  add column ai_roster_coverage boolean not null default false,
  add column ai_roster_management boolean not null default false,
  add column ai_scouting boolean not null default false,
  add column ai_drafting boolean not null default false;

update public.teams
set conference_id = app_private.slug_id(conference),
    division_id = left('d-' || app_private.slug_id(conference) || '-' || app_private.slug_id(division), 40);

insert into public.league_local_players (league_id, slot)
select id, 1 from public.leagues where user_team_id is not null;

update public.teams t
set local_player_slot = 1
from public.leagues l
where l.user_team_id = t.id;

alter table public.teams
  alter column conference_id set not null,
  alter column division_id set not null,
  drop column conference,
  drop column division,
  add foreign key (league_id, conference_id)
    references public.league_conferences (league_id, id),
  add foreign key (league_id, conference_id, division_id)
    references public.league_divisions (league_id, conference_id, id),
  add foreign key (league_id, local_player_slot)
    references public.league_local_players (league_id, slot),
  add constraint teams_city_unique unique (league_id, city_id),
  -- AI Assist only makes sense for a franchise a local player runs.
  add constraint teams_ai_assist_needs_player check (
    local_player_slot is not null
    or not (ai_trades or ai_roster_coverage or ai_roster_management
            or ai_scouting or ai_drafting)
  );

create index teams_league_division_idx on public.teams (league_id, conference_id, division_id);

-- Read access: the league owner only ---------------------------------------------------------

alter table public.league_conferences enable row level security;
alter table public.league_divisions enable row level security;
alter table public.league_local_players enable row level security;

grant select on
  public.league_conferences, public.league_divisions, public.league_local_players
  to authenticated;

create policy "league_conferences: league owner can read"
  on public.league_conferences for select
  to authenticated
  using (app_private.owns_league(league_id));

create policy "league_divisions: league owner can read"
  on public.league_divisions for select
  to authenticated
  using (app_private.owns_league(league_id));

create policy "league_local_players: league owner can read"
  on public.league_local_players for select
  to authenticated
  using (app_private.owns_league(league_id));

-- choose_team: also records Player 1 ---------------------------------------------------------

create or replace function public.choose_team(target_league uuid, target_team uuid)
returns public.leagues
language plpgsql
security definer
set search_path = ''
as $$
declare
  league public.leagues;
begin
  select * into league
  from public.leagues
  where id = target_league and owner_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  if league.status <> 'setup' then
    raise exception 'team_already_chosen' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.teams where id = target_team and league_id = target_league
  ) then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;

  insert into public.league_local_players (league_id, slot)
  values (target_league, 1)
  on conflict do nothing;

  update public.teams
  set local_player_slot = 1
  where id = target_team;

  update public.leagues
  set user_team_id = target_team, status = 'active'
  where id = target_league
  returning * into league;

  return league;
end;
$$;

-- Creating a league, original signature (still used until the web app moves
-- to admin_create_owner_league). Legacy sizes only; no config.
create or replace function public.admin_create_league(
  owner uuid,
  league_name text,
  league_size text,
  league_seed text,
  league_rng_state bigint[],
  world_teams jsonb,
  world_players jsonb
)
returns public.leagues
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created public.leagues;
  expected_teams integer :=
    case league_size when 'standard' then 30 when 'compact' then 12 end;
  team_count integer;
  player_count integer;
begin
  if expected_teams is null then
    raise exception 'invalid_league_size' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('create_league:' || owner::text, 0));

  if (select count(*) from public.leagues where owner_id = owner) >= public.league_limit() then
    raise exception 'league_limit_reached'
      using errcode = 'P0001',
            detail = format('An account can keep up to %s leagues.', public.league_limit());
  end if;

  if exists (
    select 1 from jsonb_to_recordset(world_teams) as t(conference text)
    where t.conference is null or t.conference not in ('East', 'West')
  ) then
    raise exception 'invalid_world' using errcode = '22023',
      detail = 'Legacy leagues use the East and West conferences.';
  end if;

  insert into public.leagues (owner_id, name, size, seed, rng_state)
  values (owner, btrim(league_name), league_size, league_seed, league_rng_state)
  returning * into created;

  insert into public.league_conferences (league_id, id, name, sort_order)
  select created.id, app_private.slug_id(c.conference),
         case c.conference when 'East' then 'Eastern' else 'Western' end,
         (row_number() over (order by c.conference) - 1)::smallint
  from (
    select distinct conference from jsonb_to_recordset(world_teams) as t(conference text)
  ) c;

  insert into public.league_divisions (league_id, conference_id, id, name, sort_order)
  select created.id, app_private.slug_id(d.conference),
         left('d-' || app_private.slug_id(d.conference) || '-' || app_private.slug_id(d.division), 40),
         d.division,
         (row_number() over (partition by d.conference order by d.division) - 1)::smallint
  from (
    select distinct conference, division
    from jsonb_to_recordset(world_teams) as t(conference text, division text)
  ) d;

  insert into public.teams (
    league_id, abbreviation, city, nickname, conference_id, division_id,
    primary_color, secondary_color
  )
  select created.id, t.abbreviation, t.city, t.nickname,
         app_private.slug_id(t.conference),
         left('d-' || app_private.slug_id(t.conference) || '-' || app_private.slug_id(t.division), 40),
         t.primary_color, t.secondary_color
  from jsonb_to_recordset(world_teams) as t(
    abbreviation text, city text, nickname text, conference text,
    division text, primary_color text, secondary_color text
  );
  get diagnostics team_count = row_count;

  insert into public.players (
    league_id, team_id, first_name, last_name, position, age, height_inches,
    weight_pounds, jersey, overall, potential, inside, mid_range, three_point,
    free_throw, passing, ball_handling, off_rebound, def_rebound, perimeter_d,
    interior_d, speed, strength, stamina
  )
  select created.id, team.id, p.first_name, p.last_name, p.position, p.age,
         p.height_inches, p.weight_pounds, p.jersey, p.overall, p.potential,
         p.inside, p.mid_range, p.three_point, p.free_throw, p.passing,
         p.ball_handling, p.off_rebound, p.def_rebound, p.perimeter_d,
         p.interior_d, p.speed, p.strength, p.stamina
  from jsonb_to_recordset(world_players) as p(
    team text, first_name text, last_name text, position text, age smallint,
    height_inches smallint, weight_pounds smallint, jersey smallint,
    overall smallint, potential smallint, inside smallint, mid_range smallint,
    three_point smallint, free_throw smallint, passing smallint,
    ball_handling smallint, off_rebound smallint, def_rebound smallint,
    perimeter_d smallint, interior_d smallint, speed smallint,
    strength smallint, stamina smallint
  )
  join public.teams team
    on team.league_id = created.id and team.abbreviation = p.team;
  get diagnostics player_count = row_count;

  if team_count <> expected_teams or player_count <> team_count * 15
     or player_count <> jsonb_array_length(world_players) then
    raise exception 'invalid_world'
      using errcode = '22023',
            detail = format('Got %s teams and %s players for a %s league.',
                            team_count, player_count, league_size);
  end if;

  return created;
end;
$$;

-- Creating an Owner Mode league (server only) -------------------------------------------------
-- The server generates the structure, franchises and roster; this function
-- re-checks everything and writes it in one transaction.

create function public.admin_create_owner_league(
  owner uuid,
  league_name text,
  league_size text,
  league_config jsonb,
  league_seed text,
  league_rng_state bigint[],
  world_conferences jsonb,
  world_divisions jsonb,
  world_local_players jsonb,
  world_teams jsonb,
  world_players jsonb
)
returns public.leagues
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created public.leagues;
  conference_count integer;
  division_count integer;
  local_count integer;
  team_count integer;
  player_count integer;
  first_team uuid;
begin
  if league_size is null or league_size not in ('standard', 'custom') then
    raise exception 'invalid_league_size' using errcode = '22023';
  end if;
  if not app_private.valid_league_config(league_config)
     or league_config ->> 'preset' <> league_size then
    raise exception 'invalid_config' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('create_league:' || owner::text, 0));

  if (select count(*) from public.leagues where owner_id = owner) >= public.league_limit() then
    raise exception 'league_limit_reached'
      using errcode = 'P0001',
            detail = format('An account can keep up to %s leagues.', public.league_limit());
  end if;

  insert into public.leagues (
    owner_id, name, size, config, config_schema_version, seed, rng_state
  )
  values (
    owner, btrim(league_name), league_size, league_config,
    (league_config ->> 'schemaVersion')::smallint, league_seed, league_rng_state
  )
  returning * into created;

  insert into public.league_conferences (league_id, id, name, sort_order)
  select created.id, c.id, c.name, c.sort_order
  from jsonb_to_recordset(world_conferences) as c(id text, name text, sort_order smallint);
  get diagnostics conference_count = row_count;

  insert into public.league_divisions (league_id, conference_id, id, name, sort_order)
  select created.id, d.conference_id, d.id, d.name, d.sort_order
  from jsonb_to_recordset(world_divisions) as d(
    id text, conference_id text, name text, sort_order smallint
  );
  get diagnostics division_count = row_count;

  insert into public.league_local_players (league_id, slot, label)
  select created.id, l.slot, l.label
  from jsonb_to_recordset(world_local_players) as l(slot smallint, label text);
  get diagnostics local_count = row_count;

  insert into public.teams (
    league_id, abbreviation, city, nickname, conference_id, division_id,
    city_id, logo_id, primary_color, secondary_color, local_player_slot,
    ai_trades, ai_roster_coverage, ai_roster_management, ai_scouting, ai_drafting
  )
  select created.id, t.abbreviation, t.city, t.nickname, t.conference_id,
         t.division_id, t.city_id, t.logo_id, t.primary_color, t.secondary_color,
         t.local_player_slot,
         coalesce(t.ai_trades, false), coalesce(t.ai_roster_coverage, false),
         coalesce(t.ai_roster_management, false), coalesce(t.ai_scouting, false),
         coalesce(t.ai_drafting, false)
  from jsonb_to_recordset(world_teams) as t(
    abbreviation text, city text, nickname text, conference_id text,
    division_id text, city_id text, logo_id text, primary_color text,
    secondary_color text, local_player_slot smallint, ai_trades boolean,
    ai_roster_coverage boolean, ai_roster_management boolean,
    ai_scouting boolean, ai_drafting boolean
  );
  get diagnostics team_count = row_count;

  insert into public.players (
    league_id, team_id, first_name, last_name, position, age, height_inches,
    weight_pounds, jersey, overall, potential, inside, mid_range, three_point,
    free_throw, passing, ball_handling, off_rebound, def_rebound, perimeter_d,
    interior_d, speed, strength, stamina
  )
  select created.id, team.id, p.first_name, p.last_name, p.position, p.age,
         p.height_inches, p.weight_pounds, p.jersey, p.overall, p.potential,
         p.inside, p.mid_range, p.three_point, p.free_throw, p.passing,
         p.ball_handling, p.off_rebound, p.def_rebound, p.perimeter_d,
         p.interior_d, p.speed, p.strength, p.stamina
  from jsonb_to_recordset(world_players) as p(
    team text, first_name text, last_name text, position text, age smallint,
    height_inches smallint, weight_pounds smallint, jersey smallint,
    overall smallint, potential smallint, inside smallint, mid_range smallint,
    three_point smallint, free_throw smallint, passing smallint,
    ball_handling smallint, off_rebound smallint, def_rebound smallint,
    perimeter_d smallint, interior_d smallint, speed smallint,
    strength smallint, stamina smallint
  )
  join public.teams team
    on team.league_id = created.id and team.abbreviation = p.team;
  get diagnostics player_count = row_count;

  -- Structure: 1-32 teams, every conference has a division, every division a team.
  if team_count < 1 or team_count > 32
     or conference_count < 1 or division_count < conference_count
     or exists (
       select 1 from public.league_conferences c
       where c.league_id = created.id
         and not exists (
           select 1 from public.league_divisions d
           where d.league_id = c.league_id and d.conference_id = c.id)
     )
     or exists (
       select 1 from public.league_divisions d
       where d.league_id = created.id
         and not exists (
           select 1 from public.teams t
           where t.league_id = d.league_id and t.division_id = d.id)
     ) then
    raise exception 'invalid_structure' using errcode = '22023',
      detail = format('Got %s conferences, %s divisions and %s teams.',
                      conference_count, division_count, team_count);
  end if;

  -- The standard league is exactly 2 conferences x 3 divisions x 5 teams.
  if league_size = 'standard' and (
       team_count <> 30 or conference_count <> 2 or division_count <> 6
       or exists (
         select 1 from public.league_conferences c
         where c.league_id = created.id
           and (select count(*) from public.league_divisions d
                where d.league_id = c.league_id and d.conference_id = c.id) <> 3)
       or exists (
         select 1 from public.league_divisions d
         where d.league_id = created.id
           and (select count(*) from public.teams t
                where t.league_id = d.league_id and t.division_id = d.id) <> 5)
     ) then
    raise exception 'invalid_structure' using errcode = '22023',
      detail = 'A standard league is 2 conferences of 3 divisions of 5 teams.';
  end if;

  if (league_config -> 'playoffs' ->> 'teams')::integer > team_count then
    raise exception 'invalid_config' using errcode = '22023',
      detail = 'More playoff teams than teams in the league.';
  end if;

  -- Local players are numbered 1..n and each runs at least one franchise.
  if local_count < 1 or local_count > 8
     or (select min(slot) from public.league_local_players where league_id = created.id) <> 1
     or (select max(slot) from public.league_local_players where league_id = created.id) <> local_count
     or exists (
       select 1 from public.league_local_players l
       where l.league_id = created.id
         and not exists (
           select 1 from public.teams t
           where t.league_id = l.league_id and t.local_player_slot = l.slot)
     ) then
    raise exception 'invalid_local_players' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.teams
    where league_id = created.id and (city_id is null or logo_id is null)
  ) then
    raise exception 'invalid_world' using errcode = '22023',
      detail = 'Every franchise needs a city and a logo.';
  end if;

  if player_count <> team_count * 15
     or player_count <> jsonb_array_length(world_players) then
    raise exception 'invalid_world' using errcode = '22023',
      detail = format('Got %s teams and %s players.', team_count, player_count);
  end if;

  -- Ready to play: Player 1's first franchise is the legacy "your team".
  select id into first_team
  from public.teams
  where league_id = created.id and local_player_slot = 1
  order by abbreviation
  limit 1;

  update public.leagues
  set user_team_id = first_team, status = 'active'
  where id = created.id
  returning * into created;

  return created;
end;
$$;

comment on function public.admin_create_owner_league is
  'Creates an Owner Mode league with its structure, local players, franchises and roster in one transaction. Service role only; enforces the per-account limit.';

revoke execute on function public.admin_create_owner_league(
  uuid, text, text, jsonb, text, bigint[], jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.admin_create_owner_league(
  uuid, text, text, jsonb, text, bigint[], jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;
