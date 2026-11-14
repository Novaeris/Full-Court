-- Team strategy and starters. Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(10);

insert into auth.users (id, aud, role, email)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Coach');

create function pg_temp.team(abbr text) returns uuid language sql as $$
  select id from public.teams
  where league_id = pg_temp.league_id('Coach') and abbreviation = abbr;
$$;
create function pg_temp.five(abbr text) returns uuid[] language sql as $$
  select array_agg(id) from (
    select id from public.players
    where team_id = pg_temp.team(abbr) and status = 'active' order by id limit 5) x;
$$;
grant execute on function pg_temp.team(text), pg_temp.five(text) to service_role, authenticated;

insert into league_local_players (league_id, slot)
values (pg_temp.league_id('Coach'), 1) on conflict do nothing;
update teams set local_player_slot = 1 where id = pg_temp.team('T01');

select is(
  (select strategy_pace || strategy_three_point || strategy_defense || cardinality(starters)
   from teams where id = pg_temp.team('T02')),
  'normalnormalbalanced0', 'every team starts with the defaults and no named starters');

select is(
  (select (admin_set_team_strategy(pg_temp.team('T01'), 'fast', 'high', 'perimeter',
     pg_temp.five('T01'))).strategy_pace),
  'fast', 'a franchise can set its strategy');
select is(
  (select cardinality(starters) from teams where id = pg_temp.team('T01')),
  5, 'and its five starters');
select is(
  (select (admin_set_team_strategy(pg_temp.team('T01'), 'slow', 'low', 'interior',
     '{}')).strategy_defense),
  'interior', 'starters can be cleared');

select throws_ok(
  $$select admin_set_team_strategy(pg_temp.team('T02'), 'fast', 'high', 'perimeter', '{}')$$,
  'P0002', 'team_not_found', 'a computer team has no coach to set it');
select throws_ok(
  $$select admin_set_team_strategy(pg_temp.team('T01'), 'fast', 'high', 'perimeter',
      pg_temp.five('T02'))$$,
  '22023', 'invalid_starters', 'starters have to be on the team');
select throws_ok(
  $$select admin_set_team_strategy(pg_temp.team('T01'), 'fast', 'high', 'perimeter',
      (pg_temp.five('T01'))[1:4])$$,
  '22023', 'invalid_starters', 'there have to be five');
select throws_ok(
  $$select admin_set_team_strategy(pg_temp.team('T01'), 'fast', 'high', 'perimeter',
      array_fill((pg_temp.five('T01'))[1], array[5]))$$,
  '22023', 'invalid_starters', 'they have to be different players');
select throws_ok(
  $$select admin_set_team_strategy(pg_temp.team('T01'), 'reckless', 'high', 'perimeter', '{}')$$,
  '23514', null, 'the strategy has to be one the game knows');

reset role;
set local role authenticated;
select throws_ok(
  $$select admin_set_team_strategy(pg_temp.team('T01'), 'fast', 'high', 'perimeter', '{}')$$,
  '42501', null, 'a signed-in user cannot call it directly');

select * from finish();
rollback;
