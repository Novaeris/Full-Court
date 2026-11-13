-- The offseason: retirements, the draft, history, and what is refused.
-- Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(17);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Offseason');
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Offseason Two');

-- A finished 2026 season for each league: a schedule gives it a length, then
-- the season is complete and archived.
create function pg_temp.finish_season(league_name text) returns void language plpgsql as $$
declare
  league uuid := pg_temp.league_id(league_name);
  season uuid;
begin
  perform public.admin_create_season(league, 2026, 'standard',
    '{"division": 4, "conference": 3, "interconference": 2}',
    pg_temp.tiny_schedule(league));
  season := pg_temp.season_id(league_name);
  delete from public.games where season_id = season;
  update public.seasons set phase = 'complete', day = last_day + 1 where id = season;
  perform public.admin_archive_season(season,
    array(select id from public.teams where league_id = league order by abbreviation));
end;
$$;
grant execute on function pg_temp.finish_season(text) to service_role;

-- Team T01 loses its first two players to retirement and drafts two rookies.
create function pg_temp.changes(league_name text, with_rookies boolean) returns jsonb language sql as $$
  select coalesce(jsonb_agg(c), '[]'::jsonb) from (
    select to_jsonb(p) || jsonb_build_object('is_new', false, 'retired', true) as c
    from public.players p
    where p.league_id = pg_temp.league_id(league_name)
      and p.team_id = (select id from public.teams
                       where league_id = pg_temp.league_id(league_name) and abbreviation = 'T01')
      and p.jersey in (1, 2)
    union all
    select jsonb_build_object(
      'id', gen_random_uuid(), 'is_new', true, 'retired', false,
      'first_name', 'Rookie', 'last_name', 'Number ' || n, 'position', 'PG',
      'age', 20, 'height_inches', 76, 'weight_pounds', 200, 'jersey', 90 + n,
      'overall', 50, 'potential', 70,
      'inside', 50, 'mid_range', 50, 'three_point', 50, 'free_throw', 50,
      'passing', 50, 'ball_handling', 50, 'off_rebound', 50, 'def_rebound', 50,
      'perimeter_d', 50, 'interior_d', 50, 'speed', 50, 'strength', 50, 'stamina', 50,
      'team_id', (select id from public.teams
                  where league_id = pg_temp.league_id(league_name) and abbreviation = 'T01'),
      'draft_round', 1, 'draft_pick', n,
      'draft_team_id', (select id from public.teams
                        where league_id = pg_temp.league_id(league_name) and abbreviation = 'T01')
    )
    from generate_series(1, 2) as n
    where with_rookies
  ) q;
$$;
grant execute on function pg_temp.changes(text, boolean) to service_role;

-- A lottery entry for every team: they finished in name order, the first four
-- were in the lottery and the others made the playoffs.
create function pg_temp.lottery(league_name text) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object(
    'team_id', t.id, 'finish_rank', 13 - t.n, 'expected_pick', t.n,
    'odds', case when t.n <= 4 then 0.25 end
  ) order by t.n)
  from (
    select id, row_number() over (order by abbreviation) as n
    from public.teams where league_id = pg_temp.league_id(league_name)
  ) t;
$$;
grant execute on function pg_temp.lottery(text) to service_role;

select pg_temp.finish_season('Offseason');
select pg_temp.finish_season('Offseason Two');

-- Refusals ---------------------------------------------------------------------------------------------------

select throws_ok(
  $$select admin_apply_offseason(pg_temp.season_id('Offseason'), '{"not": "a list"}', '[]')$$,
  '22023', 'invalid_changes', 'the changes must be a list'
);
select throws_ok(
  $$select admin_apply_offseason(pg_temp.season_id('Offseason'),
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'is_new', false, 'retired', false)), '[]')$$,
  '22023', 'invalid_changes', 'a player that is not in the league is refused'
);

-- Retirements without replacements leave T01 with 12 players: legal. Retire a
-- fourth and it is not, and nothing at all is written.
select throws_ok(
  $$select admin_apply_offseason(pg_temp.season_id('Offseason Two'),
      (select jsonb_agg(to_jsonb(p) || jsonb_build_object('is_new', false, 'retired', true))
       from players p
       where p.league_id = pg_temp.league_id('Offseason Two')
         and p.team_id = (select id from teams
                          where league_id = pg_temp.league_id('Offseason Two') and abbreviation = 'T01')
         and p.jersey <= 4), '[]')$$,
  '22023', 'invalid_rosters', 'a team left with fewer than 12 players refuses the whole offseason'
);
select is(
  (select count(*)::int from players
   where league_id = pg_temp.league_id('Offseason Two') and status = 'retired')
  || ':' ||
  (select count(*)::int from player_ratings_history
   where league_id = pg_temp.league_id('Offseason Two'))
  || ':' ||
  (select (offseason_done_at is null)::text from seasons where id = pg_temp.season_id('Offseason Two')),
  '0:0:true',
  'a refused offseason writes nothing'
);

reset role;
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select throws_ok(
  $$select admin_apply_offseason(pg_temp.season_id('Offseason'), '[]', '[]')$$,
  '42501', null, 'clients cannot apply an offseason'
);
reset role;
set local role service_role;

-- Applying it -------------------------------------------------------------------------------------------------

select lives_ok(
  $$select admin_apply_offseason(pg_temp.season_id('Offseason'), pg_temp.changes('Offseason', true), pg_temp.lottery('Offseason'))$$,
  'the offseason is applied'
);
select is(
  (select count(*)::int from players
   where league_id = pg_temp.league_id('Offseason') and status = 'retired' and retired_year = 2027 and team_id is null),
  2, 'two players retired in 2027 and have no team'
);
select is(
  (select count(*)::int from players p
   where p.team_id = (select id from teams
                      where league_id = pg_temp.league_id('Offseason') and abbreviation = 'T01')
     and p.status = 'active'),
  15, 'the team that lost two players and drafted two has a full roster again'
);
select is(
  (select string_agg(d.pick || ':' || d.round || ':' || p.last_name, ' ' order by d.pick)
   from draft_picks d join players p on p.id = d.player_id
   where d.league_id = pg_temp.league_id('Offseason') and d.season_year = 2027),
  '1:1:Number 1 2:1:Number 2',
  'the draft is recorded, pick by pick'
);
select is(
  (select finish_rank || ':' || expected_pick || ':' || lottery_odds
   from draft_picks where league_id = pg_temp.league_id('Offseason') and pick = 1),
  '12:1:0.250000',
  'each pick keeps how its team finished, the pick it would have had and its lottery odds'
);
select is(
  (select count(*)::int from players
   where league_id = pg_temp.league_id('Offseason') and draft_year = 2027 and draft_pick is not null),
  2, 'a drafted player knows when and where he was picked'
);
select is(
  (select count(*)::int from player_ratings_history
   where league_id = pg_temp.league_id('Offseason') and season_year = 2027),
  2, 'every active player in the offseason gets a ratings history row for the new year'
);
select ok(
  (select offseason_done_at is not null from seasons where id = pg_temp.season_id('Offseason')),
  'the season is marked as having had its offseason'
);
select throws_ok(
  $$select admin_apply_offseason(pg_temp.season_id('Offseason'), '[]', '[]')$$,
  'P0001', 'offseason_already_done', 'the offseason can only be applied once'
);
select throws_ok(
  $$update players set team_id = (select id from teams where league_id = pg_temp.league_id('Offseason') limit 1)
    where league_id = pg_temp.league_id('Offseason') and status = 'retired'$$,
  '23514', null, 'a retired player cannot be put on a team'
);

-- Who can read the history ----------------------------------------------------------------------------------

reset role;
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(
  (select count(*)::int from draft_picks where season_year = 2027), 2,
  'the owner reads the league''s draft'
);
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is(
  (select count(*)::int from draft_picks)
  + (select count(*)::int from player_ratings_history), 0,
  'another user reads neither the draft nor the ratings history'
);

select * from finish();
rollback;
