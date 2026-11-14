-- Development during the season. Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(10);

insert into auth.users (id, aud, role, email)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Grow');
select admin_ensure_contracts(pg_temp.league_id('Grow'),
  (select jsonb_agg(jsonb_build_object('id', p.id, 'salary', 5000, 'expires', 2026))
   from players p where p.league_id = pg_temp.league_id('Grow')));
select admin_create_season(pg_temp.league_id('Grow'), 2026, 'standard',
  '{"division": 4, "conference": 3, "interconference": 2}',
  pg_temp.tiny_schedule(pg_temp.league_id('Grow')));

-- The ids the tests use, looked up once.
create table pg_temp.ids as
select (select id from public.seasons where league_id = pg_temp.league_id('Grow')) as season;
create table pg_temp.two as
select row_number() over (order by p.id) as n, p.id, p.overall, p.three_point
from (select * from public.players
      where league_id = pg_temp.league_id('Grow') and status = 'active'
      order by id limit 2) p;
grant all on pg_temp.ids, pg_temp.two to service_role, authenticated;

create function pg_temp.change(p uuid, plus integer) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', id, 'overall', overall + plus,
    'inside', inside + plus, 'mid_range', mid_range + plus,
    'three_point', three_point + plus, 'free_throw', free_throw + plus,
    'passing', passing + plus, 'ball_handling', ball_handling + plus,
    'off_rebound', off_rebound + plus, 'def_rebound', def_rebound + plus,
    'perimeter_d', perimeter_d + plus, 'interior_d', interior_d + plus,
    'speed', speed + plus, 'strength', strength + plus, 'stamina', stamina + plus)
  from public.players where id = p;
$$;
grant execute on function pg_temp.change(uuid, integer) to service_role, authenticated;

select is(
  (select development_steps::int from seasons where id = (select season from pg_temp.ids)),
  0, 'a season starts with no steps taken');
select is(
  admin_apply_development((select season from pg_temp.ids), 1,
    jsonb_build_array(
      pg_temp.change((select id from pg_temp.two where n = 1), 1),
      pg_temp.change((select id from pg_temp.two where n = 2), -1))),
  2, 'a step changes the players it names');
select is((select overall::int from players where id = (select id from pg_temp.two where n = 1)),
  (select overall + 1 from pg_temp.two where n = 1), 'a rating can go up');
select is((select three_point::int from players where id = (select id from pg_temp.two where n = 2)),
  (select three_point - 1 from pg_temp.two where n = 2), 'or down');
select is(
  (select development_steps::int from seasons where id = (select season from pg_temp.ids)),
  1, 'and the season remembers the step');

select is(
  admin_apply_development((select season from pg_temp.ids), 1,
    jsonb_build_array(pg_temp.change((select id from pg_temp.two where n = 1), 5))),
  0, 'a step already taken does nothing');
select is((select overall::int from players where id = (select id from pg_temp.two where n = 1)),
  (select overall + 1 from pg_temp.two where n = 1), 'and changes nothing');

select throws_ok(
  $$select admin_apply_development((select season from pg_temp.ids), 2,
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'overall', 60)))$$,
  '22023', null, 'a player who is not there refuses the whole step');
select is(
  (select development_steps::int from seasons where id = (select season from pg_temp.ids)),
  1, 'and it is not counted as taken');

reset role;
set local role authenticated;
select throws_ok(
  $$select admin_apply_development((select season from pg_temp.ids), 2, '[]'::jsonb)$$,
  '42501', null, 'a signed-in user cannot call it');

select * from finish();
rollback;
