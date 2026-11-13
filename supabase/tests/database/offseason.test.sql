-- The offseason: ageing, the draft, free agency, staff, training camp and the
-- preseason, and what is refused. Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(62);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Offseason');

create function pg_temp.team(abbr text) returns uuid language sql as $$
  select id from public.teams
  where league_id = pg_temp.league_id('Offseason') and abbreviation = abbr;
$$;
create function pg_temp.old_season() returns uuid language sql as $$
  select id from public.seasons where league_id = pg_temp.league_id('Offseason') and year = 2026;
$$;
create function pg_temp.new_season() returns uuid language sql as $$
  select id from public.seasons where league_id = pg_temp.league_id('Offseason') and year = 2027;
$$;
grant execute on function pg_temp.team(text), pg_temp.old_season(), pg_temp.new_season()
  to service_role, authenticated;

-- Staff: T01 has all four roles (head coach 80, development 70, conditioning
-- 60, scout 50) and the market has three people, two of them very expensive.
create function pg_temp.member(team text, role text, rating integer, salary integer, last text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'team_id', case when team is null then null else pg_temp.team(team) end,
    'first_name', 'Staff', 'last_name', last, 'role', role, 'rating', rating,
    'age', 45, 'salary', salary, 'contract_years', case when team is null then null else 2 end);
$$;
create function pg_temp.staff() returns jsonb language sql as $$
  select jsonb_build_array(
    pg_temp.member('T01', 'head-coach', 80, 2170, 'Head'),
    pg_temp.member('T01', 'development-coach', 70, 1500, 'Dev'),
    pg_temp.member('T01', 'conditioning-coach', 60, 950, 'Cond'),
    pg_temp.member('T01', 'scout', 50, 600, 'Scout'),
    pg_temp.member(null, 'scout', 90, 3000, 'MarketScout'),
    pg_temp.member(null, 'development-coach', 95, 9500, 'MarketDev'),
    pg_temp.member(null, 'head-coach', 40, 400, 'MarketHead'));
$$;
grant execute on function pg_temp.member(text, text, integer, integer, text), pg_temp.staff()
  to service_role;

-- Pinned to @fullcourt/game-rules -------------------------------------------------------------------------------

select is(app_private.staff_budget(), 10000, 'the staff budget is $10 million (game-rules STAFF_BUDGET)');

select is(
  (select admin_create_staff(pg_temp.league_id('Offseason'), pg_temp.staff())),
  7, 'a league''s staff is created in one go'
);
select throws_ok(
  $$select admin_create_staff(pg_temp.league_id('Offseason'), pg_temp.staff())$$,
  'P0001', 'staff_already_exist', 'a league only gets its staff once'
);
select is(
  app_private.camp_places(pg_temp.team('T01')) || ':' || app_private.camp_places(pg_temp.team('T02')),
  '5:3',
  'camp places: 3, plus 2 for a head coach rated 80 (game-rules campPlaces)'
);

-- A finished, archived 2026 season ------------------------------------------------------------------------------

select admin_create_season(pg_temp.league_id('Offseason'), 2026, 'standard',
  '{"division": 4, "conference": 3, "interconference": 2}',
  pg_temp.tiny_schedule(pg_temp.league_id('Offseason')));
delete from games where season_id = pg_temp.old_season();
update seasons set phase = 'complete', day = last_day + 1 where id = pg_temp.old_season();

-- Ageing --------------------------------------------------------------------------------------------------------------

-- T01 loses its first four players to retirement.
create function pg_temp.retirements() returns jsonb language sql as $$
  select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('retired', true, 'previous_overall', p.overall)), '[]')
  from public.players p
  where p.league_id = pg_temp.league_id('Offseason')
    and p.team_id = pg_temp.team('T01') and p.jersey <= 4;
$$;
grant execute on function pg_temp.retirements() to service_role;

select throws_ok(
  $$select admin_apply_progression(pg_temp.old_season(), pg_temp.retirements(), '[]')$$,
  'P0001', 'season_not_archived', 'ageing needs an archived season'
);
select admin_archive_season(pg_temp.old_season(),
  array(select id from teams where league_id = pg_temp.league_id('Offseason') order by abbreviation));
select throws_ok(
  $$select admin_apply_progression(pg_temp.old_season(), '{"not": "a list"}', '[]')$$,
  '22023', 'invalid_changes', 'the changes must be a list'
);
select throws_ok(
  $$select admin_apply_progression(pg_temp.old_season(),
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'retired', false)), '[]')$$,
  '22023', 'invalid_changes', 'a player that is not in the league is refused'
);
select throws_ok(
  $$select admin_apply_progression(pg_temp.old_season(), '[]',
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'status', 'active')))$$,
  '22023', 'invalid_changes', 'a staff member that is not in the league is refused'
);
reset role;
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select throws_ok(
  $$select admin_apply_progression(pg_temp.old_season(), '[]', '[]')$$,
  '42501', null, 'clients cannot age a league'
);
reset role;
set local role service_role;

select lives_ok(
  $$select admin_apply_progression(pg_temp.old_season(), pg_temp.retirements(),
      jsonb_build_array(jsonb_build_object(
        'id', (select id from staff_members where last_name = 'Scout'),
        'status', 'active', 'team_id', null, 'contract_years', null)))$$,
  'players age and a staff contract ends'
);
select is(
  (select count(*)::int from players
   where league_id = pg_temp.league_id('Offseason') and status = 'retired' and retired_year = 2027 and team_id is null),
  4, 'four players retired in 2027 and have no team'
);
select is(
  (select team_id is null from staff_members where last_name = 'Scout'),
  true, 'the staff member whose contract ended is on the market'
);
select throws_ok(
  $$select admin_apply_progression(pg_temp.old_season(), '[]', '[]')$$,
  'P0001', 'offseason_already_done', 'ageing happens once'
);
select throws_ok(
  $$update players set team_id = pg_temp.team('T01')
    where league_id = pg_temp.league_id('Offseason') and status = 'retired'$$,
  '23514', null, 'a retired player cannot be put on a team'
);

-- The new season begins in its offseason --------------------------------------------------------------------------

select admin_create_season(pg_temp.league_id('Offseason'), 2027, 'standard',
  '{"division": 4, "conference": 3, "interconference": 2}',
  pg_temp.tiny_schedule(pg_temp.league_id('Offseason')), true);
select is(
  (select phase || ':' || stage from seasons where id = pg_temp.new_season()),
  'offseason:draft', 'the next season starts in its draft stage'
);
select throws_ok(
  $$insert into seasons (league_id, year, phase, stage, day, last_day, schedule_tiers)
    values (pg_temp.league_id('Offseason'), 2030, 'regular-season', 'draft', 1, 3,
            '{"division": 4, "conference": 3, "interconference": 2}')$$,
  '23514', null, 'only an offseason has a stage'
);
select throws_ok(
  $$select admin_apply_rosters(pg_temp.new_season(), '[]', '[]')$$,
  'P0001', 'wrong_stage', 'free agency cannot be skipped to'
);
select throws_ok(
  $$select admin_start_season(pg_temp.new_season())$$,
  'P0001', 'wrong_stage', 'the season cannot open during the draft'
);

-- The draft -------------------------------------------------------------------------------------------------------------

-- Four prospects, three picks: T01 has picks 1 and 3, T02 pick 2.
create function pg_temp.prospects() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object(
    'id', gen_random_uuid(), 'first_name', 'Rookie', 'last_name', 'Number ' || n,
    'position', 'PG', 'age', 20, 'height_inches', 76, 'weight_pounds', 200,
    'overall', 50, 'potential', 70,
    'inside', 50, 'mid_range', 50, 'three_point', 50, 'free_throw', 50,
    'passing', 50, 'ball_handling', 50, 'off_rebound', 50, 'def_rebound', 50,
    'perimeter_d', 50, 'interior_d', 50, 'speed', 50, 'strength', 50, 'stamina', 50
  ) order by n)
  from generate_series(1, 4) as n;
$$;
-- T01 finished last (12 of 12) and was expected to pick first with 25% odds;
-- T02 finished 11th.
create function pg_temp.slots() returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('pick', 1, 'round', 1, 'team_id', pg_temp.team('T01'),
                       'finish_rank', 12, 'expected_pick', 1, 'odds', 0.25),
    jsonb_build_object('pick', 2, 'round', 1, 'team_id', pg_temp.team('T02'),
                       'finish_rank', 11, 'expected_pick', 2, 'odds', 0.25),
    jsonb_build_object('pick', 3, 'round', 2, 'team_id', pg_temp.team('T01'),
                       'finish_rank', 12, 'expected_pick', 1, 'odds', 0.25));
$$;
create function pg_temp.prospect(n integer) returns uuid language sql as $$
  select id from public.players
  where league_id = pg_temp.league_id('Offseason') and last_name = 'Number ' || n;
$$;
create function pg_temp.pick(pick_no integer, n integer) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('pick', pick_no, 'player_id', pg_temp.prospect(n)));
$$;
grant execute on function pg_temp.prospects(), pg_temp.slots(), pg_temp.prospect(integer),
  pg_temp.pick(integer, integer) to service_role;

select throws_ok(
  $$select admin_sign_player(pg_temp.new_season(), pg_temp.team('T01'), gen_random_uuid())$$,
  'P0001', 'wrong_stage', 'players can not be signed during the draft'
);
select is(
  (select admin_create_prospects(pg_temp.new_season(), pg_temp.prospects())),
  4, 'the draft class is created as prospects'
);
select throws_ok(
  $$select admin_create_prospects(pg_temp.new_season(), pg_temp.prospects())$$,
  'P0001', 'prospects_already_exist', 'the class is created once'
);
select is(
  (select count(*)::int from players
   where league_id = pg_temp.league_id('Offseason') and status = 'prospect' and team_id is null and draft_year = 2027),
  4, 'prospects have no team and are not on any roster'
);
select throws_ok(
  $$select admin_make_picks(pg_temp.new_season(), pg_temp.pick(1, 1))$$,
  'P0001', 'lottery_not_held', 'nobody can be picked before the lottery'
);
select is(
  (select admin_hold_lottery(pg_temp.new_season(), pg_temp.slots())),
  3, 'the lottery is held and the order stored'
);
select throws_ok(
  $$select admin_hold_lottery(pg_temp.new_season(), pg_temp.slots())$$,
  'P0001', 'lottery_already_held', 'the lottery is held once'
);
select throws_ok(
  $$select admin_make_picks(pg_temp.new_season(), pg_temp.pick(2, 1))$$,
  'P0001', 'pick_out_of_order', 'picks are made in order'
);
select throws_ok(
  $$select admin_make_picks(pg_temp.new_season(),
      jsonb_build_array(jsonb_build_object('pick', 1,
        'player_id', (select id from players where team_id = pg_temp.team('T03') limit 1))))$$,
  'P0001', 'prospect_not_available', 'only a prospect can be picked'
);
select is(
  (select stage from seasons where id = pg_temp.new_season()) || ':' ||
  (select count(*)::int from draft_picks where league_id = pg_temp.league_id('Offseason') and player_id is not null),
  'draft:0', 'a refused pick changes nothing'
);
select is(
  (select (admin_make_picks(pg_temp.new_season(), pg_temp.pick(1, 1))).stage),
  'draft', 'the first pick is made and the draft goes on'
);
select is(
  (select p.status || ':' || p.draft_pick || ':' || (p.team_id = pg_temp.team('T01'))
   from players p where p.id = pg_temp.prospect(1)),
  'active:1:true', 'a picked prospect joins the picking team as a player who knows his pick'
);
select is(
  (select (admin_make_picks(pg_temp.new_season(),
      jsonb_build_array(
        jsonb_build_object('pick', 2, 'player_id', pg_temp.prospect(2)),
        jsonb_build_object('pick', 3, 'player_id', pg_temp.prospect(3)))
    )).stage),
  'free-agency', 'after the last pick the offseason moves on to free agency'
);
select is(
  (select string_agg(d.pick || ':' || d.round || ':' || d.finish_rank || ':' || d.expected_pick || ':' || d.lottery_odds,
                     ' ' order by d.pick)
   from draft_picks d where d.league_id = pg_temp.league_id('Offseason') and d.season_year = 2027),
  '1:1:12:1:0.250000 2:1:11:2:0.250000 3:2:12:1:0.250000',
  'each pick keeps how its team finished, the pick it would have had and its lottery odds'
);
select is(
  (select status || ':' || (team_id is null) from players where id = pg_temp.prospect(4)),
  'active:true', 'the prospect nobody took is an undrafted free agent'
);
select is(
  (select count(*)::int from player_ratings_history
   where league_id = pg_temp.league_id('Offseason') and season_year = 2027),
  4,
  'the rookies and the undrafted prospect get a ratings history row for the new year'
);
select throws_ok(
  $$select admin_make_picks(pg_temp.new_season(), pg_temp.pick(4, 4))$$,
  'P0001', 'wrong_stage', 'the draft is over'
);

-- Free agency: rosters and staff -----------------------------------------------------------------------------------

-- T01 has 15 - 4 retired + 2 drafted (picks 1 and 3) = 13 players.
select is(
  (select count(*)::int from players where team_id = pg_temp.team('T01') and status = 'active'),
  13, 'T01 has 13 players after retirements and the draft'
);
select throws_ok(
  $$select admin_apply_rosters(pg_temp.new_season(),
      (select jsonb_agg(jsonb_build_object('id', p.id, 'team_id', null, 'jersey', p.jersey))
       from (select id, jersey from players
             where team_id = pg_temp.team('T01') and status = 'active' limit 2) p),
      '[]')$$,
  '22023', 'invalid_rosters', 'a team left with fewer than 12 players refuses free agency'
);
select is(
  (select stage from seasons where id = pg_temp.new_season())
  || ':' || (select count(*)::int from players where team_id = pg_temp.team('T01') and status = 'active'),
  'free-agency:13', 'a refused free agency changes nothing'
);

-- Owner staff actions.
select throws_ok(
  $$select admin_hire_staff(pg_temp.new_season(),
      (select id from staff_members where last_name = 'MarketDev'), pg_temp.team('T01'), 2::smallint)$$,
  '22023', 'staff_over_budget', 'a hire over the budget is refused'
);
select is(
  (select team_id is null from staff_members where last_name = 'MarketDev')
  || ':' || (select last_name from staff_members where team_id = pg_temp.team('T01') and role = 'development-coach'),
  'true:Dev', 'a refused hire changes nobody'
);
select is(
  (select (admin_hire_staff(pg_temp.new_season(),
      (select id from staff_members where last_name = 'MarketScout'), pg_temp.team('T01'), 3::smallint)).contract_years),
  3::smallint, 'a scout is hired for three years'
);
select throws_ok(
  $$select admin_hire_staff(pg_temp.new_season(),
      (select id from staff_members where last_name = 'MarketScout'), pg_temp.team('T02'), 1::smallint)$$,
  'P0001', 'staff_not_available', 'someone already hired is not available'
);
select is(
  (select (admin_release_staff(pg_temp.new_season(),
      (select id from staff_members where last_name = 'Cond'))).team_id is null),
  true, 'a staff member can be let go'
);

-- Roster moves by the owner.
select throws_ok(
  $$select admin_sign_player(pg_temp.new_season(), pg_temp.team('T02'), pg_temp.prospect(4))$$,
  'P0001', 'roster_full', 'a team with 15 players cannot sign another'
);
select is(
  (select admin_release_player(pg_temp.new_season(), pg_temp.team('T02'),
     (select id from players where team_id = pg_temp.team('T02') and status = 'active' and jersey <> 0 order by overall, id limit 1))),
  15, 'a release leaves the roster at 15 (T02 had the drafted pick 2 as its 16th)'
);
select throws_ok(
  $$select admin_release_player(pg_temp.new_season(), pg_temp.team('T03'),
      (select id from players where team_id = pg_temp.team('T04') limit 1))$$,
  'P0002', 'player_not_found', 'a team can only release its own player'
);
select throws_ok(
  $$select admin_sign_player(pg_temp.new_season(), pg_temp.team('T01'),
      (select id from players where team_id = pg_temp.team('T05') limit 1))$$,
  'P0001', 'player_not_available', 'only a free agent can be signed'
);

-- AI Assist: only a franchise the user runs can have a switch on.
select throws_ok(
  $$select admin_set_ai_assist(pg_temp.team('T02'), '{"drafting": true}')$$,
  '23514', null, 'a computer team cannot be given AI Assist'
);
insert into league_local_players (league_id, slot) values (pg_temp.league_id('Offseason'), 1)
  on conflict do nothing;
update teams set local_player_slot = 1 where id = pg_temp.team('T01');
select is(
  (select (admin_set_ai_assist(pg_temp.team('T01'), '{"drafting": true, "rosterCoverage": true}')).ai_drafting),
  true, 'a switch is set'
);
select is(
  (select ai_roster_coverage::text || ':' || ai_scouting::text from teams where id = pg_temp.team('T01')),
  'true:false', 'the ones asked for are on and the ones not mentioned stay as they were'
);

-- Moves: T01 signs the undrafted rookie to reach 14.
select lives_ok(
  $$select admin_apply_rosters(pg_temp.new_season(),
      jsonb_build_array(jsonb_build_object(
        'id', (select id from players where last_name = 'Number 4'),
        'team_id', pg_temp.team('T01'), 'jersey', 77)), '[]')$$,
  'free agency is applied'
);
select is(
  (select stage from seasons where id = pg_temp.new_season()),
  'training-camp', 'the offseason moves on to training camp'
);

-- Training camp --------------------------------------------------------------------------------------------------------------

select throws_ok(
  $$select admin_set_camp(pg_temp.new_season(), pg_temp.team('T01'),
      (select jsonb_agg(jsonb_build_object('player_id', p.id, 'program', 'shooting'))
       from (select id from players where team_id = pg_temp.team('T01') and status = 'active' limit 6) p))$$,
  '22023', 'camp_full', 'camp holds no more players than the team has places'
);
select throws_ok(
  $$select admin_set_camp(pg_temp.new_season(), pg_temp.team('T01'),
      jsonb_build_array(jsonb_build_object(
        'player_id', (select id from players where team_id = pg_temp.team('T02') limit 1),
        'program', 'shooting')))$$,
  '22023', 'invalid_changes', 'a player from another team cannot be sent'
);
select is(
  admin_set_camp(pg_temp.new_season(), pg_temp.team('T01'),
    (select jsonb_agg(jsonb_build_object('player_id', p.id, 'program', 'athleticism'))
     from (select id from players where team_id = pg_temp.team('T01') and status = 'active' limit 2) p)),
  2, 'two players are sent to camp'
);

create function pg_temp.camp_results() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object(
    'player_id', a.player_id, 'program', a.program,
    'overall', p.overall + 2, 'potential', greatest(p.potential, p.overall + 2),
    'inside', p.inside, 'mid_range', p.mid_range, 'three_point', p.three_point,
    'free_throw', p.free_throw, 'passing', p.passing, 'ball_handling', p.ball_handling,
    'off_rebound', p.off_rebound, 'def_rebound', p.def_rebound,
    'perimeter_d', p.perimeter_d, 'interior_d', p.interior_d,
    'speed', p.speed + 3, 'strength', p.strength + 3, 'stamina', p.stamina + 3))
  from camp_assignments a join players p on p.id = a.player_id
  where a.season_id = pg_temp.new_season();
$$;
grant execute on function pg_temp.camp_results() to service_role;

select lives_ok(
  $$select admin_apply_camp(pg_temp.new_season(), pg_temp.camp_results())$$,
  'the camp is held'
);
select is(
  (select string_agg(program || ':' || (overall_after - overall_before), ',')
   from camp_results where league_id = pg_temp.league_id('Offseason') and season_year = 2027),
  'athleticism:2,athleticism:2', 'the camp report keeps who gained what'
);
select is(
  (select stage from seasons where id = pg_temp.new_season())
  || ':' || (select count(*)::int from camp_assignments where season_id = pg_temp.new_season()),
  'preseason:0', 'the preseason begins and the camp roster is cleared'
);

-- The season opens -----------------------------------------------------------------------------------------------------------

select is(
  (select (admin_start_season(pg_temp.new_season())).phase),
  'regular-season', 'the preseason ends and the season opens'
);
select is(
  (select stage is null from seasons where id = pg_temp.new_season()),
  true, 'a season in play has no stage'
);

-- Who can read it -------------------------------------------------------------------------------------------------------------

reset role;
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(
  (select count(*)::int from draft_picks where season_year = 2027)
  || ':' || (select count(*)::int from camp_results)
  || ':' || (select count(*)::int from staff_members), '3:2:7',
  'the owner reads the league''s draft, camp report and staff'
);
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is(
  (select count(*)::int from draft_picks) + (select count(*)::int from player_ratings_history)
  + (select count(*)::int from staff_members) + (select count(*)::int from camp_results)
  + (select count(*)::int from camp_assignments), 0,
  'another user reads none of it'
);

select * from finish();
rollback;
