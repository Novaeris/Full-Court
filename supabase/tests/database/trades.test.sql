-- Trades and roster moves in the season. Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(19);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Trades');
select admin_ensure_contracts(pg_temp.league_id('Trades'),
  (select jsonb_agg(jsonb_build_object('id', p.id, 'salary', 5000, 'expires', 2030))
   from players p where p.league_id = pg_temp.league_id('Trades')));
-- The tiny schedule has three game days, so the deadline is day 2.
select admin_create_season(pg_temp.league_id('Trades'), 2026, 'standard',
  '{"division": 4, "conference": 3, "interconference": 2}',
  pg_temp.tiny_schedule(pg_temp.league_id('Trades')));

create function pg_temp.team(abbr text) returns uuid language sql as $$
  select id from public.teams
  where league_id = pg_temp.league_id('Trades') and abbreviation = abbr;
$$;
create function pg_temp.season() returns uuid language sql as $$
  select id from public.seasons where league_id = pg_temp.league_id('Trades');
$$;
-- The nth player (by jersey) on a team.
create function pg_temp.pl(abbr text, n integer) returns uuid language sql as $$
  select id from public.players
  where team_id = pg_temp.team(abbr) and status = 'active' order by jersey, id offset n - 1 limit 1;
$$;
grant execute on function pg_temp.team(text), pg_temp.season(), pg_temp.pl(text, integer)
  to service_role;

select is(
  (select (admin_apply_trade(pg_temp.season(), pg_temp.team('T01'), pg_temp.team('T02'),
     array[pg_temp.pl('T01', 1)], array[pg_temp.pl('T02', 1)])).day::int),
  1, 'a one-for-one trade is made, on the day it happened'
);
select is(
  (select (team_id = pg_temp.team('T02'))::text from players where id = (
     select gave_a[1] from trades where league_id = pg_temp.league_id('Trades')))
  || ':' || (select count(*)::int from players where team_id = pg_temp.team('T01') and status = 'active')
  || ':' || (select count(*)::int from players where team_id = pg_temp.team('T02') and status = 'active'),
  'true:15:15', 'the players changed teams and both rosters are still 15'
);
select is(
  (select count(*)::int from player_transactions
   where league_id = pg_temp.league_id('Trades') and kind = 'traded'),
  2, 'each traded player has a transaction'
);
select throws_ok(
  $$select admin_apply_trade(pg_temp.season(), pg_temp.team('T01'), pg_temp.team('T03'),
      array[pg_temp.pl('T01', 2), pg_temp.pl('T01', 3)], array[pg_temp.pl('T03', 1)])$$,
  '22023', 'invalid_rosters', 'a trade that gives a team a 16th player is refused'
);
select is(
  (select count(*)::int from players where team_id = pg_temp.team('T01') and status = 'active')
  || ':' || (select count(*)::int from trades where league_id = pg_temp.league_id('Trades')),
  '15:1', 'a refused trade changes nothing'
);
select throws_ok(
  $$select admin_apply_trade(pg_temp.season(), pg_temp.team('T01'), pg_temp.team('T03'),
      array[pg_temp.pl('T02', 4)], array[pg_temp.pl('T03', 1)])$$,
  'P0001', 'player_not_on_team', 'a player must be on the team that gives him'
);
select throws_ok(
  $$select admin_apply_trade(pg_temp.season(), pg_temp.team('T01'), pg_temp.team('T03'),
      array[pg_temp.pl('T01', 2)], array[pg_temp.pl('T01', 2)])$$,
  '22023', 'invalid_trade', 'a player cannot be on both sides'
);
select throws_ok(
  $$select admin_apply_trade(pg_temp.season(), pg_temp.team('T01'), pg_temp.team('T01'),
      array[pg_temp.pl('T01', 2)], array[]::uuid[])$$,
  '22023', 'invalid_trade', 'a team cannot trade with itself'
);

-- The hard ceiling: T04 is just under it, so taking on a big salary is refused.
update players set salary = 9900 where team_id = pg_temp.team('T04') and status = 'active';
update players set salary = 20000 where id = (select pg_temp.pl('T05', 1));
update players set salary = 1000 where id = (select pg_temp.pl('T04', 1));
select throws_ok(
  $$select admin_apply_trade(pg_temp.season(), pg_temp.team('T04'), pg_temp.team('T05'),
      array[pg_temp.pl('T04', 1)], array[pg_temp.pl('T05', 1)])$$,
  '22023', 'over_ceiling', 'a trade that takes a team over the hard ceiling is refused'
);

-- A roster is never below 12 in the season.
select is(
  (select admin_release_player(pg_temp.season(), pg_temp.team('T06'), pg_temp.pl('T06', 1))),
  14, 'a player can be released in the season'
);
select admin_release_player(pg_temp.season(), pg_temp.team('T06'), pg_temp.pl('T06', 1));
select admin_release_player(pg_temp.season(), pg_temp.team('T06'), pg_temp.pl('T06', 1));
select throws_ok(
  $$select admin_release_player(pg_temp.season(), pg_temp.team('T06'), pg_temp.pl('T06', 1))$$,
  'P0001', 'roster_too_small', 'a release that leaves fewer than 12 players is refused'
);
select throws_ok(
  $$select admin_apply_trade(pg_temp.season(), pg_temp.team('T06'), pg_temp.team('T07'),
      array[pg_temp.pl('T06', 1)], array[]::uuid[])$$,
  '22023', 'invalid_rosters', 'a trade cannot leave a team below 12 players in the season'
);

-- Signing in the season: a one-year contract that ends with the season.
select is(
  (select admin_sign_player(pg_temp.season(), pg_temp.team('T06'),
     (select id from players where league_id = pg_temp.league_id('Trades')
       and team_id is null and status = 'active' limit 1), 1500, 1::smallint)),
  13, 'a free agent can be signed in the season'
);
select is(
  (select contract_expires::int from players where team_id = pg_temp.team('T06') and salary = 1500),
  2026, 'his one-year contract ends with this season'
);

-- The deadline and the end of the season.
update seasons set day = 3 where id = pg_temp.season();
select throws_ok(
  $$select admin_apply_trade(pg_temp.season(), pg_temp.team('T08'), pg_temp.team('T09'),
      array[pg_temp.pl('T08', 1)], array[pg_temp.pl('T09', 1)])$$,
  'P0001', 'trades_closed', 'trades close at the deadline'
);
update seasons set day = 2 where id = pg_temp.season();
select is(
  (select (admin_apply_trade(pg_temp.season(), pg_temp.team('T08'), pg_temp.team('T09'),
     array[pg_temp.pl('T08', 1)], array[pg_temp.pl('T09', 1)])).day::int),
  2, 'on the deadline day a trade is still allowed'
);
update seasons set phase = 'playoffs', day = 4 where id = pg_temp.season();
select throws_ok(
  $$select admin_apply_trade(pg_temp.season(), pg_temp.team('T10'), pg_temp.team('T11'),
      array[pg_temp.pl('T10', 1)], array[pg_temp.pl('T11', 1)])$$,
  'P0001', 'trades_closed', 'there are no trades in the playoffs'
);

reset role;
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is((select count(*)::int from trades), 2, 'the owner reads the league''s trades');
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is((select count(*)::int from trades), 0, 'another user reads none');

select * from finish();
rollback;
