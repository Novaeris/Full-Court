-- Season rules in the league config. Run with: supabase test db
begin;
\ir helpers.psql
\ir owner_helpers.psql

select plan(10);

insert into auth.users (id, aud, role, email)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test');

set local role service_role;
select pg_temp.make_owner_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rules');

create table pg_temp.ids as
select id from public.leagues
where name = 'Rules' and owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
grant all on pg_temp.ids to service_role, authenticated;

select lives_ok(
  $$update leagues set config = config
      || '{"schedule": {"preset": "short", "tiers": {"division": 2, "conference": 2, "interconference": 1}}}'
    where id = (select id from pg_temp.ids)$$,
  'a league can store the schedule its seasons use');

select lives_ok(
  $$update leagues set config = config
      || jsonb_build_object('next', jsonb_build_object(
           'schedule', '{"preset": "long", "tiers": {"division": 4, "conference": 4, "interconference": 2}}'::jsonb,
           'playoffs', config -> 'playoffs'))
    where id = (select id from pg_temp.ids)$$,
  'and rules waiting for the next season');

select throws_ok(
  $$update leagues set config = config
      || '{"schedule": {"preset": "huge", "tiers": {"division": 2, "conference": 2, "interconference": 1}}}'
    where id = (select id from pg_temp.ids)$$,
  '23514', null, 'a schedule preset must be one that exists');

select throws_ok(
  $$update leagues set config = config
      || '{"schedule": {"preset": "custom", "tiers": {"division": 9, "conference": 2, "interconference": 1}}}'
    where id = (select id from pg_temp.ids)$$,
  '23514', null, 'a team can meet another one to eight times');

select throws_ok(
  $$update leagues set config = config
      || '{"schedule": {"preset": "custom", "tiers": {"division": 2, "conference": 2}}}'
    where id = (select id from pg_temp.ids)$$,
  '23514', null, 'every kind of game needs a count');

select throws_ok(
  $$update leagues set config = config || '{"next": {"surprise": true}}'
    where id = (select id from pg_temp.ids)$$,
  '23514', null, 'waiting rules hold a schedule and a playoff format, nothing else');

select throws_ok(
  $$update leagues set config = config
      || jsonb_build_object('next', jsonb_build_object(
           'playoffs', jsonb_set(config -> 'playoffs', '{teams}', '5')))
    where id = (select id from pg_temp.ids)$$,
  '23514', null, 'a waiting playoff format is checked like the real one');

select throws_ok(
  $$update leagues set config = jsonb_set(config, '{playoffs,teams}', '5')
    where id = (select id from pg_temp.ids)$$,
  '23514', null, 'and so is the playoff format in force');

-- The owner can still rename a league that carries these rules.
reset role;
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select lives_ok(
  $$update leagues set name = 'Renamed' where id = (select id from pg_temp.ids)$$,
  'a league with season rules can be renamed');
select is(
  (select name from leagues where id = (select id from pg_temp.ids)),
  'Renamed', 'and the rename sticks');

select * from finish();
rollback;
