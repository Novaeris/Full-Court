-- The All-Star Game. Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(11);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Stars');
select admin_create_season(pg_temp.league_id('Stars'), 2026, 'standard',
  '{"division": 4, "conference": 3, "interconference": 2}',
  pg_temp.tiny_schedule(pg_temp.league_id('Stars')));

create function pg_temp.season() returns uuid language sql stable as $$
  select id from public.seasons where league_id = pg_temp.league_id('Stars');
$$;
-- A game: twelve players on each squad, the first five of each starting.
create function pg_temp.game(score_a integer, score_b integer, with_mvp boolean default true)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'day', 2, 'name_a', 'Team Able', 'name_b', 'Team Baker',
    'score_a', score_a, 'score_b', score_b, 'overtimes', 0,
    'mvp_player_id', case when with_mvp then (select id from public.players
        where league_id = pg_temp.league_id('Stars') order by id limit 1) end,
    'players', (
      select jsonb_agg(jsonb_build_object(
        'player_id', p.id, 'team_id', p.team_id,
        'squad', case when p.rn <= 12 then 'a' else 'b' end,
        'starter', (p.rn - 1) % 12 < 5, 'captain', p.rn in (1, 2),
        'minutes', 20, 'points', 10, 'rebounds', 4, 'assists', 3, 'steals', 1, 'blocks', 0))
      from (select id, team_id, row_number() over (order by id) rn
            from public.players where league_id = pg_temp.league_id('Stars')
            order by id limit 24) p));
$$;
grant execute on function pg_temp.season(), pg_temp.game(integer, integer, boolean)
  to service_role, authenticated;

select is(admin_record_all_star_game(pg_temp.season(), pg_temp.game(150, 142)), true,
  'a game is stored');
select is((select count(*)::int from all_star_players), 24, 'with its 24 players');
select is(
  (select count(*)::int from all_star_players where starter and squad = 'a'),
  5, 'five starters on each squad');
select is(
  (select score_a || '-' || score_b from all_star_games), '150-142', 'and the score');
select is(admin_record_all_star_game(pg_temp.season(), pg_temp.game(99, 98)), false,
  'a season has one game: asking again does nothing');
select is((select score_a::int from all_star_games), 150, 'and leaves the first one alone');

delete from all_star_games;
select throws_ok(
  $$select admin_record_all_star_game(pg_temp.season(), '{"players": []}'::jsonb)$$,
  '22023', 'invalid_all_star_game', 'a game needs its players');
select throws_ok(
  $$select admin_record_all_star_game(pg_temp.season(), pg_temp.game(500, 90))$$,
  '23514', null, 'and a score the table allows');
select throws_ok(
  $$select admin_record_all_star_game(gen_random_uuid(), pg_temp.game(150, 142))$$,
  'P0002', 'season_not_found', 'for a season that exists');

select admin_record_all_star_game(pg_temp.season(), pg_temp.game(150, 142));
reset role;
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select is((select count(*)::int from public.all_star_games), 0,
  'another user cannot read the game');
select throws_ok(
  $$select admin_record_all_star_game(pg_temp.season(), pg_temp.game(1, 2))$$,
  '42501', null, 'and cannot store one');

select * from finish();
rollback;
