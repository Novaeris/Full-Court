-- Season rules (Phase 43). A league's config may now also hold the schedule its
-- seasons are built with (`schedule`: a preset and the games between teams of
-- each kind) and rules waiting for the next season (`next`: a schedule and/or
-- a playoff format, which take over when the next season is created). The
-- application's zod schema and game rules are authoritative; this keeps bad
-- data out of the table, as the config check always has.

-- A playoff format: the part of the config check that looks at `playoffs`.
create function app_private.valid_playoff_config(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  rounds integer;
  lengths jsonb;
  top jsonb;
begin
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

-- A schedule rule: a preset name and how many times teams meet, by kind.
create function app_private.valid_schedule_rule(s jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  tiers jsonb;
  key text;
begin
  if jsonb_typeof(s) is distinct from 'object' then return false; end if;
  if s ->> 'preset' is null
     or s ->> 'preset' not in ('short', 'standard', 'long', 'custom') then
    return false;
  end if;
  tiers := s -> 'tiers';
  if jsonb_typeof(tiers) is distinct from 'object' then return false; end if;
  foreach key in array array['division', 'conference', 'interconference'] loop
    if jsonb_typeof(tiers -> key) is distinct from 'number'
       or (tiers -> key)::text !~ '^[1-8]$' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function app_private.valid_league_config(c jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  upcoming jsonb;
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
  if not app_private.valid_playoff_config(c -> 'playoffs') then return false; end if;

  if c ? 'schedule' and not app_private.valid_schedule_rule(c -> 'schedule') then
    return false;
  end if;
  if c ? 'next' then
    upcoming := c -> 'next';
    if jsonb_typeof(upcoming) is distinct from 'object' then return false; end if;
    if exists (
      select 1 from jsonb_object_keys(upcoming) k where k not in ('schedule', 'playoffs')
    ) then
      return false;
    end if;
    if upcoming ? 'schedule' and not app_private.valid_schedule_rule(upcoming -> 'schedule') then
      return false;
    end if;
    if upcoming ? 'playoffs' and not app_private.valid_playoff_config(upcoming -> 'playoffs') then
      return false;
    end if;
  end if;
  return true;
end;
$$;

grant execute on function app_private.valid_playoff_config(jsonb) to service_role, authenticated;
grant execute on function app_private.valid_schedule_rule(jsonb) to service_role, authenticated;
