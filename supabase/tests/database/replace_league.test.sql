-- Restoring a backup over a league. Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(9);

insert into auth.users (id, aud, role, email)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Mine');
select pg_temp.make_league('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Theirs');

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

-- The ids the tests use, looked up once.
create table pg_temp.ids as
select (select id from public.leagues where name = 'Mine'
        and owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as mine,
       (select id from public.leagues where name = 'Theirs'
        and owner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as theirs;
create table pg_temp.backup as select pg_temp.doc((select mine from pg_temp.ids)) as doc;
create table pg_temp.made (id uuid);
grant all on pg_temp.ids, pg_temp.backup, pg_temp.made to service_role;

-- Somebody else's league can't be replaced, and nothing happens to it.
select throws_ok(
  $$select admin_replace_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      (select theirs from pg_temp.ids), (select doc from pg_temp.backup))$$,
  'P0002', 'league_not_found', 'a league that isn''t the owner''s is not found');
select is((select count(*)::int from leagues where id = (select theirs from pg_temp.ids)),
  1, 'and it is still there');

-- A backup that can't be restored leaves the league as it was.
select throws_ok(
  $$select admin_replace_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      (select mine from pg_temp.ids), '{"league": {}, "tables": {}}'::jsonb)$$,
  '22023', 'invalid_backup', 'a broken file is refused');
select is((select count(*)::int from players where league_id = (select mine from pg_temp.ids)),
  (select jsonb_array_length(doc -> 'tables' -> 'players') from pg_temp.backup),
  'and the league keeps every player');

-- A good one replaces it.
insert into pg_temp.made
select (admin_replace_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  (select mine from pg_temp.ids), (select doc from pg_temp.backup))).id;
select is((select count(*)::int from leagues where id = (select mine from pg_temp.ids)),
  0, 'the old league is gone');
select is((select count(*)::int from players where league_id = (select id from pg_temp.made)),
  (select jsonb_array_length(doc -> 'tables' -> 'players') from pg_temp.backup),
  'and the restored one has every player');
select is((select count(*)::int from leagues where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'the owner still has one league, not two');
select is((select count(*)::int from leagues where id = (select theirs from pg_temp.ids)),
  1, 'and nobody else''s was touched');

reset role;
set local role authenticated;
select throws_ok(
  $$select admin_replace_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      gen_random_uuid(), '{}'::jsonb)$$,
  '42501', null, 'a signed-in user cannot call it');

select * from finish();
rollback;
