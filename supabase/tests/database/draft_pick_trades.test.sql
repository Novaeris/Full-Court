-- Draft picks as trade assets. Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(11);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Picks');
select admin_ensure_contracts(pg_temp.league_id('Picks'),
  (select jsonb_agg(jsonb_build_object('id', p.id, 'salary', 5000, 'expires', 2030))
   from players p where p.league_id = pg_temp.league_id('Picks')));
select admin_create_season(pg_temp.league_id('Picks'), 2026, 'standard',
  '{"division": 4, "conference": 3, "interconference": 2}',
  pg_temp.tiny_schedule(pg_temp.league_id('Picks')));

create function pg_temp.team(abbr text) returns uuid language sql as $$
  select id from public.teams
  where league_id = pg_temp.league_id('Picks') and abbreviation = abbr;
$$;
create function pg_temp.season() returns uuid language sql as $$
  select id from public.seasons where league_id = pg_temp.league_id('Picks');
$$;
create function pg_temp.pl(abbr text, n integer) returns uuid language sql as $$
  select id from public.players
  where team_id = pg_temp.team(abbr) and status = 'active' order by jersey, id offset n - 1 limit 1;
$$;
-- A team's pick for a draft year and round.
create function pg_temp.pick(abbr text, yr integer, rnd integer) returns uuid language sql as $$
  select id from public.pick_rights
  where league_id = pg_temp.league_id('Picks') and original_team_id = pg_temp.team(abbr)
    and season_year = yr and round = rnd;
$$;
grant execute on function pg_temp.team(text), pg_temp.season(), pg_temp.pl(text, integer),
  pg_temp.pick(text, integer, integer) to service_role;

select is(admin_ensure_pick_rights(pg_temp.season()), 48,
  'every team gets its picks for the next two drafts (12 teams, 2 years, 2 rounds)');
select is(admin_ensure_pick_rights(pg_temp.season()), 0, 'asking again creates nothing');

-- T01 has room for the player it takes.
select admin_release_player(pg_temp.season(), pg_temp.team('T01'), pg_temp.pl('T01', 1));
select is(
  (select (admin_apply_trade(pg_temp.season(), pg_temp.team('T01'), pg_temp.team('T02'),
     '{}', array[pg_temp.pl('T02', 1)],
     array[pg_temp.pick('T01', 2027, 1)], '{}')).day::int),
  1, 'a pick can be traded for a player');
select is(
  (select team_id from pick_rights where id = pg_temp.pick('T01', 2027, 1)),
  pg_temp.team('T02'), 'the right moved to the team that took it');
select is(
  (select cardinality(gave_picks_a) from trades where league_id = pg_temp.league_id('Picks')),
  1, 'and the trade records the pick');

select throws_ok(
  $$select admin_apply_trade(pg_temp.season(), pg_temp.team('T01'), pg_temp.team('T03'),
      '{}', array[pg_temp.pl('T03', 1)], array[pg_temp.pick('T01', 2027, 1)], '{}')$$,
  'P0001', 'pick_not_on_team', 'a team cannot trade a pick it no longer holds');
select throws_ok(
  $$select admin_apply_trade(pg_temp.season(), pg_temp.team('T03'), pg_temp.team('T04'),
      '{}', '{}', array[pg_temp.pick('T03', 2027, 1)], array[pg_temp.pick('T04', 2027, 1)])$$,
  '22023', 'invalid_trade', 'a trade of picks alone is not a trade');

update pick_rights set season_year = 2026 where id = pg_temp.pick('T05', 2027, 2);
select throws_ok(
  $$select admin_apply_trade(pg_temp.season(), pg_temp.team('T05'), pg_temp.team('T06'),
      '{}', array[pg_temp.pl('T06', 1)], array[(select id from pick_rights
        where league_id = pg_temp.league_id('Picks') and original_team_id = pg_temp.team('T05')
          and season_year = 2026)], '{}')$$,
  'P0001', 'pick_not_on_team', 'a pick of a draft that has already come is not tradeable');

select is(
  (select (admin_apply_trade(pg_temp.season(), pg_temp.team('T07'), pg_temp.team('T08'),
     array[pg_temp.pl('T07', 1)], array[pg_temp.pl('T08', 1)])).day::int),
  1, 'a trade with no picks still works the old way');

reset role;
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select is((select count(*)::int from public.pick_rights), 0, 'another user cannot read the picks');
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is((select count(*)::int from public.pick_rights), 48, 'the league owner reads them');

select * from finish();
rollback;
