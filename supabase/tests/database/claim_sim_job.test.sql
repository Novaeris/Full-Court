-- A worker limited to one league. Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(7);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
-- Other work in this database (the e2e suite leaves queued jobs) must not interfere.
delete from public.sim_jobs;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Mine');
select pg_temp.make_league('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Theirs');
select admin_create_season(pg_temp.league_id('Mine'), 2026, 'standard',
  '{"division": 4, "conference": 3, "interconference": 2}',
  pg_temp.tiny_schedule(pg_temp.league_id('Mine')));
select admin_create_season(pg_temp.league_id('Theirs'), 2026, 'standard',
  '{"division": 4, "conference": 3, "interconference": 2}',
  pg_temp.tiny_schedule(pg_temp.league_id('Theirs')));

reset role;
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select choose_team(pg_temp.league_id('Mine'),
  (select id from teams where league_id = pg_temp.league_id('Mine') order by abbreviation limit 1));
select enqueue_sim_job(pg_temp.league_id('Mine'), 'day');
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select choose_team(pg_temp.league_id('Theirs'),
  (select id from teams where league_id = pg_temp.league_id('Theirs') order by abbreviation limit 1));
select enqueue_sim_job(pg_temp.league_id('Theirs'), 'day');

reset role;
set local role service_role;
select is((select count(*)::int from sim_jobs where status = 'queued'), 2,
  'two leagues each have a queued job');
select is(
  (select league_id from admin_claim_sim_job('only-theirs', pg_temp.league_id('Theirs'))),
  pg_temp.league_id('Theirs'),
  'a worker limited to a league claims that league''s job');
select is((select status from sim_jobs where league_id = pg_temp.league_id('Mine')), 'queued',
  'and leaves the other league''s job queued');
select is(
  (select count(*)::int from admin_claim_sim_job('only-theirs', pg_temp.league_id('Theirs'))),
  0, 'a league with no queued job gives nothing, though another league has one');
select is(
  (select league_id from admin_claim_sim_job('anyone')),
  pg_temp.league_id('Mine'),
  'a worker with no limit still claims the oldest job of any league');
select is((select count(*)::int from admin_claim_sim_job('anyone')), 0, 'and nothing is left');

reset role;
set local role authenticated;
select throws_ok(
  $$select admin_claim_sim_job('hacker', null)$$,
  '42501', null, 'clients cannot claim simulation jobs');

select * from finish();
rollback;
