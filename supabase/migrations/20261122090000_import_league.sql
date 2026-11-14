-- Restoring a league backup (Phase 36). admin_import_league() takes the
-- document the export endpoint writes and creates a new league for the owner
-- from it, in one transaction: either the whole league comes back or nothing
-- does.
--
-- Every id in the file is replaced by a new one (derived from the old id and a
-- salt chosen for this import), so a backup can be restored again and again,
-- next to the league it came from, and nothing in the new league points at the
-- old one. The league id, the owner and every row's league_id are then forced
-- to the new league and the caller, whatever the file says. Foreign keys and
-- check constraints decide whether the rest is consistent.

-- A new id for an old one: the same input always gives the same output, so
-- every mention of an id in a file is replaced by the same new id, and it is a
-- proper version 4 id (clients check ids strictly).
create function public.import_new_id(salt text, old text)
returns text
language sql
immutable
set search_path = ''
as $$
  select substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-4' || substr(h, 14, 3)
         || '-' || substr('89ab', 1 + (ascii(substr(h, 17, 1)) % 4), 1)
         || substr(h, 18, 3) || '-' || substr(h, 21, 12)
  from (select md5(salt || old) as h) x;
$$;

revoke execute on function public.import_new_id(text, text) from public, anon, authenticated;
grant execute on function public.import_new_id(text, text) to service_role;

create function public.admin_import_league(owner uuid, payload jsonb)
returns public.leagues
language plpgsql
security invoker
set search_path = ''
as $$
declare
  salt text := gen_random_uuid()::text;
  uuid_rx constant text :=
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  source text := payload::text;
  mapped jsonb;
  lid uuid;
  created public.leagues;
  -- Parents before the rows that point at them.
  names constant text[] := array[
    'league_conferences', 'league_divisions', 'league_local_players', 'teams',
    'players', 'seasons', 'playoff_series', 'games', 'game_replays',
    'box_score_lines', 'player_season_stats', 'team_season_stats',
    'season_awards', 'draft_picks', 'player_ratings_history', 'staff_members',
    'camp_assignments', 'camp_results', 'fa_offers', 'player_transactions',
    'trades', 'trade_offers', 'pick_rights', 'player_injuries',
    'all_star_games', 'all_star_players'
  ];
  name text;
  rows jsonb;
  user_team uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('create_league:' || owner::text, 0));
  if (select count(*) from public.leagues where leagues.owner_id = owner)
       >= public.league_limit() then
    raise exception 'league_limit_reached' using errcode = 'P0001';
  end if;
  if jsonb_typeof(payload -> 'league') is distinct from 'object'
     or jsonb_typeof(payload -> 'tables') is distinct from 'object' then
    raise exception 'invalid_backup' using errcode = '22023';
  end if;

  -- Replace every id: the text between ids is kept, each id becomes a new,
  -- well-formed (version 4) id derived from the salt and the old one.
  select string_agg(p.piece || coalesce(public.import_new_id(salt, m.id[1]), ''),
                    '' order by p.i)
    into source
    from regexp_split_to_table(source, uuid_rx) with ordinality as p(piece, i)
    left join (
      select x.id, x.i
        from regexp_matches(source, '(' || uuid_rx || ')', 'g')
             with ordinality as x(id, i)
    ) m on m.i = p.i;
  mapped := source::jsonb;

  begin
    lid := public.import_new_id(salt, payload -> 'league' ->> 'id')::uuid;
    insert into public.leagues
      select (jsonb_populate_record(
        null::public.leagues,
        (mapped -> 'league')
          || jsonb_build_object('id', lid, 'owner_id', owner, 'user_team_id', null)
      )).*
    returning * into created;

    foreach name in array names loop
      rows := coalesce(mapped -> 'tables' -> name, '[]'::jsonb);
      continue when jsonb_array_length(rows) = 0;
      execute format(
        'insert into public.%1$I select (r).* from jsonb_populate_recordset(null::public.%1$I, $1) r',
        name)
        using (select jsonb_agg(row || jsonb_build_object('league_id', lid))
                 from jsonb_array_elements(rows) row);
    end loop;

    user_team := nullif(mapped -> 'league' ->> 'user_team_id', '')::uuid;
    if user_team is not null then
      update public.leagues set user_team_id = user_team
        where id = lid returning * into created;
    end if;
  exception
    when others then
      if sqlerrm = 'league_limit_reached' then raise; end if;
      raise exception 'invalid_backup' using errcode = '22023', detail = sqlerrm;
  end;
  return created;
end;
$$;

comment on function public.admin_import_league is
  'Creates a league for the owner from a backup document, with every id replaced. Service role only.';
revoke execute on function public.admin_import_league(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_import_league(uuid, jsonb) to service_role;
