-- Restoring a league backup. Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(13);

insert into auth.users (id, aud, role, email)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Source');

-- The document the export writes, built the same way from the same tables.
create function pg_temp.rows_of(tbl text, lid uuid) returns jsonb language plpgsql stable as $$
declare r jsonb;
begin
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where league_id = $1', tbl)
    into r using lid;
  return r;
end $$;
create function pg_temp.doc(lid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'format', 2,
    'league', (select to_jsonb(l) from public.leagues l where l.id = lid),
    'tables', jsonb_build_object(
      'league_conferences', pg_temp.rows_of('league_conferences', lid),
      'league_divisions', pg_temp.rows_of('league_divisions', lid),
      'league_local_players', pg_temp.rows_of('league_local_players', lid),
      'teams', pg_temp.rows_of('teams', lid),
      'players', pg_temp.rows_of('players', lid),
      'seasons', pg_temp.rows_of('seasons', lid)));
$$;
grant execute on function pg_temp.rows_of(text, uuid), pg_temp.doc(uuid) to service_role;

create table pg_temp.made (id uuid);
create table pg_temp.before (players integer, teams integer);
grant all on pg_temp.made, pg_temp.before to service_role;
insert into pg_temp.before
select (select count(*) from players where league_id = pg_temp.league_id('Source')),
       (select count(*) from teams where league_id = pg_temp.league_id('Source'));
insert into pg_temp.made
select (admin_import_league('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  pg_temp.doc(pg_temp.league_id('Source')))).id;

select is((select count(*)::int from pg_temp.made), 1, 'a backup becomes a league');
select is((select owner_id from leagues where id = (select id from pg_temp.made)),
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'owned by the person restoring it, not the one in the file');
select is((select count(*)::int from teams where league_id = (select id from pg_temp.made)),
  (select count(*)::int from teams where league_id = pg_temp.league_id('Source')),
  'every team comes back');
select is((select count(*)::int from players where league_id = (select id from pg_temp.made)),
  (select count(*)::int from players where league_id = pg_temp.league_id('Source')),
  'every player comes back');
select is((select count(*)::int from teams a join teams b
             on a.id = b.id and a.league_id <> b.league_id),
  0, 'no id is shared with the league it came from');
select is((select count(*)::int from players p
           join teams t on t.id = p.team_id and t.league_id = p.league_id
           where p.league_id = (select id from pg_temp.made)),
  (select count(*)::int from players where league_id = pg_temp.league_id('Source') and team_id is not null),
  'players are on the new league''s own teams');
select is((select sum(overall)::int from players where league_id = (select id from pg_temp.made)),
  (select sum(overall)::int from players where league_id = pg_temp.league_id('Source')),
  'ratings are as they were');

-- A file cannot write into somebody else's league: league_id is forced.
select is(
  (select players * 1000 + teams from pg_temp.before)::bigint,
  (select count(*) from players where league_id = pg_temp.league_id('Source')) * 1000
    + (select count(*) from teams where league_id = pg_temp.league_id('Source')),
  'the source league is untouched');

select is((select count(*)::int from (
    select id from teams where league_id = (select id from pg_temp.made)
    union all select id from players where league_id = (select id from pg_temp.made)
    union all select (select id from pg_temp.made)) x
  where id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  0, 'new ids are well-formed version 4 ids');

-- Restoring twice works: ids are new every time.
select lives_ok($$select admin_import_league('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  pg_temp.doc(pg_temp.league_id('Source')))$$, 'it can be restored again');

-- A broken file changes nothing.
select throws_ok($$select admin_import_league('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '{"league": {}, "tables": {}}'::jsonb)$$, '22023', 'invalid_backup', 'a file without a league is refused');
select is((select count(*)::int from leagues where owner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  2, 'and the refused file left nothing behind');

-- Only the service role may use it.
reset role;
set local role authenticated;
select throws_ok($$select admin_import_league('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{}'::jsonb)$$,
  '42501', null, 'a signed-in user cannot call it');

select * from finish();
rollback;
