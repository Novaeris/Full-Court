-- Injuries. Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(13);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Hurt');
select admin_create_season(pg_temp.league_id('Hurt'), 2026, 'standard',
  '{"division": 4, "conference": 3, "interconference": 2}',
  pg_temp.tiny_schedule(pg_temp.league_id('Hurt')));

create function pg_temp.season() returns uuid language sql stable as $$
  select id from public.seasons where league_id = pg_temp.league_id('Hurt');
$$;
create function pg_temp.team(abbr text) returns uuid language sql stable as $$
  select id from public.teams
  where league_id = pg_temp.league_id('Hurt') and abbreviation = abbr;
$$;
create function pg_temp.pl(abbr text, n integer) returns uuid language sql stable as $$
  select id from public.players
  where team_id = pg_temp.team(abbr) and status = 'active' order by jersey, id offset n - 1 limit 1;
$$;
create function pg_temp.hurt(abbr text, n integer, days integer) returns jsonb language sql stable as $$
  select jsonb_build_array(jsonb_build_object(
    'player_id', pg_temp.pl(abbr, n), 'team_id', pg_temp.team(abbr),
    'days', days, 'kind', 'sprained ankle'));
$$;
create function pg_temp.out(abbr text, n integer) returns integer language sql stable as $$
  select injury_days::int from public.players where id = pg_temp.pl(abbr, n);
$$;
grant execute on function pg_temp.season(), pg_temp.team(text), pg_temp.pl(text, integer),
  pg_temp.hurt(text, integer, integer), pg_temp.out(text, integer) to service_role, authenticated;

select is(pg_temp.out('T01', 1), 0, 'everyone starts healthy');
select is(admin_apply_injuries(pg_temp.season(), 1, pg_temp.hurt('T01', 1, 3)), 1,
  'an injury is stored');
select is(pg_temp.out('T01', 1), 3, 'the player is out for his days');
select is(
  (select injury_kind from players where id = pg_temp.pl('T01', 1)),
  'sprained ankle', 'with what it is');
select is(
  (select count(*)::int from player_injuries where season_id = pg_temp.season()),
  1, 'and it is kept in the history');

select is(admin_apply_injuries(pg_temp.season(), 1, pg_temp.hurt('T02', 1, 9)), 0,
  'a day already applied is not applied again');
select is(pg_temp.out('T02', 1), 0, 'so nothing changes');

select admin_apply_injuries(pg_temp.season(), 2, '[]');
select is(pg_temp.out('T01', 1), 2, 'each day he is a day closer to playing');
select admin_apply_injuries(pg_temp.season(), 3, '[]');
select admin_apply_injuries(pg_temp.season(), 4, '[]');
select is(
  (select injury_days::int || coalesce(injury_kind, 'fit') from players where id = pg_temp.pl('T01', 1)),
  '0fit', 'then he is fit again, with no injury left on him');

select admin_apply_injuries(pg_temp.season(), 5, pg_temp.hurt('T03', 1, 60));
select is(admin_heal_injuries(pg_temp.season()), 1, 'the offseason heals the injured');
select is(pg_temp.out('T03', 1), 0, 'completely');

select throws_ok(
  $$select admin_apply_injuries(pg_temp.season(), 6, '{}'::jsonb)$$,
  '22023', 'invalid_injuries', 'injuries come as a list');

reset role;
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select is((select count(*)::int from public.player_injuries), 0, 'another user cannot read the injuries');

select * from finish();
rollback;
