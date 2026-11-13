-- The playoff bracket: series, home court, advancing, the champion and history.
-- Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(40);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
-- Other work in this database (the e2e suite leaves queued jobs and leagues) must
-- not interfere: a worker claims the oldest queued job of any league.
delete from public.sim_jobs;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Playoff');
select admin_create_season(pg_temp.league_id('Playoff'), 2026, 'standard',
  '{"division": 4, "conference": 3, "interconference": 2}',
  pg_temp.tiny_schedule(pg_temp.league_id('Playoff')));

-- The first round of a four-team field: seed 1 v 4 and 2 v 3, each best of three.
create function pg_temp.team(abbr text) returns uuid language sql as $$
  select id from public.teams where league_id = pg_temp.league_id('Playoff') and abbreviation = abbr;
$$;
create function pg_temp.first_round() returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('slot', 0, 'best_of', 3,
      'team_a', pg_temp.team('T01'), 'seed_a', 1, 'rank_a', 1,
      'team_b', pg_temp.team('T04'), 'seed_b', 4, 'rank_b', 4),
    jsonb_build_object('slot', 1, 'best_of', 3,
      'team_a', pg_temp.team('T02'), 'seed_a', 2, 'rank_a', 2,
      'team_b', pg_temp.team('T03'), 'seed_b', 3, 'rank_b', 3));
$$;
create function pg_temp.rules() returns jsonb language sql as $$
  select '{"teams": 4, "seeding": "league", "autoQualifyDivisionLeaders": false,
           "divisionLeaderTopSeeds": null, "roundSeriesLengths": [3, 5]}'::jsonb;
$$;
-- Who hosts a series' games, as letters, in game order.
create function pg_temp.hosts(round_no integer, slot_no integer) returns text language sql as $$
  select string_agg(case when g.home_team_id = s.team_a then 'a' else 'b' end, '' order by g.game_number)
  from public.games g join public.playoff_series s on s.id = g.series_id
  where s.season_id = pg_temp.season_id('Playoff') and s.round = round_no and s.slot = slot_no;
$$;
create function pg_temp.series_state(round_no integer, slot_no integer) returns text language sql as $$
  select s.wins_a || '-' || s.wins_b || ' ' || coalesce((select abbreviation from public.teams where id = s.winner_team_id), 'open')
  from public.playoff_series s
  where s.season_id = pg_temp.season_id('Playoff') and s.round = round_no and s.slot = slot_no;
$$;
-- Plays every game scheduled for the season's current day, home teams winning.
create function pg_temp.play_day() returns integer language plpgsql as $$
declare
  d integer;
  played integer;
begin
  select day into d from public.seasons where id = pg_temp.season_id('Playoff');
  perform public.admin_commit_sim_day(pg_temp.job_id('Playoff'), d, array[d, 2, 3, 4]::bigint[],
    pg_temp.day_games(pg_temp.season_id('Playoff'), d),
    pg_temp.day_replays(pg_temp.season_id('Playoff'), d),
    pg_temp.day_lines(pg_temp.season_id('Playoff'), d));
  select count(*) into played from public.games
    where season_id = pg_temp.season_id('Playoff') and day = d and status = 'final';
  return played;
end;
$$;
grant execute on function pg_temp.team(text), pg_temp.first_round(), pg_temp.rules(),
  pg_temp.hosts(integer, integer), pg_temp.series_state(integer, integer), pg_temp.play_day()
to service_role, authenticated;

-- Home court, as the rules and the database both state it ---------------------------------------------

select is(
  (select string_agg(case when app_private.playoff_home_game(7, n) then 'H' else 'A' end, '' order by n)
   from generate_series(1, 7) n),
  'HHAAHAH',
  'best of seven is home, home, away, away, home, away, home'
);
select is(
  (select string_agg(case when app_private.playoff_home_game(5, n) then 'H' else 'A' end, '' order by n)
   from generate_series(1, 5) n)
  || ' ' ||
  (select string_agg(case when app_private.playoff_home_game(3, n) then 'H' else 'A' end, '' order by n)
   from generate_series(1, 3) n),
  'HHAAH HAH',
  'best of five is 2-2-1 and best of three is 1-1-1'
);

-- Building the bracket ----------------------------------------------------------------------------------

select throws_ok(
  $$select admin_create_playoffs(pg_temp.season_id('Playoff'), pg_temp.rules(), pg_temp.first_round())$$,
  'P0001', 'season_not_in_playoffs',
  'the bracket waits for the regular season to end'
);
-- The regular season is over (its three days are done).
update seasons set phase = 'playoffs', day = 4 where id = pg_temp.season_id('Playoff');

select throws_ok(
  $$select admin_create_playoffs(pg_temp.season_id('Playoff'),
      '{"teams": 3, "roundSeriesLengths": [3]}', pg_temp.first_round())$$,
  '22023', 'invalid_playoffs',
  'a field that isn''t a power of two is refused'
);
select throws_ok(
  $$select admin_create_playoffs(pg_temp.season_id('Playoff'), pg_temp.rules(), '[]')$$,
  '22023', 'invalid_playoffs',
  'the first round must have half as many series as teams'
);
select throws_ok(
  $$select admin_create_playoffs(pg_temp.season_id('Playoff'), pg_temp.rules(),
      pg_temp.first_round() || jsonb_build_array(jsonb_build_object('slot', 2, 'best_of', 3,
        'team_a', pg_temp.team('T01'), 'seed_a', 1, 'rank_a', 1,
        'team_b', pg_temp.team('T05'), 'seed_b', 2, 'rank_b', 5)))$$,
  '22023', 'invalid_playoffs',
  'the number of series must match the field'
);
select throws_ok(
  $$select admin_create_playoffs(pg_temp.season_id('Playoff'), pg_temp.rules(),
      jsonb_build_array(
        jsonb_build_object('slot', 0, 'best_of', 3, 'team_a', pg_temp.team('T01'), 'seed_a', 1, 'rank_a', 1,
          'team_b', pg_temp.team('T04'), 'seed_b', 4, 'rank_b', 4),
        jsonb_build_object('slot', 1, 'best_of', 3, 'team_a', pg_temp.team('T01'), 'seed_a', 1, 'rank_a', 1,
          'team_b', pg_temp.team('T03'), 'seed_b', 3, 'rank_b', 3)))$$,
  '22023', 'invalid_playoffs',
  'a team in the bracket twice is refused'
);

-- Before the bracket exists the owner cannot simulate the playoffs.
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select choose_team(pg_temp.league_id('Playoff'),
  (select id from teams where league_id = pg_temp.league_id('Playoff') order by abbreviation limit 1));
select throws_ok(
  $$select enqueue_sim_job(pg_temp.league_id('Playoff'), 'season')$$,
  'P0001', 'playoffs_not_started',
  'the playoffs can''t be simulated before their bracket is built'
);

reset role;
set local role service_role;
select is(
  (select s.phase || ':' || s.day from admin_create_playoffs(
     pg_temp.season_id('Playoff'), pg_temp.rules(), pg_temp.first_round()) as s),
  'playoffs:4',
  'the bracket is built when the regular season has ended'
);
select throws_ok(
  $$select admin_create_playoffs(pg_temp.season_id('Playoff'), pg_temp.rules(), pg_temp.first_round())$$,
  'P0001', 'playoffs_already_started',
  'the bracket is built once'
);
select is(
  (select count(*)::int from playoff_series where season_id = pg_temp.season_id('Playoff')),
  2,
  'the first round has two series'
);
select is(
  (select count(*)::int || ':' || min(day) || ':' || max(day) from games
   where season_id = pg_temp.season_id('Playoff') and status = 'scheduled' and round is not null),
  '2:4:4',
  'each series gets its first game on the first playoff day'
);
select is(
  pg_temp.hosts(1, 0) || ' ' || pg_temp.hosts(1, 1),
  'a a',
  'the better seed hosts game one'
);

-- Playing the first round --------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select enqueue_sim_job(pg_temp.league_id('Playoff'), 'season');
select is(
  (select days_requested from sim_jobs where league_id = pg_temp.league_id('Playoff')),
  14,
  'a playoff simulation asks for at most a day for every game of the longest series'
);
reset role;
set local role service_role;
select admin_claim_sim_job('worker-playoffs');

select is(pg_temp.play_day(), 2, 'day 4: both first-round games are played');
select is(
  pg_temp.series_state(1, 0) || ' / ' || pg_temp.series_state(1, 1),
  '1-0 open / 1-0 open',
  'the home teams lead their series 1-0'
);
select is(
  pg_temp.hosts(1, 0),
  'ab',
  'game two is at the other team'
);
select is(
  (select j.status || ':' || j.days_done from sim_jobs j where j.league_id = pg_temp.league_id('Playoff')),
  'running:1',
  'the job keeps running between playoff days'
);

select pg_temp.play_day();   -- day 5: the away teams are at home and win: 1-1
select is(
  pg_temp.series_state(1, 0) || ' / ' || pg_temp.series_state(1, 1),
  '1-1 open / 1-1 open',
  'a series can be level'
);
select is(
  pg_temp.hosts(1, 0),
  'aba',
  'game three is back at the better seed'
);

select pg_temp.play_day();   -- day 6: game three, the better seeds win at home
select is(
  pg_temp.series_state(1, 0) || ' / ' || pg_temp.series_state(1, 1),
  '2-1 T01 / 2-1 T02',
  'the first to two wins takes a best-of-three'
);
select is(
  (select count(*)::int from games where series_id in
     (select id from playoff_series where season_id = pg_temp.season_id('Playoff') and round = 1)),
  6,
  'no game is scheduled after a series is won'
);

-- The next round -----------------------------------------------------------------------------------------

select is(
  (select s.team_a = pg_temp.team('T01') and s.team_b = pg_temp.team('T02')
          and s.best_of = 5 and s.seed_a = 1 and s.rank_b = 2 and s.slot = 0
   from playoff_series s where s.season_id = pg_temp.season_id('Playoff') and s.round = 2),
  true,
  'the winners of neighbouring series meet, in a series of the next round''s length'
);
select is(
  (select count(*)::int || ':' || min(day) from games
   where season_id = pg_temp.season_id('Playoff') and status = 'scheduled' and round is not null),
  '1:7',
  'the next round starts the next day'
);

-- The final: T01 wins games 1, 2, then loses 3 and 4 away and wins 5 at home.
select pg_temp.play_day();   -- day 7, game 1 (T01 home)
select pg_temp.play_day();   -- day 8, game 2 (T01 home)
select is(pg_temp.series_state(2, 0), '2-0 open', 'the final is 2-0 after two home wins');
select is(pg_temp.hosts(2, 0), 'aab', 'game three is at the worse seed');
select pg_temp.play_day();   -- day 9, game 3 (T02 home wins)
select pg_temp.play_day();   -- day 10, game 4 (T02 home wins)
select is(pg_temp.series_state(2, 0), '2-2 open', 'a final can go the distance');
select is(
  (select count(*)::int from season_awards where season_id = pg_temp.season_id('Playoff')),
  0,
  'no champion until the final is won'
);
select pg_temp.play_day();   -- day 11, game 5 (T01 home wins)
select is(pg_temp.series_state(2, 0), '3-2 T01', 'the first to three takes a best-of-five');

select is(
  (select s.phase || ':' || s.day from seasons s where s.id = pg_temp.season_id('Playoff')),
  'complete:12',
  'the season is complete when the final is won'
);
select is(
  (select string_agg(a.award || '=' || t.abbreviation, ',' order by a.award)
   from season_awards a join teams t on t.id = a.team_id
   where a.season_id = pg_temp.season_id('Playoff')),
  'champion=T01,finalist=T02',
  'the champion and the finalist are recorded'
);
select is(
  (select j.status || ':' || j.days_done || ':' || (j.finished_at is not null)
   from sim_jobs j where j.league_id = pg_temp.league_id('Playoff')),
  'done:8:true',
  'the job ends with the season'
);
select is(
  (select count(*)::int from games
   where season_id = pg_temp.season_id('Playoff') and status = 'scheduled' and round is not null),
  0,
  'nothing is left to play'
);

-- Access ------------------------------------------------------------------------------------------------------

reset role;
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is((select count(*)::int from playoff_series), 3, 'the owner reads the bracket');
select throws_ok(
  $$update playoff_series set wins_a = 3$$,
  '42501', null,
  'clients cannot edit the bracket'
);
select throws_ok(
  $$select admin_create_playoffs(gen_random_uuid(), '{}', '[]')$$,
  '42501', null,
  'clients cannot build a bracket'
);
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is((select count(*)::int from playoff_series), 0, 'another user sees no brackets');

-- Archiving keeps the playoff history ------------------------------------------------------------------------------

reset role;
set local role service_role;
-- The regular season's games were only fixtures to give the season a length.
delete from games where season_id = pg_temp.season_id('Playoff') and round is null;
select admin_archive_season(pg_temp.season_id('Playoff'),
  array(select id from teams where league_id = pg_temp.league_id('Playoff') order by abbreviation));
select is(
  (select string_agg(tm.abbreviation || ':' || coalesce(t.playoff_round::text, '-') || ':' || coalesce(t.playoff_result, '-'),
                     ' ' order by tm.abbreviation)
   from team_season_stats t join teams tm on tm.id = t.team_id
   where tm.league_id = pg_temp.league_id('Playoff') and tm.abbreviation <= 'T05'),
  'T01:2:champion T02:2:finalist T03:1:eliminated T04:1:eliminated T05:-:-',
  'each team''s playoff run is kept: how far it got and how it ended'
);
select is(
  (select count(*)::int from player_season_stats
   where league_id = pg_temp.league_id('Playoff') and playoffs)
  || ':' ||
  (select count(*)::int from player_season_stats
   where league_id = pg_temp.league_id('Playoff') and not playoffs),
  '4:0',
  'playoff statistics are kept apart from the regular season''s'
);
select is(
  (select count(*)::int from playoff_series where season_id = pg_temp.season_id('Playoff'))
  || ':' ||
  (select count(*)::int from games where league_id = pg_temp.league_id('Playoff')),
  '3:0',
  'the bracket stays after archiving; the games do not'
);

select * from finish();
rollback;
