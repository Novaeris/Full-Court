-- The trading block. Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(10);

insert into auth.users (id, aud, role, email)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Block');

create function pg_temp.team(abbr text) returns uuid language sql stable as $$
  select id from public.teams
  where league_id = pg_temp.league_id('Block') and abbreviation = abbr;
$$;
create function pg_temp.pl(abbr text, n integer) returns uuid language sql stable as $$
  select id from public.players
  where team_id = pg_temp.team(abbr) and status = 'active' order by jersey, id offset n - 1 limit 1;
$$;
grant execute on function pg_temp.team(text), pg_temp.pl(text, integer)
  to service_role, authenticated;

insert into league_local_players (league_id, slot)
values (pg_temp.league_id('Block'), 1) on conflict do nothing;
update teams set local_player_slot = 1 where id = pg_temp.team('T01');

select is(
  (select cardinality(trading_block) from teams where id = pg_temp.team('T01')),
  0, 'a team starts with nobody on the block');
select is(
  (select cardinality((admin_set_trading_block(pg_temp.team('T01'),
     array[pg_temp.pl('T01', 1), pg_temp.pl('T01', 2)])).trading_block)),
  2, 'players can be put on the block');
select is(
  (select cardinality((admin_set_trading_block(pg_temp.team('T01'),
     array[pg_temp.pl('T01', 3)])).trading_block)),
  1, 'setting it again replaces the list');
select is(
  (select cardinality((admin_set_trading_block(pg_temp.team('T01'), '{}')).trading_block)),
  0, 'an empty list clears it');
select is(
  (select cardinality((admin_set_trading_block(pg_temp.team('T01'),
     array[pg_temp.pl('T01', 1), pg_temp.pl('T01', 2), pg_temp.pl('T01', 3),
           pg_temp.pl('T01', 4), pg_temp.pl('T01', 5)])).trading_block)),
  5, 'five is the most');

select throws_ok(
  $$select admin_set_trading_block(pg_temp.team('T01'),
      array[pg_temp.pl('T01', 1), pg_temp.pl('T01', 2), pg_temp.pl('T01', 3),
            pg_temp.pl('T01', 4), pg_temp.pl('T01', 5), pg_temp.pl('T01', 6)])$$,
  '22023', 'invalid_block', 'six is too many');
select throws_ok(
  $$select admin_set_trading_block(pg_temp.team('T01'), array[pg_temp.pl('T01', 1), pg_temp.pl('T01', 1)])$$,
  '22023', 'invalid_block', 'a player can only be listed once');
select throws_ok(
  $$select admin_set_trading_block(pg_temp.team('T01'), array[pg_temp.pl('T02', 1)])$$,
  '22023', 'invalid_block', 'and has to be on the team');
select throws_ok(
  $$select admin_set_trading_block(pg_temp.team('T02'), array[pg_temp.pl('T02', 1)])$$,
  'P0002', 'team_not_found', 'only a team someone runs has a block');

reset role;
set local role authenticated;
select throws_ok(
  $$select admin_set_trading_block(pg_temp.team('T01'), '{}')$$,
  '42501', null, 'a signed-in user cannot call it directly');

select * from finish();
rollback;
