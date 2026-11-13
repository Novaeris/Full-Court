-- Seasons, games, replays, box scores, season history and the simulation queue.
-- Run with: supabase test db
begin;
\ir helpers.psql

select plan(90);

-- Fixtures ---------------------------------------------------------------------------------------
\ir season_helpers.psql

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Season');
select pg_temp.make_league('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Other');

-- Creating a season (server only) --------------------------------------------------------------------

select is(
  (select s.phase || ':' || s.day || ':' || s.last_day
   from public.admin_create_season(
     pg_temp.league_id('Season'), 2026, 'standard',
     '{"division": 4, "conference": 3, "interconference": 2}',
     pg_temp.tiny_schedule(pg_temp.league_id('Season'))) as s),
  'regular-season:1:3',
  'a season starts in the regular season at day 1 and ends at its last game day'
);
select is(
  (select count(*)::int from public.games
   where season_id = pg_temp.season_id('Season') and status = 'scheduled'),
  6,
  'every game in the schedule is created, scheduled'
);
select throws_ok(
  $$select admin_create_season(pg_temp.league_id('Season'), 2027, 'standard',
      '{"division": 4, "conference": 3, "interconference": 2}', '[]')$$,
  '22023', 'invalid_schedule',
  'an empty schedule is refused'
);
-- The next tests are about the schedule, tiers and year, so let the earlier
-- season count as archived while they run (the archive rule has its own tests).
update seasons set archived_at = now() where league_id = pg_temp.league_id('Season');
select throws_ok(
  $$select admin_create_season(pg_temp.league_id('Season'), 2027, 'standard',
      '{"division": 4, "conference": 3, "interconference": 2}',
      pg_temp.double_booked(pg_temp.league_id('Season')))$$,
  '22023', 'invalid_schedule',
  'a team cannot play twice on one day'
);
select is(
  (select count(*)::int from public.seasons where year = 2027),
  0,
  'a refused schedule leaves no season behind'
);
select throws_ok(
  $$select admin_create_season(pg_temp.league_id('Season'), 2028, 'standard',
      '{"division": 0, "conference": 3, "interconference": 2}',
      pg_temp.tiny_schedule(pg_temp.league_id('Season')))$$,
  '23514', null,
  'schedule tiers outside 1 to 8 are refused'
);
select throws_ok(
  $$select admin_create_season(pg_temp.league_id('Season'), 2026, 'standard',
      '{"division": 4, "conference": 3, "interconference": 2}',
      pg_temp.tiny_schedule(pg_temp.league_id('Season')))$$,
  '23505', null,
  'a league has one season per year'
);
update seasons set archived_at = null where league_id = pg_temp.league_id('Season');
select throws_ok(
  $$select admin_create_season(gen_random_uuid(), 2026, 'standard',
      '{"division": 4, "conference": 3, "interconference": 2}', '[{"day": 1}]')$$,
  'P0002', 'league_not_found',
  'a season needs an existing league'
);

-- Game rules ----------------------------------------------------------------------------------------------

select throws_ok(
  $$update games set status = 'final', home_score = 90, away_score = 90
    where season_id = pg_temp.season_id('Season') and day = 1$$,
  '23514', null,
  'a game cannot end in a tie'
);
select throws_ok(
  $$update games set home_score = 90 where season_id = pg_temp.season_id('Season')$$,
  '23514', null,
  'a scheduled game has no score'
);
select throws_ok(
  $$update games set away_team_id = home_team_id where season_id = pg_temp.season_id('Season')$$,
  '23514', null,
  'a team cannot play itself'
);
select throws_ok(
  $$update seasons set day = 4 where id = pg_temp.season_id('Season')$$,
  '23514', null,
  'the regular season cannot run past its last day'
);

-- The owner reads, nobody writes -----------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is((select count(*)::int from seasons), 1, 'the owner sees their season');
select is((select count(*)::int from games), 6, 'the owner sees their games');

select throws_ok(
  $$insert into seasons (league_id, year, last_day, schedule_tiers)
    values (gen_random_uuid(), 2030, 1, '{}')$$,
  '42501', null,
  'clients cannot create seasons'
);
select throws_ok(
  $$update games set status = 'final', home_score = 100, away_score = 1$$,
  '42501', null,
  'clients cannot edit games'
);
select throws_ok($$delete from games$$, '42501', null, 'clients cannot delete games');
select throws_ok(
  $$update sim_jobs set status = 'done'$$,
  '42501', null,
  'clients cannot edit simulation jobs'
);
select throws_ok(
  $$insert into game_replays (league_id, game_id, engine_version, rng_state, snapshot)
    values (gen_random_uuid(), gen_random_uuid(), 1, array[1,2,3,4]::bigint[], '{}')$$,
  '42501', null,
  'clients cannot write replays'
);
select throws_ok(
  $$select admin_claim_sim_job('hacker')$$,
  '42501', null,
  'clients cannot claim simulation jobs'
);
select throws_ok(
  $$select admin_commit_sim_day(gen_random_uuid(), 1, array[1,2,3,4]::bigint[], '[]', '[]', '[]')$$,
  '42501', null,
  'clients cannot commit simulated days'
);

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is(
  (select count(*)::int from seasons) + (select count(*)::int from games),
  0,
  'another user sees none of the owner''s season or games'
);

-- Asking for a simulation (owner) ------------------------------------------------------------------------------

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select throws_ok(
  $$select enqueue_sim_job(pg_temp.league_id('Season'), 'day')$$,
  'P0001', 'league_not_active',
  'a simulation needs a league with a chosen team'
);
select is(
  (select status from choose_team(
     pg_temp.league_id('Season'),
     (select id from teams where league_id = pg_temp.league_id('Season') order by abbreviation limit 1))),
  'active',
  'choosing a team starts the league'
);
select throws_ok(
  $$select enqueue_sim_job(pg_temp.league_id('Season'), 'month')$$,
  '22023', 'invalid_sim_kind',
  'only a day, a week or a season can be simulated'
);
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select throws_ok(
  $$select enqueue_sim_job(pg_temp.league_id('Season'), 'day')$$,
  'P0002', 'league_not_found',
  'nobody can simulate another user''s league'
);
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(
  (select days_requested from enqueue_sim_job(pg_temp.league_id('Season'), 'week')),
  3,
  'a week never asks for more days than the season has left'
);
select throws_ok(
  $$select enqueue_sim_job(pg_temp.league_id('Season'), 'day')$$,
  'P0001', 'job_already_running',
  'a league has one active simulation'
);
select is(
  (select count(*)::int from sim_jobs where status = 'queued'),
  1,
  'the owner sees their queued job'
);
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is((select count(*)::int from sim_jobs), 0, 'another user sees no jobs');
select throws_ok(
  $$select cancel_sim_job(pg_temp.job_id('Season'))$$,
  'P0002', 'job_not_found',
  'nobody can cancel another user''s job'
);

-- The worker -------------------------------------------------------------------------------------------------------

reset role;
set local role service_role;
select is(
  (select count(*)::int from admin_claim_sim_job('worker-1')),
  1,
  'the worker claims the queued job'
);
select is(
  (select count(*)::int from admin_claim_sim_job('worker-2')),
  0,
  'a claimed job is not claimed twice'
);
select throws_ok(
  $$select admin_commit_sim_day(pg_temp.job_id('Season'), 2, array[1,2,3,4]::bigint[],
      pg_temp.day_games(pg_temp.season_id('Season'), 2),
      pg_temp.day_replays(pg_temp.season_id('Season'), 2),
      pg_temp.day_lines(pg_temp.season_id('Season'), 2))$$,
  'P0001', 'stale_day',
  'days must be committed in order'
);
select throws_ok(
  $$select admin_commit_sim_day(pg_temp.job_id('Season'), 1, array[1,2,3,4]::bigint[], '[]', '[]', '[]')$$,
  '22023', 'incomplete_day',
  'a day needs a result for every game'
);
select throws_ok(
  $$select admin_commit_sim_day(pg_temp.job_id('Season'), 1, array[1,2,3,4]::bigint[],
      pg_temp.day_games(pg_temp.season_id('Season'), 1),
      pg_temp.day_replays(pg_temp.season_id('Season'), 2),
      pg_temp.day_lines(pg_temp.season_id('Season'), 1))$$,
  '22023', 'invalid_day_data',
  'replays must belong to the day being committed'
);
select throws_ok(
  $$select admin_commit_sim_day(pg_temp.job_id('Season'), 1, array[1,2,3,4]::bigint[],
      pg_temp.day_games(pg_temp.season_id('Season'), 1, 101),
      pg_temp.day_replays(pg_temp.season_id('Season'), 1),
      pg_temp.day_lines(pg_temp.season_id('Season'), 1))$$,
  '22023', 'inconsistent_box_score',
  'a box score must add up to the final score'
);
select is(
  (select count(*)::int from games
   where season_id = pg_temp.season_id('Season') and status = 'final'),
  0,
  'refused commits change nothing'
);
select is(
  (select days_done from admin_commit_sim_day(pg_temp.job_id('Season'), 1, array[5,6,7,8]::bigint[],
      pg_temp.day_games(pg_temp.season_id('Season'), 1),
      pg_temp.day_replays(pg_temp.season_id('Season'), 1),
      pg_temp.day_lines(pg_temp.season_id('Season'), 1))),
  1,
  'a committed day counts toward the job'
);
select is(
  (select s.day || ':' || s.phase from seasons s where s.id = pg_temp.season_id('Season')),
  '2:regular-season',
  'the calendar moves to the next day'
);
select is(
  (select rng_state::text from leagues where id = pg_temp.league_id('Season')),
  '{5,6,7,8}',
  'the league''s RNG state is saved with the day'
);
select is(
  (select (select count(*) from games where season_id = pg_temp.season_id('Season') and status = 'final')
        || ':' || (select count(*) from game_replays)
        || ':' || (select count(*) from box_score_lines)),
  '2:2:4',
  'the day''s games, replays and box score lines are stored'
);
select throws_ok(
  $$select admin_commit_sim_day(pg_temp.job_id('Season'), 1, array[5,6,7,8]::bigint[],
      pg_temp.day_games(pg_temp.season_id('Season'), 1),
      pg_temp.day_replays(pg_temp.season_id('Season'), 1),
      pg_temp.day_lines(pg_temp.season_id('Season'), 1))$$,
  'P0001', 'stale_day',
  'a day cannot be committed twice'
);
select admin_commit_sim_day(pg_temp.job_id('Season'), 2, array[9,9,9,9]::bigint[],
  pg_temp.day_games(pg_temp.season_id('Season'), 2),
  pg_temp.day_replays(pg_temp.season_id('Season'), 2),
  pg_temp.day_lines(pg_temp.season_id('Season'), 2));
select is(
  (select status || ':' || days_done from sim_jobs where league_id = pg_temp.league_id('Season')),
  'running:2',
  'the job keeps running until its days are done'
);
select is(
  (select j.status || ':' || (j.finished_at is not null)
   from admin_commit_sim_day(pg_temp.job_id('Season'), 3, array[1,1,1,1]::bigint[],
      pg_temp.day_games(pg_temp.season_id('Season'), 3),
      pg_temp.day_replays(pg_temp.season_id('Season'), 3),
      pg_temp.day_lines(pg_temp.season_id('Season'), 3)) as j),
  'done:true',
  'the job finishes with its last day'
);
select is(
  (select s.day || ':' || s.phase from seasons s where s.id = pg_temp.season_id('Season')),
  '4:playoffs',
  'the season moves to the playoffs after its last regular-season day'
);

-- After the season: owner reads results, cannot simulate more --------------------------------------------------------

reset role;
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(
  (select count(*)::int from game_replays) || ':' || (select count(*)::int from box_score_lines),
  '6:12',
  'the owner reads the replays and box scores'
);
select throws_ok(
  $$select enqueue_sim_job(pg_temp.league_id('Season'), 'day')$$,
  'P0001', 'playoffs_not_started',
  'the playoffs need their bracket before they can be simulated'
);
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is(
  (select count(*)::int from game_replays) + (select count(*)::int from box_score_lines),
  0,
  'another user cannot read the replays or box scores'
);

-- Cancelling, failing and recovering jobs -------------------------------------------------------------------------------

reset role;
set local role service_role;
select admin_create_season(pg_temp.league_id('Other'), 2026, 'short',
  '{"division": 2, "conference": 2, "interconference": 1}',
  pg_temp.tiny_schedule(pg_temp.league_id('Other')));
set local role authenticated;
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select choose_team(
  pg_temp.league_id('Other'),
  (select id from teams where league_id = pg_temp.league_id('Other') order by abbreviation limit 1));
select enqueue_sim_job(pg_temp.league_id('Other'), 'season');
select is(
  (select status from cancel_sim_job(pg_temp.job_id('Other'))),
  'cancelled',
  'the owner can cancel a queued job'
);
select enqueue_sim_job(pg_temp.league_id('Other'), 'season');

reset role;
set local role service_role;
select admin_claim_sim_job('worker-3');
set local role authenticated;
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is(
  (select status from cancel_sim_job(pg_temp.job_id('Other'))),
  'cancelled',
  'the owner can cancel a running job'
);
reset role;
set local role service_role;
select throws_ok(
  $$select admin_commit_sim_day(
      (select id from sim_jobs where league_id = pg_temp.league_id('Other') and status = 'cancelled' limit 1),
      1, array[1,1,1,1]::bigint[],
      pg_temp.day_games(pg_temp.season_id('Other'), 1),
      pg_temp.day_replays(pg_temp.season_id('Other'), 1),
      pg_temp.day_lines(pg_temp.season_id('Other'), 1))$$,
  'P0001', 'job_not_running',
  'a cancelled job commits nothing more'
);

set local role authenticated;
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select enqueue_sim_job(pg_temp.league_id('Other'), 'day');
reset role;
set local role service_role;
select admin_claim_sim_job('worker-4');
select is(
  (select char_length(error) || ':' || status
   from admin_fail_sim_job(pg_temp.job_id('Other'), repeat('x', 600))),
  '500:failed',
  'a failed job keeps a trimmed error'
);

set local role authenticated;
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select enqueue_sim_job(pg_temp.league_id('Other'), 'day');
reset role;
set local role service_role;
select admin_claim_sim_job('worker-5');
update sim_jobs set heartbeat_at = now() - interval '1 hour'
  where league_id = pg_temp.league_id('Other') and status = 'running';
select is(
  admin_requeue_stale_sim_jobs(interval '10 minutes'),
  1,
  'a job whose worker went quiet goes back in the queue'
);
select throws_ok(
  $$insert into sim_jobs (league_id, season_id, kind, days_requested)
    select league_id, season_id, 'day', 1 from sim_jobs where status = 'queued'$$,
  '23505', null,
  'the database allows only one active job per league'
);

-- Archiving a season -------------------------------------------------------------------------------------------

reset role;
set local role service_role;

select throws_ok(
  $$select admin_archive_season(pg_temp.season_id('Season'),
      array(select id from teams where league_id = pg_temp.league_id('Season') order by abbreviation))$$,
  'P0001', 'season_not_complete',
  'a season can only be archived once it is complete'
);
update seasons set phase = 'complete' where id = pg_temp.season_id('Season');

select throws_ok(
  $$select admin_archive_season(pg_temp.season_id('Season'), '{}')$$,
  '22023', 'invalid_standings_order',
  'archiving needs the standings of every team'
);
select throws_ok(
  $$select admin_archive_season(pg_temp.season_id('Season'),
      array(select id from teams where league_id = pg_temp.league_id('Season') order by abbreviation limit 1)
        || array(select id from teams where league_id = pg_temp.league_id('Season') order by abbreviation offset 1 limit 10)
        || array(select id from teams where league_id = pg_temp.league_id('Season') order by abbreviation limit 1))$$,
  '22023', 'invalid_standings_order',
  'a team cannot appear twice in the standings'
);
select throws_ok(
  $$select admin_create_season(pg_temp.league_id('Season'), 2027, 'standard',
      '{"division": 4, "conference": 3, "interconference": 2}',
      pg_temp.tiny_schedule(pg_temp.league_id('Season')))$$,
  'P0001', 'previous_season_not_archived',
  'the next season waits until the last one is archived'
);

-- A box score that no longer agrees with its game stops the archive.
update box_score_lines set fgm = 41, fga = 81, points = 102
where game_id = (select id from games where season_id = pg_temp.season_id('Season') and day = 1 limit 1)
  and team_id = (select home_team_id from games where season_id = pg_temp.season_id('Season') and day = 1 limit 1);
select throws_ok(
  $$select admin_archive_season(pg_temp.season_id('Season'),
      array(select id from teams where league_id = pg_temp.league_id('Season') order by abbreviation))$$,
  '22023', 'inconsistent_archive',
  'summaries that disagree with the box scores are not archived'
);
update box_score_lines set fgm = 40, fga = 80, points = 100
where game_id = (select id from games where season_id = pg_temp.season_id('Season') and day = 1 limit 1)
  and team_id = (select home_team_id from games where season_id = pg_temp.season_id('Season') and day = 1 limit 1);
select is(
  (select (select count(*) from games where season_id = pg_temp.season_id('Season'))
       || ':' || (select count(*) from team_season_stats)
       || ':' || (archived_at is null)
   from seasons where id = pg_temp.season_id('Season')),
  '6:0:true',
  'a refused archive deletes nothing and writes nothing'
);

select is(
  (select (s.archived_at is not null)
   from admin_archive_season(pg_temp.season_id('Season'),
     array(select id from teams where league_id = pg_temp.league_id('Season') order by abbreviation)) as s),
  true,
  'a complete season is archived'
);
select is(
  (select t.wins || '-' || t.losses || ' home ' || t.home_wins || '-' || t.home_losses
          || ' div ' || t.division_wins || '-' || t.division_losses
          || ' conf ' || t.conference_wins || '-' || t.conference_losses
          || ' pts ' || t.points_for || '-' || t.points_against
   from team_season_stats t join teams tm on tm.id = t.team_id
   where tm.league_id = pg_temp.league_id('Season') and tm.abbreviation = 'T01'),
  '2-1 home 2-0 div 2-1 conf 2-1 pts 290-280',
  'a team''s record, home, division and conference results and scoring are summarised'
);
select is(
  (select t.rank_overall || ':' || t.rank_conference || ':' || t.rank_division
   from team_season_stats t join teams tm on tm.id = t.team_id
   where tm.league_id = pg_temp.league_id('Season') and tm.abbreviation = 'T04'),
  '4:4:1',
  'ranks come from the standings order, within the conference and the division'
);
select is(
  (select t.rank_overall || ':' || t.rank_conference || ':' || t.rank_division
   from team_season_stats t join teams tm on tm.id = t.team_id
   where tm.league_id = pg_temp.league_id('Season') and tm.abbreviation = 'T07'),
  '7:1:1',
  'the other conference is ranked on its own'
);
select is(
  (select count(*)::int from team_season_stats where league_id = pg_temp.league_id('Season')),
  12,
  'every team gets a record, even one that played no games'
);
select is(
  (select p.games_played || ':' || p.games_started || ':' || p.minutes || ':' || p.points
          || ':' || p.high_points || ':' || p.double_doubles
   from player_season_stats p join teams tm on tm.id = p.team_id
   where tm.league_id = pg_temp.league_id('Season') and tm.abbreviation = 'T01'),
  '3:3:144:290:100:2',
  'a player''s games, minutes, points and best game are summed'
);
select is(
  (select count(*)::int from player_season_stats where league_id = pg_temp.league_id('Season')),
  4,
  'only players who played get season stats'
);
select is(
  (select p.high_points || '@' || p.high_points_day
          || ' ' || p.high_rebounds || '@' || p.high_rebounds_day
          || ' ' || p.high_assists || '@' || p.high_assists_day
          || ' ' || p.high_steals || '@' || p.high_steals_day
          || ' ' || p.high_blocks || '@' || p.high_blocks_day
          || ' ' || p.high_threes || '@' || p.high_threes_day
   from player_season_stats p join teams tm on tm.id = p.team_id
   where tm.league_id = pg_temp.league_id('Season') and tm.abbreviation = 'T01'),
  '100@1 13@3 6@3 3@3 2@1 3@3',
  'a player''s single-game highs are kept with their day, and ties go to the earliest day'
);
select is(
  (select p.high_points_day = 2 and p.high_rebounds_day = 3
      and p.high_points_opponent_id =
          (select id from teams where league_id = pg_temp.league_id('Season') and abbreviation = 'T04')
      and p.high_rebounds_opponent_id =
          (select id from teams where league_id = pg_temp.league_id('Season') and abbreviation = 'T01')
   from player_season_stats p join teams tm on tm.id = p.team_id
   where tm.league_id = pg_temp.league_id('Season') and tm.abbreviation = 'T02'),
  true,
  'each high remembers which team it came against'
);
select is(
  (select t.high_points || '@' || t.high_points_day
          || ' ' || t.low_points || '@' || t.low_points_day
          || ' ' || t.high_points_allowed || '@' || t.high_points_allowed_day
          || ' ' || t.low_points_allowed || '@' || t.low_points_allowed_day
          || ' +' || t.biggest_win || '@' || t.biggest_win_day
          || ' -' || t.worst_loss || '@' || t.worst_loss_day
          || ' streaks ' || t.longest_win_streak || '/' || t.longest_loss_streak
   from team_season_stats t join teams tm on tm.id = t.team_id
   where tm.league_id = pg_temp.league_id('Season') and tm.abbreviation = 'T01'),
  '100@1 90@3 100@3 90@1 +10@1 -10@3 streaks 2/1',
  'a team''s highs and lows in scoring, its biggest win, worst loss and streaks are kept'
);
select is(
  (select t.longest_win_streak || '/' || t.longest_loss_streak
   from team_season_stats t join teams tm on tm.id = t.team_id
   where tm.league_id = pg_temp.league_id('Season') and tm.abbreviation = 'T04'),
  '1/2',
  'a streak is the longest run, wherever in the season it falls'
);
select is(
  (select t.high_points is null and t.low_points is null and t.biggest_win is null
      and t.worst_loss is null and t.longest_win_streak = 0 and t.longest_loss_streak = 0
   from team_season_stats t join teams tm on tm.id = t.team_id
   where tm.league_id = pg_temp.league_id('Season') and tm.abbreviation = 'T07'),
  true,
  'a team that played no games has no highs, lows or streaks'
);
select is(
  (select p.high_rebounds || '@' || p.high_rebounds_day
   from player_season_stats p
   where p.league_id = pg_temp.league_id('Season')
   order by p.high_rebounds desc, p.high_rebounds_day limit 1),
  '13@3',
  'the season high is the best of the players'' highs'
);
select is(
  (select (select count(*) from games where league_id = pg_temp.league_id('Season'))
       || ':' || (select count(*) from box_score_lines where league_id = pg_temp.league_id('Season'))
       || ':' || (select count(*) from game_replays where league_id = pg_temp.league_id('Season'))),
  '0:0:0',
  'archiving deletes the games, box scores and replays'
);
select is(
  (select count(*)::int from seasons where id = pg_temp.season_id('Season') and archived_at is not null),
  1,
  'the season itself stays, marked archived'
);
select throws_ok(
  $$select admin_archive_season(pg_temp.season_id('Season'),
      array(select id from teams where league_id = pg_temp.league_id('Season') order by abbreviation))$$,
  'P0001', 'season_already_archived',
  'a season is archived once'
);

-- History is the owner's to read, and nobody's to write.
reset role;
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(
  (select count(*)::int from team_season_stats) || ':' || (select count(*)::int from player_season_stats),
  '12:4',
  'the owner reads their season history'
);
select throws_ok(
  $$insert into season_awards (league_id, season_id, award, team_id)
    select league_id, season_id, 'champion', team_id from team_season_stats limit 1$$,
  '42501', null,
  'clients cannot write awards'
);
select throws_ok(
  $$update team_season_stats set wins = 82$$,
  '42501', null,
  'clients cannot edit history'
);
select throws_ok(
  $$select admin_archive_season(gen_random_uuid(), '{}')$$,
  '42501', null,
  'clients cannot archive seasons'
);
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is(
  (select count(*)::int from team_season_stats) + (select count(*)::int from player_season_stats)
    + (select count(*)::int from season_awards),
  0,
  'another user sees none of the history'
);

-- After archiving, the next season can start; a league plays at most 50.
reset role;
set local role service_role;
select is(
  (select s.year from admin_create_season(pg_temp.league_id('Season'), 2027, 'standard',
     '{"division": 4, "conference": 3, "interconference": 2}',
     pg_temp.tiny_schedule(pg_temp.league_id('Season'))) as s),
  2027,
  'the next season can start once the last is archived'
);
select is(season_limit(), 50, 'a league can play 50 seasons');
do $$
declare
  y integer;
begin
  for y in 2028..2075 loop
    update public.seasons set archived_at = now()
    where league_id = pg_temp.league_id('Season') and archived_at is null;
    perform public.admin_create_season(
      pg_temp.league_id('Season'), y, 'standard',
      '{"division": 4, "conference": 3, "interconference": 2}',
      pg_temp.tiny_schedule(pg_temp.league_id('Season')));
  end loop;
end
$$;
select is(
  (select count(*)::int from seasons where league_id = pg_temp.league_id('Season')),
  50,
  'a league reaches 50 seasons'
);
update seasons set archived_at = now()
  where league_id = pg_temp.league_id('Season') and archived_at is null;
select throws_ok(
  $$select admin_create_season(pg_temp.league_id('Season'), 2076, 'standard',
      '{"division": 4, "conference": 3, "interconference": 2}',
      pg_temp.tiny_schedule(pg_temp.league_id('Season')))$$,
  'P0001', 'season_limit_reached',
  'the 51st season is refused'
);

-- Deleting a league stays fast: the foreign keys that cascade are indexed ---------------------

select has_index('public', 'game_replays', 'game_replays_league_idx', 'replays are indexed by league for cascading deletes');
select has_index('public', 'player_season_stats', 'player_season_stats_player_idx', 'player history is indexed by player for cascading deletes');
select has_index('public', 'box_score_lines', 'box_score_lines_team_idx', 'box score lines are indexed by team for cascading deletes');

-- Deleting a league deletes its season ---------------------------------------------------------------------------------

reset role;
create temp table doomed as select pg_temp.league_id('Season') as league;
grant select on doomed to authenticated;
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
delete from leagues where name = 'Season';
reset role;
select is(
  (select count(*)::int from seasons where league_id = (select league from doomed))
  + (select count(*)::int from games where league_id = (select league from doomed))
  + (select count(*)::int from game_replays where league_id = (select league from doomed))
  + (select count(*)::int from box_score_lines where league_id = (select league from doomed))
  + (select count(*)::int from sim_jobs where league_id = (select league from doomed)),
  0,
  'deleting a league deletes its seasons, games, replays, box scores and jobs'
);

select * from finish();
rollback;
