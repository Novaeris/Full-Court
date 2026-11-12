-- Renaming conferences and divisions.
--
-- Names are display text; ids are what everything references, so a rename never
-- breaks a reference. Clients still have no write grants on the structure
-- tables: a league owner renames through rename_structure(), which changes
-- many names in one transaction and rejects duplicates.

-- No two conferences in a league, and no two divisions in a conference, share
-- a name (ignoring case and surrounding spaces).
create unique index league_conferences_name_key
  on public.league_conferences (league_id, lower(btrim(name)));
create unique index league_divisions_name_key
  on public.league_divisions (league_id, conference_id, lower(btrim(name)));

create function public.rename_structure(
  target_league uuid,
  conference_names jsonb,
  division_names jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if not app_private.owns_league(target_league) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(conference_names) is distinct from 'array'
     or jsonb_typeof(division_names) is distinct from 'array' then
    raise exception 'invalid_names' using errcode = '22023';
  end if;

  -- Move the renamed rows out of the way first, so swapping two names in one
  -- request can't trip the uniqueness check halfway through.
  update public.league_conferences c
  set name = '~' || c.id
  from jsonb_to_recordset(conference_names) as n(id text, name text)
  where c.league_id = target_league and c.id = n.id;
  get diagnostics changed = row_count;
  if changed <> jsonb_array_length(conference_names) then
    raise exception 'unknown_conference' using errcode = '22023';
  end if;

  update public.league_divisions d
  set name = '~' || d.id
  from jsonb_to_recordset(division_names) as n(id text, name text)
  where d.league_id = target_league and d.id = n.id;
  get diagnostics changed = row_count;
  if changed <> jsonb_array_length(division_names) then
    raise exception 'unknown_division' using errcode = '22023';
  end if;

  update public.league_conferences c
  set name = btrim(n.name)
  from jsonb_to_recordset(conference_names) as n(id text, name text)
  where c.league_id = target_league and c.id = n.id;

  update public.league_divisions d
  set name = btrim(n.name)
  from jsonb_to_recordset(division_names) as n(id text, name text)
  where d.league_id = target_league and d.id = n.id;
end;
$$;

comment on function public.rename_structure is
  'Renames conferences and divisions of the caller''s league in one transaction. Ids never change.';

revoke execute on function public.rename_structure(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.rename_structure(uuid, jsonb, jsonb) to authenticated;
