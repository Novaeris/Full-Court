-- The season's totals, added up from the box score lines. Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(9);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
delete from public.sim_jobs;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Totals');
select pg_temp.make_league('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Else');
select admin_create_season(pg_temp.league_id('Totals'), 2026, 'standard',
  '{"division": 4, "conference": 3, "interconference": 2}',
  pg_temp.tiny_schedule(pg_temp.league_id('Totals')));

reset role;
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select choose_team(pg_temp.league_id('Totals'),
  (select id from teams where league_id = pg_temp.league_id('Totals') order by abbreviation limit 1));
select enqueue_sim_job(pg_temp.league_id('Totals'), 'week');

reset role;
set local role service_role;
select admin_claim_sim_job('worker', pg_temp.league_id('Totals'));
select admin_commit_sim_day(pg_temp.job_id('Totals'), 1, array[1,2,3,4]::bigint[],
  pg_temp.day_games(pg_temp.season_id('Totals'), 1),
  pg_temp.day_replays(pg_temp.season_id('Totals'), 1),
  pg_temp.day_lines(pg_temp.season_id('Totals'), 1));
select admin_commit_sim_day(pg_temp.job_id('Totals'), 2, array[5,6,7,8]::bigint[],
  pg_temp.day_games(pg_temp.season_id('Totals'), 2),
  pg_temp.day_replays(pg_temp.season_id('Totals'), 2),
  pg_temp.day_lines(pg_temp.season_id('Totals'), 2));

reset role;
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select is(
  (select count(*)::int from player_season_totals(pg_temp.season_id('Totals'))),
  (select count(distinct (player_id, team_id))::int from box_score_lines),
  'one row for each player who played');
select is(
  (select sum(points)::int from player_season_totals(pg_temp.season_id('Totals'))),
  (select sum(points)::int from box_score_lines),
  'the points add up to the box scores');
select is(
  (select max(games) from player_season_totals(pg_temp.season_id('Totals'))),
  2, 'a player in both days has played two games');
select is(
  (select started from player_season_totals(pg_temp.season_id('Totals')) order by points desc limit 1),
  2, 'and started both');
-- Day 1 and day 2 lines: rebounds 4 + 3d, so 7 then 10, 17 over two days.
select is(
  (select max(rebounds) from player_season_totals(pg_temp.season_id('Totals'))),
  17, 'totals are the sum of the games');
select is(
  (select max(fga) from player_season_totals(pg_temp.season_id('Totals'))),
  160, 'for every column');
select is(
  (select count(*)::int from player_season_totals(pg_temp.season_id('Totals'), true)),
  0, 'there are no playoff totals before the playoffs');

-- Another user's league is not theirs to see.
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is(
  (select count(*)::int from player_season_totals(pg_temp.season_id('Totals'))),
  0, 'another user sees nothing of it');

reset role;
set local role anon;
select throws_ok(
  $$select * from player_season_totals(gen_random_uuid())$$,
  '42501', null, 'and a visitor cannot ask');

select * from finish();
rollback;
