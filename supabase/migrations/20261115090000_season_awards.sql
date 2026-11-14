-- Season awards (Phase 23). The award rules run in the server (they are pure
-- code in game-rules, worked out from the archived season totals); this stores
-- what they decided. The champion and the finalist are written when the final
-- is won and are kept: only the other awards are replaced, so working them out
-- again (a retry after a failure) gives the same rows and never doubles them.

create function public.admin_set_season_awards(target_season uuid, new_awards jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  found_season public.seasons;
  created integer;
begin
  select * into found_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  if found_season.archived_at is null then
    raise exception 'season_not_archived' using errcode = 'P0001';
  end if;
  if jsonb_typeof(new_awards) is distinct from 'array' then
    raise exception 'invalid_awards' using errcode = '22023';
  end if;

  delete from public.season_awards
  where season_id = target_season and award not in ('champion', 'finalist');

  insert into public.season_awards (league_id, season_id, award, team_id, player_id)
  select found_season.league_id, target_season, a.award, a.team_id, a.player_id
  from jsonb_to_recordset(new_awards) as a(award text, team_id uuid, player_id uuid)
  where a.award not in ('champion', 'finalist');
  get diagnostics created = row_count;
  return created;
end;
$$;

comment on function public.admin_set_season_awards is
  'Replaces an archived season''s awards (not the champion or finalist). Service role only.';
revoke execute on function public.admin_set_season_awards(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_set_season_awards(uuid, jsonb) to service_role;
