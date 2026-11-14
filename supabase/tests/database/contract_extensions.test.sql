-- Contract extensions. Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(14);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Extend');
select admin_ensure_contracts(pg_temp.league_id('Extend'),
  (select jsonb_agg(jsonb_build_object('id', p.id, 'salary', 5000, 'expires', 2026))
   from players p where p.league_id = pg_temp.league_id('Extend')));
select admin_create_season(pg_temp.league_id('Extend'), 2026, 'standard',
  '{"division": 4, "conference": 3, "interconference": 2}',
  pg_temp.tiny_schedule(pg_temp.league_id('Extend')));

create function pg_temp.season() returns uuid language sql stable as $$
  select id from public.seasons where league_id = pg_temp.league_id('Extend');
$$;
create function pg_temp.team(abbr text) returns uuid language sql stable as $$
  select id from public.teams
  where league_id = pg_temp.league_id('Extend') and abbreviation = abbr;
$$;
create function pg_temp.pl(abbr text, n integer) returns uuid language sql stable as $$
  select id from public.players
  where team_id = pg_temp.team(abbr) and status = 'active' order by jersey, id offset n - 1 limit 1;
$$;
grant execute on function pg_temp.season(), pg_temp.team(text), pg_temp.pl(text, integer)
  to service_role, authenticated;

select is(
  (select (admin_extend_contract(pg_temp.season(), pg_temp.pl('T01', 1), 8000, 3)).salary),
  8000, 'a contract can be extended');
select is(
  (select contract_expires::int from players where id = pg_temp.pl('T01', 1)),
  2028, 'it runs that many seasons from this one (2026, 2027, 2028)');
select is(
  (select count(*)::int from player_transactions
   where kind = 'extended' and player_id = pg_temp.pl('T01', 1) and salary = 8000 and years = 3),
  1, 'and is recorded');

select throws_ok(
  $$select admin_extend_contract(pg_temp.season(), pg_temp.pl('T01', 1), 9000, 3)$$,
  '22023', 'not_an_extension', 'a contract that ends no later than the old one is not an extension');
select throws_ok(
  $$select admin_extend_contract(pg_temp.season(), pg_temp.pl('T02', 1), 5000, 6)$$,
  '22023', 'invalid_contract', 'a contract is one to five years');
select throws_ok(
  $$select admin_extend_contract(pg_temp.season(), pg_temp.pl('T02', 1), 0, 2)$$,
  '22023', 'invalid_contract', 'and pays something');
select throws_ok(
  $$select admin_extend_contract(pg_temp.season(), pg_temp.pl('T02', 1), 100000, 2)$$,
  '22023', 'over_ceiling', 'a team cannot go past the hard ceiling');
select is(
  (select salary from players where id = pg_temp.pl('T02', 1)),
  5000, 'and a refused extension changes nothing');
select throws_ok(
  $$select admin_extend_contract(pg_temp.season(), gen_random_uuid(), 5000, 2)$$,
  'P0001', 'player_not_on_team', 'the player has to be on a team');

update seasons set phase = 'playoffs', day = last_day + 1 where id = pg_temp.season();
select throws_ok(
  $$select admin_extend_contract(pg_temp.season(), pg_temp.pl('T03', 1), 5000, 2)$$,
  'P0001', 'extensions_closed', 'not during the playoffs');
-- Once the playoffs are over, before the offseason begins, a computer team
-- can still re-sign a player (his contract ends with the season).
update seasons set phase = 'complete', day = last_day + 1 where id = pg_temp.season();
select lives_ok(
  $$select admin_extend_contract(pg_temp.season(), pg_temp.pl('T03', 1), 5000, 2)$$,
  'a player can be re-signed once the season is complete');
select is(
  (select day::int from player_transactions
   where player_id = pg_temp.pl('T03', 1) and kind = 'extended'
   order by id desc limit 1),
  0, 'and it is recorded before the new season (day 0)');
update seasons set phase = 'offseason', stage = 'draft', day = 1 where id = pg_temp.season();
select throws_ok(
  $$select admin_extend_contract(pg_temp.season(), pg_temp.pl('T03', 1), 5000, 2)$$,
  'P0001', 'extensions_closed', 'nor before free agency');

reset role;
set local role authenticated;
select throws_ok(
  $$select admin_extend_contract(pg_temp.season(), pg_temp.pl('T03', 1), 5000, 2)$$,
  '42501', null, 'a signed-in user cannot call it directly');

select * from finish();
rollback;
